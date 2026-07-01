# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS builder
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-dto/package.json packages/shared-dto/package.json

RUN pnpm install --frozen-lockfile

COPY packages/shared-dto packages/shared-dto
COPY apps/web apps/web

RUN pnpm --filter @smart-dms/shared-dto build
RUN pnpm --filter web build

FROM nginx:1.27-alpine AS runtime

COPY docker/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist/web/browser /usr/share/nginx/html

EXPOSE 80
