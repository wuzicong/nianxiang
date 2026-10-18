# 云托管部署

同一套应用，用环境变量换成 **云对象存储 + 托管 PostgreSQL**。不要把仓库里的 Compose Postgres / MinIO 当生产。

## 最短路径

1. 在密钥库创建变量，字段对照 [`env.cloud.example`](env.cloud.example)（文件里没有真实密钥）。
2. 至少设置：

```bash
DEPLOY_MODE=cloud
MEMORA_ENV=prod
STORAGE_BACKEND=s3
S3_BUCKET=memora-prod
S3_FORCE_PATH_STYLE=false
PRESIGN_TTL_MINUTES=10
DATABASE_URL=postgresql://...@HOST:5432/memora?sslmode=require
REDIS_URL=rediss://...
```

3. `AWS_KMS_KEY_ID` 可配。生产建议打开 SSE-KMS，并且 KMS 密钥与应用角色分开。
4. 用同一套 web / api / worker / ml 镜像启动。API 会把预签名夹紧到 5–15 分钟；云模式若仍指向 `127.0.0.1`、或 `STORAGE_BACKEND` 不是 `s3`，启动时只告警。

## 安全硬门槛

| 项 | 要求 |
|----|------|
| 原图桶 | Block Public Access；禁止匿名 list/get |
| 预签名 | 5–15 分钟，只签单个对象 |
| 加密 | SSE-KMS 可配；生产建议开启 |
| CDN | 只缓存衍生图，不缓存原图 |
| IAM | API 角色只读写 `users/*`、`albums/*`、`templates/*`，禁止 `*` |
| 分享 | 默认私有；密码、过期、一键撤销 |
| 运维 | 默认不能读原图；排障要审批、短时授权和审计 |
| 备份 | 加密备份 |
| 密钥 | Secret Manager / KMS；不进仓库、不进镜像 |

策略示意（不会被本仓库自动套用）：[`s3-bucket-policy.hcl.example`](s3-bucket-policy.hcl.example)。

可计划、但默认不应用的 Terraform 骨架：[`terraform/README.md`](terraform/README.md)。里面没有后端状态，也没有访问密钥。

素材表由应用启动后的第一次数据库访问创建（`packages/storage/migrations/001_assets.sql`），不放进这份云骨架。生产编排（K8s 或单机进程）仍由部署环境负责。

`DATABASE_URL` 里的 `sslmode=require` 会走 TLS，但不校验服务器证书。要校验 CA 时用 `sslmode=verify-full`。
