# 自托管 web / api / worker。构建上下文是仓库根目录。
# 口令只在运行时通过环境变量注入，不写进镜像层。

FROM node:22-bookworm-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1
ENV CI=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @memora/shared build \
  && pnpm --filter @memora/storage build \
  && pnpm --filter @memora/api build \
  && pnpm --filter @memora/worker build \
  && pnpm --filter @memora/web build
RUN mkdir -p /out \
  && pnpm --filter @memora/api deploy --prod /out/api \
  && pnpm --filter @memora/worker deploy --prod /out/worker

FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=5s --timeout=5s --start-period=15s --retries=20 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/main.js"]

FROM node:22-bookworm-slim AS worker
ENV NODE_ENV=production
ENV WORKER_HEALTH_HOST=127.0.0.1
ENV WORKER_HEALTH_PORT=3002
WORKDIR /app
COPY --from=build --chown=node:node /out/worker ./
USER node
HEALTHCHECK --interval=5s --timeout=5s --start-period=20s --retries=20 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3002/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/index.js"]

FROM node:22-bookworm-slim AS web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/templates ./templates
COPY deploy/self-host/web-entrypoint.sh /usr/local/bin/memora-web
USER root
RUN chmod 755 /usr/local/bin/memora-web
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=5s --start-period=20s --retries=20 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["memora-web"]
