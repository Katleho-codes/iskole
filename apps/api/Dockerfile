# syntax=docker/dockerfile:1
#
# iskole API. Build from the REPO ROOT:
#   docker build -f apps/api/Dockerfile --target runtime -t iskole-api .
#   docker build -f apps/api/Dockerfile --target migrate -t iskole-migrate .
#
# Targets:
#   runtime  small image: bundled server + production dependencies only, non-root.
#   migrate  one-shot image with the Prisma CLI and seed script. Not long running.

ARG NODE_VERSION=24
ARG PNPM_VERSION=12.14.0

# ---------------------------------------------------------------- base
FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

# ---------------------------------------------------------------- deps (full, for build + migrate)
FROM base AS deps
# Manifests only, so this layer is cached until a dependency actually changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "@iskole/api..."

# ---------------------------------------------------------------- build
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
# The Prisma client is committed (src/generated/prisma), so no `prisma generate` here.
# tsup.config.ts inlines @iskole/shared, which ships TypeScript source.
RUN pnpm --filter @iskole/api build

# ---------------------------------------------------------------- production dependencies only
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --prod --filter "@iskole/api..."

# ---------------------------------------------------------------- migrate (one-shot)
FROM build AS migrate
# Prisma's schema engine needs OpenSSL and CA certificates on Debian slim.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/apps/api
# Never let pnpm re-check or reinstall dependencies at run time (slow, and node_modules is
# root-owned, so it fails as the non-root user).
ENV npm_config_verify_deps_before_run=false
# Download Prisma's migration engine NOW, while node_modules is still writable (we are root).
RUN ./node_modules/.bin/prisma --version
USER node
# DATABASE_URL comes from the environment. prisma.config.ts only loads a .env if one exists.
# Call the binary directly instead of `pnpm exec`.
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

# ---------------------------------------------------------------- runtime
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    API_PORT=8004 \
    UPLOAD_DIR=/data/uploads
WORKDIR /app/apps/api

# Same layout as the repo, so pnpm's symlinks in apps/api/node_modules resolve.
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY apps/api/package.json ./package.json

# Uploads are private files. Pre-create the directory owned by the non-root user so a named
# volume mounted here inherits that ownership.
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node

EXPOSE 8004
HEALTHCHECK --interval=15s --timeout=4s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.API_PORT||8004)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "dist/server.js"]