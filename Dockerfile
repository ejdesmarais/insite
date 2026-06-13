# ── Stage 1: builder ─────────────────────────────────────────────────────────
# Installs all deps, builds the frontend, generates logs, and parses them into
# a seed database that gets baked into the image.

FROM node:24-slim AS builder
WORKDIR /app

# Apply all available Debian security patches before doing anything else
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

# Build the React frontend
RUN npm run build

# Generate synthetic access logs, parse into egain.db, then seed default AI content
RUN node src/log-generator/generate.js
RUN node src/backend/parse.js
RUN node src/backend/seed-ai.js

# ── Stage 2: production ───────────────────────────────────────────────────────
# Lean image — only the four server packages, the built frontend, and the seed DB.

FROM node:24-slim
WORKDIR /app

# Apply all available Debian security patches before doing anything else
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

# Pre-built frontend
COPY --from=builder /app/dist ./dist

# Backend source
COPY --from=builder /app/src/backend ./src/backend

# Seed DB — copied to the persistent volume on first container start
COPY --from=builder /app/src/backend/egain.db ./egain.db.seed

RUN mkdir -p /data

EXPOSE 3082

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
