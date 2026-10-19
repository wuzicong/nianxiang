#!/bin/sh
# Docker 会把 HOSTNAME 设成容器 ID。Next standalone 用它当监听地址时，
# 宿主机上 127.0.0.1:3000 的端口映射进不来。这里只改这个进程的 HOSTNAME。
# 宿主机绑定仍然是 compose 里的 127.0.0.1，不要改成 0.0.0.0。
set -eu
export HOSTNAME=0.0.0.0
export PORT="${PORT:-3000}"
cd /app
if [ ! -f apps/web/server.js ]; then
  echo "memora-web: missing apps/web/server.js" >&2
  ls -la >&2 || true
  ls -la apps/web >&2 || true
  exit 1
fi
exec node apps/web/server.js
