# syntax=docker/dockerfile:1
#
# iskole web (Next.js, standalone output). Build from the REPO ROOT:
#   docker build -f apps/web/Dockerfile --build-arg API_INTERNAL_URL=http://iskole-api:8004 -t iskole-web .
#
# API_INTERNAL_URL is a BUILD argument, not just a runtime variable: next.config.ts rewrites
# are resolved at build time, so the /api proxy target is baked into the image. If the
# argument is missing, the proxy points at localhost inside the container and every /api call
# (including sign-in) fails.
#
# The build downloads Montserrat and Cabin from Google Fonts (next/font/google), so the
# build host needs internet access. The running container does not.

ARG NODE_VERSION=24
ARG PNPM_VERSION=12.14.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "@iskole/web..."

FROM deps AS build
ARG API_INTERNAL_URL=http://iskole-api:8004
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
# apps/web/public may not exist in the repo; standalone copy below expects the folder.
RUN mkdir -p apps/web/public
RUN pnpm --filter @iskole/web build

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3004 \
    HOSTNAME=0.0.0.0
WORKDIR /app

# With outputFileTracingRoot set to the repo root, the standalone server lives at
# apps/web/server.js and static assets must sit next to it under apps/web/.next/static.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public

USER node
EXPOSE 3004
HEALTHCHECK --interval=15s --timeout=5s --start-period=25s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3004)+'/',{redirect:'manual'}).then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "apps/web/server.js"]