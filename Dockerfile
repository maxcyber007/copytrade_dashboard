# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# --- dependencies -----------------------------------------------------------
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# --- build ------------------------------------------------------------------
FROM deps AS builder
COPY . .
RUN npx prisma generate
RUN npm run build

# --- web runtime ------------------------------------------------------------
FROM base AS web
ENV NODE_ENV=production
RUN groupadd --gid 1001 nodejs && useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]

# --- worker runtime ---------------------------------------------------------
FROM deps AS worker
ENV NODE_ENV=production
COPY . .
RUN npx prisma generate
CMD ["npx", "tsx", "src/workers/main.ts"]
