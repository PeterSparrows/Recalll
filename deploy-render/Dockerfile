FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        gnupg \
        ca-certificates \
        wget \
        libgomp1 \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY ai-service/requirements.txt ./ai-service/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r ai-service/requirements.txt

COPY ai-service/app ./ai-service/app

COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev --no-audit --no-fund

COPY backend ./backend

RUN mkdir -p backend/uploads ai-service/vector_stores

COPY deploy-render/start.sh ./start.sh
RUN chmod +x ./start.sh

EXPOSE 5000

CMD ["./start.sh"]