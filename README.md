# Recall — AI-Powered Personalized Learning and Assessment System

A full-stack study tool: upload lecture material (PDF/DOCX/PPTX/TXT), it gets
processed by a local, free/open-source AI pipeline, and turned into quizzes
that track your weak topics and build a revision schedule automatically.

**No paid AI APIs anywhere in this stack.** No OpenAI, no Claude API, no
Gemini. Every "AI" feature runs locally using free, open-source
libraries — see [How the AI Layer Actually Works](#how-the-ai-layer-actually-works)
for exactly what's a real model vs. a heuristic, stated plainly so this is
easy to explain honestly in a project defense.

---

## Project structure

```
project-root/
├── backend/         Node.js + Express + MongoDB/Mongoose API
├── ai-service/       Python FastAPI microservice (document processing, question generation)
└── frontend/         HTML/CSS/vanilla JS — no build step, no framework
```

---

## Quick start

You need three things running at once: MongoDB, the AI microservice, and
the Node backend. The frontend is static files served by any simple HTTP
server.

### 1. MongoDB

Install MongoDB Community Edition locally, or use MongoDB Atlas (free tier).

**Local (Ubuntu/Debian):**
```bash
# Follow MongoDB's official install guide for your OS — the exact steps
# vary by Ubuntu version. As of writing:
# https://www.mongodb.com/docs/manual/administration/install-on-linux/
sudo systemctl start mongod
```

**Local (macOS with Homebrew):**
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Or use Atlas** (no local install): create a free cluster at
https://www.mongodb.com/cloud/atlas, get your connection string, and use
that as `MONGO_URI` in the next step instead of the local one.

Verify it's running:
```bash
mongosh --eval "db.runCommand({ ping: 1 })"
```

### 2. AI microservice (Python)

```bash
cd ai-service
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Verify it's running: open http://127.0.0.1:8000/health — you should see
`{"success":true,"message":"AI service is healthy"}`.

### 3. Backend (Node.js)

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:
- Set `MONGO_URI` to your local or Atlas connection string.
- Set `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` to two different long
  random strings (32+ characters). Generate one quickly with:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Leave `AI_SERVICE_URL` as `http://127.0.0.1:8000` if you followed step 2
  as-is.

```bash
npm run dev      # nodemon, restarts on file changes
# or
npm start        # plain node
```

Verify it's running: open http://localhost:5000/api/health.

### Setting up email (for password reset)

By default, `forgot-password` works without any email setup — it logs to
the console and returns the reset token directly in the API response
(local dev only; this is disabled once `EMAIL_USER`/`EMAIL_PASS` are set,
or in production). To send real emails:

1. On your Google account: Security → turn on **2-Step Verification**.
2. Security → **App Passwords** → create one (name it anything, e.g. "Recall").
3. Google gives you a 16-character password. In `backend/.env`, set:
   ```
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your.email@gmail.com
   EMAIL_PASS=the16charapppassword
   EMAIL_FROM="Recall <your.email@gmail.com>"
   ```
4. Restart the backend. `forgot-password` will now actually send a reset
   email instead of returning the token in the API response.

Gmail's free tier caps at 500 emails/day, plenty for a project like this.
If you outgrow it, [Brevo](https://www.brevo.com) (300/day free, no
personal-account risk) is a drop-in replacement — just change
`EMAIL_HOST`/`EMAIL_PORT` to Brevo's SMTP endpoint and use your Brevo
SMTP key as `EMAIL_PASS`; `backend/services/email.service.js` doesn't
need to change.

### 4. Frontend (static files)

The backend's CORS is locked to `FRONTEND_URL` (default
`http://localhost:3000`), so serve the frontend on port 3000 to match.
Opening the HTML files directly via `file://` will NOT work — the browser
sends `Origin: null`, which the backend's CORS will reject.

```bash
cd frontend
python3 -m http.server 3000
# or: npx serve -l 3000
```

Open http://localhost:3000/index.html in your browser.

If you serve the frontend from a different port, update
`FRONTEND_URL` in `backend/.env` to match, and
`window.APP_CONFIG.API_BASE_URL` in `frontend/assets/js/config.js` if you
also change the backend's port.

---

## Testing

