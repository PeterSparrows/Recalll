#!/bin/sh
# Starts the AI service in the background, waits for it to report
# healthy, then starts the Node backend in the foreground (so Docker/
# Render sees the container as "up" for as long as the backend runs).
set -e

echo "[start] Launching AI service..."
cd /app/ai-service
uvicorn app.main:app --host 127.0.0.1 --port 8000 &
AI_PID=$!

echo "[start] Waiting for AI service to become healthy..."
for i in $(seq 1 30); do
  if wget -qO- http://127.0.0.1:8000/health >/dev/null 2>&1; then
    echo "[start] AI service is healthy."
    break
  fi
  if [ "$i" = "30" ]; then
    echo "[start] AI service did not become healthy in time — exiting."
    exit 1
  fi
  sleep 1
done

# If the AI service dies later, bring the whole container down so
# Render's health check (against the backend) fails and restarts it,
# rather than silently running a backend with a dead AI service.
( wait "$AI_PID"; echo "[start] AI service exited — stopping container."; kill 0 ) &

echo "[start] Launching backend..."
cd /app/backend
exec node server.js
