# Stage 1: Build
FROM node:22-alpine AS builder

# Install pnpm + build tools
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy manifests first for layer caching
COPY package.json pnpm-lock.yaml* ./

# Bypass minimum-release-age check for Docker build (lockfile already verified by CI)
ENV npm_config_minimum_release_age=0

# Install ALL deps (including dev) for build
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY tsconfig.json tsconfig.worker.json ./
COPY src ./src

# Build TypeScript → dist/
RUN pnpm run build

# Stage 2: Production runtime
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apk add --no-cache wget curl

WORKDIR /app

# Non-root user (security)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package.json pnpm-lock.yaml* ./

ENV npm_config_minimum_release_age=0

# Production deps only — no build tools in runner
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Create data dir with correct ownership
RUN mkdir -p /app/data && chown -R appuser:appgroup /app

USER appuser

# API | Dashboard | Webhooks
EXPOSE 3000 3001 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Entry point
CMD ["node", "dist/app.js"]