Automated tests exist for everything that doesn't require a live MongoDB
connection (see [Known Limitations](#known-limitations-read-this) for why):

```bash
cd backend
npm test
```

This runs 44 tests: model schema validation, JWT/bcrypt logic, auth-gating
on every protected route, input validation, rate limiting, upload
validation, and — importantly — real **unit tests for the grading, weak-topic
detection, revision scheduling, and streak logic** (all pure functions,
fully exercised with no mocking needed).

The AI microservice was tested by actually running it and sending real
HTTP requests with real PDF/DOCX/PPTX files — see
[How the AI Layer Actually Works](#how-the-ai-layer-actually-works) below.

---

## Architecture

### Request flow

```
Browser (frontend/)
   |  fetch() with JWT access token + credentials:include
   v
Node/Express backend (backend/)
   |  Mongoose ----------------> MongoDB
   |  internal HTTP only
   v
Python FastAPI AI service (ai-service/)
   |
   v
Local FAISS index files (ai-service/vector_stores/)
```

The AI service is **never called directly by the browser** — only the Node
backend talks to it, over `AI_SERVICE_URL` (default
`http://127.0.0.1:8000`). This keeps document-processing internals off the
public API surface and lets the AI service trust its caller.

### Auth

- Access tokens: short-lived JWT (15 min default), sent as `Authorization: Bearer`, stored in `localStorage` on the frontend.
- Refresh tokens: longer-lived JWT (7 days default), stored in an **httpOnly cookie**, never touched by frontend JS. A `refresh_token_version` counter on the User model lets logout / password-reset invalidate all outstanding refresh tokens at once.
- The frontend's `Api` client (`frontend/assets/js/api.js`) automatically retries once on a 401 by calling `/auth/refresh`, before giving up and redirecting to login.

### Data flow: upload -> quiz

1. `POST /api/materials` (multipart) — Node validates MIME + extension + size, stores the file under a **randomized filename** (never the user's original filename), creates a `Material` record with `status: 'uploaded'`.
2. Node responds immediately, then processes in the background (`setImmediate`) — this is what powers the polling-based progress UI.
3. Background job calls the AI service's `/process-document`: extract -> clean -> chunk -> embed -> detect topics -> summarize. Chunks go to MongoDB (`MaterialChunk`), vectors go to a local FAISS file, `Embedding` documents store only the *pointer* to that file (never raw vectors in Mongo).
4. Material status flips to `analyzed` (or `failed`, with `error_message` set).
5. `POST /api/quizzes` calls the AI service's `/generate-questions` against the material's chunks, creates `Question` documents with `correct_answer`/`explanation` stored server-side only.
6. Taking a quiz: `GET /api/quizzes/:id/questions` strips `correct_answer`/`explanation` before sending to the browser. Grading happens entirely server-side on submit.

---

## How the AI layer actually works

Stated plainly, because a project defense should not have to guess this:

| Feature | Spec's stretch goal | What's actually implemented | Why |
|---|---|---|---|
| Text extraction | PyMuPDF/pdfplumber | Exactly this — real, tested against real PDF/DOCX/PPTX files | No issue — these are plain local libraries |
| Cleaning | Rule-based | Rule-based (hyphenation fix, boilerplate stripping) | This was never meant to be a model |
| Chunking | Rule-based, overlapping | Sentence-aware overlapping chunker | Rule-based by design |
| **Embeddings** | sentence-transformers (`all-MiniLM-L6-v2`) | **TF-IDF + Truncated SVD** (classical NLP, not a neural model) | `all-MiniLM-L6-v2`'s weights download from the HuggingFace Hub at runtime — this needs internet access to `huggingface.co`, which may not always be available. TF-IDF+SVD needs zero external downloads and is a legitimate, explainable technique (a form of Latent Semantic Analysis), just not a neural embedding. |
| Vector storage | FAISS | Real FAISS (`IndexFlatIP` on L2-normalized vectors), fully local | No compromise here — this part is exactly per spec |
| Topic detection | scikit-learn TF-IDF | Exactly this — KMeans over TF-IDF vectors | No compromise |
| **Question generation** | HuggingFace Transformers, FLAN-T5-small | **Rule-based/heuristic** (TF-IDF keyword extraction + sentence-pattern matching) | Same reason as embeddings — FLAN-T5-small's weights also come from the HuggingFace Hub. The heuristic generator is real, explainable NLP (not random templating), but it is not a language model. |

**If you have HuggingFace access on your own machine** (most people do —
this project was built in a network-sandboxed environment that couldn't
reach `huggingface.co`), upgrading is straightforward:

```bash
pip install sentence-transformers transformers torch
```

Then in `ai-service/app/services/embedding.py`, replace the TF-IDF+SVD
logic with:
```python
from sentence_transformers import SentenceTransformer
model = SentenceTransformer('all-MiniLM-L6-v2')
vectors = model.encode(chunk_texts, normalize_embeddings=True)
```
The FAISS indexing code in `vector_store.py` needs no changes — it works
with any fixed-dimension float vector.

For question generation, `app/services/question_generation.py` would need
its rule-based sentence transforms replaced with FLAN-T5 prompts, e.g.:
```python
from transformers import pipeline
generator = pipeline('text2text-generation', model='google/flan-t5-small')
question = generator(f"generate a question about: {chunk_text}")
```

---

## Known limitations (read this)

This was built and tested in a sandboxed environment with a **restricted
network allowlist** (no access to `huggingface.co`, no MongoDB binary
available to install/run locally in that sandbox). This shaped two things
directly:

1. **AI models are heuristic, not neural**, as described above — this
   is an environment constraint, not a design preference, and upgrading
   is documented above.
2. **The DB-backed success paths were not tested against a live MongoDB**,
   because no MongoDB instance could be run in that build environment.
   What *was* verified for real:
   - All 15 Mongoose schemas load and validate correctly.
   - JWT signing/verification and bcrypt hashing, exercised directly.
   - Every protected route correctly rejects unauthenticated/invalid
     requests (auth-gating tested end-to-end over real HTTP).
   - All input validation (bad email, weak password, oversized file,
     wrong MIME type, etc.) tested over real HTTP.
   - Rate limiting tested by actually exceeding the limit and observing
     a 429.
   - **The AI service was tested for real** — actual PDF/DOCX/PPTX files
     were processed end-to-end (extraction -> cleaning -> chunking ->
     embedding -> FAISS indexing -> topic detection -> summarization ->
     question generation), over real HTTP, including error cases
     (corrupted files, empty files, missing files).
   - **The full pipeline was integration-tested end-to-end** using the
     live AI service plus the real grading/weak-topic/revision logic:
     a document was processed, questions generated, simulated answers
     graded, and a weak-topic + revision schedule correctly computed —
     all with real code, not mocks.
   - What was **not** verified live: actually persisting a User, Course,
     Material, Quiz, etc. to MongoDB and reading it back. The code paths
     are written and reviewed carefully, but you should run
     `npm test` plus manual smoke-testing against your own MongoDB
     instance before treating this as production-verified.
3. **Frontend was tested via jsdom + a real static HTTP server**, not a
   real browser (headless Chromium couldn't be downloaded in the sandboxed
   build environment). Every page was loaded and executed for real,
   including a fully mocked-API run-through of the dashboard that
   confirmed rendering, hash-based routing, and section switching all
   work correctly with zero runtime errors. What jsdom **can't** catch:
   pure visual/CSS issues (spacing, overflow, contrast) — do a visual
   pass once it's running locally in an actual browser.

### Other resolved ambiguities

- The spec's folder structure lists `dashboard.html`, `upload.html`,
  `courses.html`, `quiz.html`, `results.html` but the sidebar calls for
  more sections (Quiz History, Wrong Questions Review, Weak Topics,
  Revision Schedule, Study Streak, Settings) than there are files. These
  live as hash-routed sections inside `dashboard.html`
  (`dashboard.html#history`, `#wrong`, `#weak`, `#revision`, `#streak`,
  `#settings`) rather than separate files, since the folder structure was
  explicit about the file list.
- "Chapter" scope for quiz generation is approximated via topic labels
  (`source_scope: 'chapter'` maps to the AI service's detected topics)
  rather than true document-structure parsing (chapter headings aren't
  reliably extractable across arbitrary PDF/DOCX/PPTX layouts) — see the
  comment in `backend/services/quizGeneration.service.js`.
- Short-answer grading uses a keyword-overlap heuristic (documented in
  `backend/utils/grading.js`), not true semantic similarity — this is a
  known simplification, not an oversight.

---

## Deployment notes

This wasn't deployed as part of the build (three separate services with
a database is a lot to stand up in a sandboxed build environment), but
here's the shape of it:

- **MongoDB**: MongoDB Atlas free tier is the easiest path — no server to
  manage. Update `MONGO_URI` accordingly.
- **AI service**: any host that can run a Python/FastAPI app works
  (Render, Railway, a small VPS). It needs no GPU and modest RAM
  (a few hundred MB) since it's running classical ML, not a neural model.
  Keep it on a private network / bind it away from the public internet —
  it has no auth of its own and trusts whatever calls it.
- **Backend**: Render, Railway, Fly.io, or a VPS all work fine for a
  standard Node/Express app. Set all the `.env` variables in your host's
  environment/secrets manager rather than committing a `.env` file.
  Set `AI_SERVICE_URL` to the AI service's private/internal URL.
- **Frontend**: this is static files — Netlify, Vercel (static), GitHub
  Pages, or just serve `frontend/` from the same Node process with
  `express.static()` if you'd rather not run a fourth thing. Update
  `frontend/assets/js/config.js`'s `API_BASE_URL` to point at your
  deployed backend, and `FRONTEND_URL` in the backend's env to match
  wherever the frontend ends up living (for CORS).
- **File uploads in production**: `backend/uploads/` is local disk, which
  doesn't survive redeploys on most PaaS platforms. For real production
  use, swap the multer disk storage for something like S3-compatible
  object storage — `backend/middleware/upload.middleware.js` is the only
  file that would need to change.

---

## Tech stack summary

| Layer | Stack |
|---|---|
| Frontend | HTML5, CSS3, vanilla JS (no framework), Chart.js (CDN) |
| Backend | Node.js, Express, Mongoose |
| Database | MongoDB |
| Auth | JWT (access + refresh), bcrypt |
| Email | Nodemailer (Gmail SMTP by default, any SMTP provider works) |
| AI service | Python, FastAPI, scikit-learn, FAISS, PyMuPDF/pdfplumber, python-docx, python-pptx |
| AI models | TF-IDF + SVD (embeddings), KMeans (topics), rule-based (question generation) — see [How the AI Layer Actually Works](#how-the-ai-layer-actually-works) |
