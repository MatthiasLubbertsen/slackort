FROM node:20-bookworm-slim

# better-sqlite3 needs a native build toolchain if no prebuilt binary matches this image
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# The dashboard is a separate Vite/React project, built to static files and
# served by the bot's own web server (see src/web/server.ts).
COPY dashboard ./dashboard
RUN cd dashboard && npm ci && npm run build

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV DB_PATH=/app/data/hestia.db

EXPOSE 7777 7778

CMD ["node", "dist/index.js"]
