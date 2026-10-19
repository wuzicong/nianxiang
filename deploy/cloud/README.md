# 云托管部署

同一套应用，用环境变量换成 **云对象存储 + 托管 PostgreSQL**。不要把仓库里的 Compose Postgres / MinIO 当生产。

**Terraform 只是草稿。禁止 `terraform apply`，也不要在没有主人云账号时创建 AWS / GCP / Azure 资源。** 能跑的检查只有 `terraform fmt` 和 `terraform validate`。说明在 [`terraform/README.md`](terraform/README.md)。

## 最短路径

1. 在密钥库创建变量，字段对照 [`env.cloud.example`](env.cloud.example)（文件里没有真实密钥）。
2. 至少设置：

```bash
DEPLOY_MODE=cloud
MEMORA_ENV=prod
STORAGE_BACKEND=s3
COOKIE_SECURE=true
S3_BUCKET=memora-prod
S3_FORCE_PATH_STYLE=false
PRESIGN_TTL_MINUTES=10
DATABASE_URL=postgresql://...@HOST:5432/memora?sslmode=require
REDIS_URL=rediss://...
```

`COOKIE_SECURE=true` 让会话 Cookie `memora_session`（HttpOnly）带上 Secure。桶保持私有：Block Public Access，禁止匿名 list/get。预签名只签单个对象，TTL 维持在 5–15 分钟。

3. `AWS_KMS_KEY_ID` 可配。生产建议打开 SSE-KMS，并且 KMS 密钥与应用角色分开。
4. 用同一套 web / api / worker / ml 镜像启动。API 会把预签名夹紧到 5–15 分钟；云模式若仍指向 `127.0.0.1`、或 `STORAGE_BACKEND` 不是 `s3`，启动时只告警。

## 安全硬门槛

| 项 | 要求 |
|----|------|
| 原图桶 | Block Public Access；禁止匿名 list/get。不要 public-read |
| Cookie | `COOKIE_SECURE=true`。云上不要关 |
| 预签名 | 5–15 分钟，只签单个对象。不要为了排障拉长 |
| 登录 | 与自托管同一套邮箱密码会话；Cookie 在云模式带 Secure；OIDC 只留挂点 |
| 加密 | SSE-KMS 可配；生产建议开启 |
| CDN | 只缓存衍生图，不缓存原图 |
| IAM | API 角色只读写 `users/*`、`albums/*`、`templates/*`，禁止 `*` |
| 分享 | 链接令牌只存哈希；可设过期、可立即撤销。密码可选，只存 scrypt，不回显 |
| 运维 | 默认不能读原图；排障要审批、短时授权和审计 |
| 备份 | 加密备份 |
| 密钥 | Secret Manager / KMS；不进仓库、不进镜像 |

策略示意（不会被本仓库自动套用）：[`s3-bucket-policy.hcl.example`](s3-bucket-policy.hcl.example)。

Terraform 草稿：[`terraform/README.md`](terraform/README.md)。里面没有后端状态，也没有访问密钥。**禁止 apply。** `allow_apply` 默认 `false`，计划阶段就会停住。Postgres、Redis、HTTPS 入口默认不进计划；自管时继续用 `compose.prod.yml`。

素材、登录和相册表由应用第一次访问数据库时创建（`packages/storage/migrations/001_assets.sql`、`002_auth.sql`、`003_albums.sql`），不放进这份云骨架。生产编排（K8s 或单机进程）仍由部署环境负责。分享令牌只存哈希；可选密码只存 scrypt。撤销后公开读取立即 404。`SHARE_REQUIRE_PASSWORD=true` 时，之后新建的分享必须带密码。应用自己的日志不会打印明文 token 或密码。公网反代仍要打码 `/s/` 和 `/api/v1/public/shares/`，限制解锁频率，并且不要记录 `POST .../unlock` 的正文。片段和接法在自托管说明的[公网反代](../self-host/README.md#公网反代)。云负载均衡若自己写访问日志，路径里的令牌也会留下，关掉这份日志，或在入库前打码。

`DATABASE_URL` 里的 `sslmode=require` 会走 TLS，但不校验服务器证书。要校验 CA 时用 `sslmode=verify-full`。
