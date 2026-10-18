# 自托管部署（Compose）

隐私优先：数据与 ML 默认留在本机。开发环境默认走此模式。

## 快速开始

```bash
cp .env.example .env
# 编辑 .env：DEPLOY_MODE=selfhost、MinIO 凭据仅本地使用

docker compose up -d
```

## 服务清单（P0）

| 服务 | 端口（默认） | 说明 |
|------|----------------|------|
| postgres | 5432（仅内网） | pgvector 镜像 |
| redis | 6379（仅内网） | BullMQ |
| minio | 9000 API / 9001 控制台 | 对象存储 |
| minio-init | — | 创建 `memora-{env}` 桶 |

应用进程（web / api / worker / ml）在 P0 以本地 `pnpm dev` 或后续 Compose profile 启动；**基础设施**由根目录 `docker-compose.yml` 拉起。

## 安全基线（自托管）

- Postgres / Redis / MinIO **不映射到公网**（仅 `127.0.0.1` 或 Docker 内网）
- 生产请在前置反代（Caddy / Traefik）上强制 HTTPS
- 密钥写在 `.env` 或 Docker secrets，**禁止提交进 Git**
- 附：备份脚本占位见 `backup.sh`（P1 实现逻辑备份）

## 存储

- `STORAGE_BACKEND=minio`（S3 兼容 API）
- 桶名：`memora-{MEMORA_ENV}`，路径见根 README
