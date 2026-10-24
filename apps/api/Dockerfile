# ---- Stage 1: builder ----
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/package.json

RUN pnpm install --frozen-lockfile

COPY apps/api ./apps/api

WORKDIR /app/apps/api
RUN npx prisma generate && pnpm build

# ---- Stage 2: runtime ----
FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl chromium nss freetype freetype-dev harfbuzz ca-certificates ttf-freefont

ENV NODE_ENV=production PUPPETEER_SKIP_DOWNLOAD=true PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder --chown=app:app /app/apps/api/dist ./dist
COPY --from=builder --chown=app:app /app/apps/api/package.json ./package.json
COPY --from=builder --chown=app:app /app/apps/api/prisma ./prisma
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/apps/api/node_modules ./apps/api/node_modules

USER app

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
