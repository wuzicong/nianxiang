# 自托管部署（Compose）

隐私优先：数据和 ML 默认留在本机。开发环境走这条路径。也可以把 `STORAGE_BACKEND` 改成 `s3`，只挂你自己的云桶，应用仍跑在本机。

## 最短路径

在仓库根目录：

```bash
cp .env.example .env
docker compose up -d
docker compose ps
```

`.env` 里保持：

```bash
DEPLOY_MODE=selfhost
MEMORA_ENV=local
STORAGE_BACKEND=minio
S3_BUCKET=memora-local
```

`DATABASE_URL` 的口令要和 `POSTGRES_PASSWORD` 相同；`S3_SECRET_ACCESS_KEY` 要和 `MINIO_ROOT_PASSWORD` 相同。模板里的 `memora-dev-change-me` 只给本机用。

## 服务

| 服务 | 地址 | 说明 |
|------|------|------|
| postgres | `127.0.0.1:5432` | pgvector |
| redis | `127.0.0.1:6379` | BullMQ，AOF |
| minio | `127.0.0.1:9000` / 控制台 `9001` | 对象存储 |
| minio-init | 一次性 | 建桶并 `anonymous set none` |
| ml | `127.0.0.1:8000/health` | 推理桩 |

web / api / worker 用 `pnpm dev:*` 起。不要把 5432、6379、9000、9001 改绑到 `0.0.0.0`。

API 第一次访问会建 `users` / `sessions` 表。第一次使用相册或分享时再建 `albums` / `album_assets` / `shares`（分享只存令牌哈希）。登录是邮箱加密码，会话 Cookie 名为 `memora_session`（HttpOnly）。本机 HTTP 不加 Secure；放到公网 HTTPS 前把 `COOKIE_SECURE=true`。页面入口是 `http://127.0.0.1:3000/login`，分享页是 `http://127.0.0.1:3000/s/<token>`。

## 安全

- 公网只经过 Caddy / Traefik，强制 HTTPS
- 防火墙只开放 443（SSH 按你自己的跳板策略）
- 密钥放 `.env` 或 Docker secrets，禁止提交
- 做好系统更新、磁盘告警；单盘有坏盘和停电风险，备份请放到另一块盘或另一台机器
- 备份：`deploy/self-host/backup.sh` 读取环境变量做 `pg_dump` 和 `mc mirror`，不把口令写进日志。需要本机有 `pg_dump` 和 `mc`。

## 存储

桶名 `memora-${MEMORA_ENV}`。对象键：

```text
users/{userId}/originals/{assetId}
users/{userId}/derivatives/{assetId}/{thumb|preview|hero}.webp
```

`minio-init` 会 `mc anonymous set none`。匿名拒绝的策略意图写在 `bucket-policy.json`，init **不会**把这份 Deny 套到桶上，避免误伤根用户。同一组固定镜像里 `mc cors set` 可能打印未实现的警告；`curl` 上传不依赖 CORS。浏览器从 3000 跨域 PUT 时，要在反代上加 CORS，或换更新的 MinIO。

素材表在 API 或 Worker 第一次连上 Postgres 时创建，SQL 见 `packages/storage/migrations/001_assets.sql`。

上传验证见仓库根 README 的「本地验证上传」。
