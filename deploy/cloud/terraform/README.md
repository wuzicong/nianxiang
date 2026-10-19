# 云资源 Terraform 草稿

**草稿 only。禁止 `terraform apply`、`terraform destroy`、`terraform import`。** 等主人自己的云账号，不要在 CI、代理机器或别人的账号上创建资源。

这个目录没有后端状态，没有访问密钥，也没有会自动执行的流水线。`./terraform.sh` 会直接拒绝 apply / destroy / import。配置里的 `allow_apply` 默认是 `false`：这时 `terraform plan` 也会在计划阶段失败，不会向 AWS 提交变更。

`terraform fmt` 和 `terraform validate` 不需要云凭证。

## 草稿里有什么

| 块 | 默认 | 内容 |
|----|------|------|
| 对象存储 | 总是在配置里，但仍被草稿锁挡住 | 私有桶 `memora-${environment}`、Block Public Access、禁止 ACL、版本控制、拒绝明文传输和匿名读。可选 SSE-KMS |
| Postgres | `enable_managed_postgres=false` | 私有子网、不公开、加密盘、保留 7 天备份、删除保护。需要账号提供 `vector` 扩展 |
| Redis | `enable_managed_redis=false` | 传输加密和静态加密，AUTH，不保留队列快照 |
| HTTPS 入口 | `enable_https_ingress=false` | 80 跳到 443、TLS 1.3 策略、ACM DNS 验证。不建 Route53，不注册目标，不建 ECS |
| IAM | 只输出 JSON | API / Worker 只读写 `users/*`、`albums/*`、`templates/*`。不在这里创建角色 |

原图前缀 `users/*/originals/*` **不要**挂到 CDN。CDN 只缓存 `users/*/derivatives/*`。负载均衡不要开访问日志，除非先把路径里的分享令牌打掉。打码方式见自托管说明的[公网反代](../../self-host/README.md#公网反代)。

没有主人账号、或者账号里还没有 VPC 时，继续用仓库根目录的 `compose.prod.yml` 自管 Postgres、Redis、MinIO 和 Caddy。不要把这份草稿 apply 出去顶替它。

素材、登录和相册表由应用第一次访问数据库时创建，不放进这份骨架。

## 现在可以跑的检查

在本目录：

```bash
./terraform.sh fmt -check -recursive
./terraform.sh init -backend=false
./terraform.sh validate
```

`init` 只下载 provider。不要把 `.terraform/` 或 `.terraform.lock.hcl` 提交（仓库已忽略）。不要把 `terraform plan` 的输出提交回仓库。

确认包装脚本会拒绝 apply：

```bash
./terraform.sh apply
```

退出码应非 0，并且没有云端变更。

## 主人账号就绪之后

仍然不要在这个仓库的自动化里 apply。主人在自己的环境里：

1. 把 `terraform.tfvars.example` 复制为未提交的 `terraform.tfvars`，或使用 `TF_VAR_*`。口令只用 `TF_VAR_db_password` 和 `TF_VAR_redis_auth_token`。
2. 对照该区域当时可创建的引擎版本，改 `postgres_engine_version` 和 `redis_engine_version`。
3. 确认 Postgres 16 能 `CREATE EXTENSION vector`。不能就保持 `enable_managed_postgres=false`，继续自管 `pgvector/pgvector:pg16`。
4. 需要预览时，在未提交的 tfvars 里把 `allow_apply` 设为 `true`，然后单独跑 `terraform plan`。`./terraform.sh` 仍然拒绝 apply。
5. 真正要创建资源时，先改这份草稿的锁（包装脚本和 `allow_apply`），单独评审，再用主人自己的凭证执行。那一步不在本仓库的默认流程里。

应用侧环境变量见 [`../env.cloud.example`](../env.cloud.example)。`COOKIE_SECURE=true`，桶保持私有，`PRESIGN_TTL_MINUTES` 保持在 5–15。
