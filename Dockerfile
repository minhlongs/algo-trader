# Stage 1: Build
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy manifests first for layer caching
COPY package.json pnpm-lock.yaml* ./

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY tsconfig.json ./
# scripts/ is deliberately excluded by .dockerignore and not needed here:
# "build" is plain tsc, and pnpm does not auto-run the npm prebuild hook.
COPY src ./src

# Call tsc directly: "pnpm run build" auto-runs the prebuild hook
# (scripts/pre-build-check.sh), which is excluded from the image context.
# The disk check is a host pre-flight and has no meaning in a container.
RUN pnpm exec tsc

# Stage 2: Production runtime
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package.json pnpm-lock.yaml* ./

# Production deps only (ignore scripts — no build tools in runner)
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --from=builder /app/dist ./dist

# Create data dir with correct ownership
RUN mkdir -p /app/data && chown -R appuser:appgroup /app

USER appuser

# API | Dashboard | Webhooks
EXPOSE 3000 3001 3002

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/app.js"]
