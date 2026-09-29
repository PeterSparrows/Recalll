/**
 * Stage 1 smoke tests — everything here is testable WITHOUT a live
 * MongoDB connection: health check, 404 handling, input validation,
 * JWT auth middleware rejection paths, and rate limiting.
 *
 * Routes that actually hit the database (successful register/login)
 * are exercised separately once a real MongoDB instance is available
 * — see README "Testing" section.
 */
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../server');

test('GET /api/health returns 200 and healthy status', async () => {
  const res = await request(app).get('/api/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
});

test('GET /api/does-not-exist returns 404 with clear message', async () => {
  const res = await request(app).get('/api/does-not-exist');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.success, false);
});

test('POST /api/auth/register rejects invalid email', async () => {
  const res = await request(app).post('/api/auth/register').send({
    full_name: 'Peter Okafor',
    email: 'not-an-email',
    password: 'password123',
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.success, false);
  const fields = res.body.details.map((d) => d.field);
  assert.ok(fields.includes('email'));
});

test('POST /api/auth/register rejects short password', async () => {
  const res = await request(app).post('/api/auth/register').send({
    full_name: 'Peter Okafor',
    email: 'peter@example.com',
    password: 'short1',
  });
  assert.strictEqual(res.status, 400);
  const fields = res.body.details.map((d) => d.field);
  assert.ok(fields.includes('password'));
});

test('POST /api/auth/register rejects password with no digit', async () => {
  const res = await request(app).post('/api/auth/register').send({
    full_name: 'Peter Okafor',
    email: 'peter@example.com',
    password: 'nopedigithere',
  });
  assert.strictEqual(res.status, 400);
});

test('POST /api/auth/login rejects missing password', async () => {
  const res = await request(app).post('/api/auth/login').send({ email: 'peter@example.com' });
  assert.strictEqual(res.status, 400);
});

test('GET /api/auth/me without a token returns 401', async () => {
  const res = await request(app).get('/api/auth/me');
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.success, false);
});

test('GET /api/auth/me with a garbage token returns 401', async () => {
  const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer garbage.token.value');
  assert.strictEqual(res.status, 401);
});

test('POST /api/auth/logout without a token returns 401 (auth required)', async () => {
  const res = await request(app).post('/api/auth/logout');
  assert.strictEqual(res.status, 401);
});

test('NoSQL injection payload in login body is sanitized, not crashing the server', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: { $gt: '' }, password: { $gt: '' } });
  // express-validator's isEmail will reject the sanitized (stripped) value;
  // the key point is the server responds cleanly, it doesn't throw/crash.
  assert.ok([400, 401].includes(res.status));
});

test('Rate limiter engages after exceeding AUTH_RATE_LIMIT_MAX_REQUESTS', async () => {
  // Rate limiter middleware runs before the validator, so an invalid
  // payload still counts toward the limit without ever reaching the
  // DB-backed controller (no live Mongo in this sandbox).
  const max = Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS) || 10;
  let lastStatus;
  for (let i = 0; i < max + 3; i++) {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
    lastStatus = res.status;
  }
  assert.strictEqual(lastStatus, 429);
});
