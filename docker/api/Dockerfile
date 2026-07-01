# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS deps
WORKDIR /app

RUN set -eux; \
  apt-get update; \
  apt-get install -y --no-install-recommends ca-certificates openssl; \
  rm -rf /var/lib/apt/lists/*; \
  corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-dto/package.json packages/shared-dto/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS builder
WORKDIR /app

COPY packages/shared-dto packages/shared-dto
COPY apps/backend apps/backend

RUN pnpm --filter @smart-dms/shared-dto build
RUN DATABASE_URL="postgresql://smart_dms:smart_dms@postgres:5432/smart_dms?schema=public" pnpm --filter backend prisma:generate
RUN pnpm --filter backend build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app/apps/backend

ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME/bin:$PNPM_HOME:$PATH

RUN set -eux; \
  apt-get update; \
  apt-get install -y --no-install-recommends ca-certificates openssl; \
  rm -rf /var/lib/apt/lists/*

RUN mkdir -p "$PNPM_HOME" && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /app/
COPY apps/backend/package.json /app/apps/backend/package.json
COPY apps/web/package.json /app/apps/web/package.json
COPY packages/shared-dto/package.json /app/packages/shared-dto/package.json

ARG PRISMA_VERSION
RUN if [ -n "$PRISMA_VERSION" ]; then \
    test "$(node -p "require('/app/apps/backend/package.json').dependencies.prisma")" = "$PRISMA_VERSION"; \
  fi

RUN pnpm install --prod --frozen-lockfile --filter backend --filter @smart-dms/shared-dto && \
  pnpm store prune

COPY --from=builder /app/packages/shared-dto/dist /app/packages/shared-dto/dist
COPY --from=builder /app/apps/backend/dist /app/apps/backend/dist
COPY --from=builder /app/apps/backend/prisma /app/apps/backend/prisma
COPY --from=builder /app/apps/backend/prisma.config.ts /app/apps/backend/prisma.config.ts
COPY --from=builder /app/apps/backend/scripts /app/apps/backend/scripts

RUN DATABASE_URL="postgresql://smart_dms:smart_dms@postgres:5432/smart_dms?schema=public" ./node_modules/.bin/prisma generate

RUN mkdir -p /data/storage /data/scanner-import; \
  chown -R node:node /app /data

USER node
EXPOSE 3010

CMD ["node", "dist/src/main.js"]
