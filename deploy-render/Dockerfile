# Combined image for Render's free tier: one container running BOTH the
# Node backend and the Python AI microservice as separate processes.
#
# Why one container instead of two Render services: Render's free tier
# gives every service an ephemeral filesystem with no shared/persistent
# disk between services. This app's backend hands the AI service an
# absolute file path (see backend/services/aiService.client.js) rather
# than uploading file contents over HTTP, so the two processes must see
# the same filesystem. Running them in one container solves that for
# free, at the cost of losing horizontal scaling — a fine trade for a
# student project on a free tier.
#
# Build context MUST be the project root (the folder containing
# backend/, ai-service/, frontend/), not this deploy-render/ folder,
# because it needs to COPY from ../backend and ../ai-service.

FROM node:22-bookworm-slim AS base

# --- Python runtime + build tools for the AI service's dependencies ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Backend ---
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev --no-audit --no-fund
COPY backend ./backend

# --- AI service (its own venv, kept separate from system Python) ---
COPY ai-service/requirements.txt ./ai-service/
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -r ai-service/requirements.txt
COPY ai-service/app ./ai-service/app
ENV PATH="/opt/venv/bin:$PATH"

RUN mkdir -p backend/uploads ai-service/vector_stores

COPY deploy-render/start.sh ./start.sh
RUN chmod +x ./start.sh

# Render's free web service only routes traffic to ONE port. The Node
# backend is what's public; the AI service stays internal on 8000,
# reached by the backend at http://127.0.0.1:8000, matching how the
# rest of this app already expects to talk to it.
EXPOSE 5000

CMD ["./start.sh"]
