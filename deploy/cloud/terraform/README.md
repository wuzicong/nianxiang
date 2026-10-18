# 云桶 Terraform 骨架

这是 **未应用到任何账号** 的骨架。目录里没有后端状态、没有访问密钥、也没有会自动执行的流水线。`terraform apply` 需要你自己的 AWS 凭证，本仓库不提供。

它会描述：

- 桶名只能是 `memora-local`、`memora-dev`、`memora-staging`、`memora-prod`
- Block Public Access 四项全开
- Bucket owner enforced（禁用 ACL）
- 版本控制打开，便于误删后找回
- 默认加密：未填 `kms_key_arn` 时用 SSE-S3；填了则用该 CMK，并拒绝不是 `aws:kms` 的 PutObject
- 拒绝非 TLS，拒绝匿名读
- 一份 API / Worker 最小 IAM 策略（只覆盖 `users/*`、`albums/*`、`templates/*`），以 output 交出去，不在这里创建角色

原图前缀 `users/*/originals/*` **不要**挂到 CDN。CDN 只缓存 `users/*/derivatives/*`。

素材表不在这里建。API 或 Worker 第一次访问 Postgres 时会执行 [`packages/storage/migrations/001_assets.sql`](../../../packages/storage/migrations/001_assets.sql)。

```bash
cd deploy/cloud/terraform
terraform init
terraform plan -var bucket_name=memora-prod -var kms_key_arn=
```

`kms_key_arn` 留空即可做计划。不要把 plan 输出里的账号细节提交回仓库。
