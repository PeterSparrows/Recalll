#!/bin/sh
# Starts both the AI service (Python/FastAPI, background) and the backend
# (Node/Express, foreground) inside the single combined Render container.
#
# Render only health-checks the backend (the port it's told to route to),
# so if the AI service dies silently the container would otherwise look
# "healthy" while quizzes/uploads fail. The background watcher below kills
# the whole container if the AI service process exits, so Render's health
# check fails fast and restarts the container instead of leaving it half-broken.

set -e

echo "[start.sh] Launching AI service (uvicorn) on 127.0.0.1:8000 ..."
cd /app/ai-service
uvicorn app.main:app --host 127.0.0.1 --port 8000 &
AI_PID=$!

# Watcher: if the AI service process dies, bring down the whole container.
(
  while kill -0 "$AI_PID" 2>/dev/null; do
    sleep 2
  done
  echo "[start.sh] AI service process ($AI_PID) exited — stopping container."
  kill 0
) &

echo "[start.sh] Waiting for AI service to become healthy ..."
i=0
until wget -q -O /dev/null http://127.0.0.1:8000/health 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "[start.sh] AI service did not become healthy after 30s — continuing anyway."
    break
  fi
  sleep 1
done
echo "[start.sh] AI service check done after ${i}s."

echo "[start.sh] Starting backend (node server.js) in foreground ..."
cd /app/backend
exec node server.js