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

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV DB_PATH=/app/data/slackort.db

CMD ["node", "dist/index.js"]
