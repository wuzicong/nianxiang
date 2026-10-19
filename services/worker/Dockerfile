# syntax=docker/dockerfile:1
# 生产镜像。开发仍用 pnpm dev:worker。sharp 使用 alpine 的 musl 预编译包。

FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    CI=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
RUN pnpm config set store-dir /pnpm/store

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY services/worker/package.json services/worker/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @memora/shared build \
    && pnpm --filter @memora/storage build \
    && pnpm --filter @memora/worker build \
    && pnpm --filter @memora/worker deploy --prod /out/worker

FROM node:22-alpine AS runtime
RUN apk add --no-cache libc6-compat \
    && addgroup -S -g 1001 memora \
    && adduser -S -u 1001 -G memora memora
WORKDIR /app
COPY deploy/self-host/docker-entrypoint.sh /usr/local/bin/memora-entrypoint
RUN chmod 755 /usr/local/bin/memora-entrypoint
COPY --from=build --chown=memora:memora /out/worker /app
USER memora
ENV NODE_ENV=production
EXPOSE 3002
ENTRYPOINT ["memora-entrypoint"]
CMD ["node", "dist/index.js"]
