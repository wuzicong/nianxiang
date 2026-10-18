# 云托管部署

同一套应用镜像，通过环境变量切换为 **云对象存储 + 托管 PostgreSQL**。

## 环境变量

复制仓库根目录 `.env.example`，并参考 `env.cloud.example`：

- `DEPLOY_MODE=cloud`
- `STORAGE_BACKEND=s3`
- `DATABASE_URL` → 托管 Postgres（含 pgvector）
- `S3_*` → 云厂商 endpoint / region / bucket（**桶须 Block Public Access**）
- `AWS_KMS_KEY_ID`（可选但生产建议）→ SSE-KMS
- `PRESIGN_TTL_MINUTES` → **5–15** 分钟

## 云安全硬门槛（验收）

| 项 | 要求 |
|----|------|
| 原图桶 | 禁止公共读/list；仅 API 角色最小 IAM |
| 预签名 | 默认 5–15 分钟，仅对象级 PUT/GET |
| 加密 | SSE-KMS（密钥与运行时角色分离） |
| CDN | 仅衍生图；**不缓存原图** |
| 分享 | 默认私有；可密码/过期/一键撤销 |
| 运维 | 默认不可读原图；排障需审批 + 审计 |
| 密钥 | KMS / Secret Manager；**不进仓库、不进镜像** |

## IaC 占位

- `s3-bucket-policy.hcl.example` — 私有桶策略示意（按云厂商翻译为 Terraform/Pulumi）
- 生产编排（K8s / 单机）在 P1 起逐步补齐
