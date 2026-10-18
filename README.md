# 念册 · Memora

智能照片库 + 主题成册：上传后按时间 / 地点 / 人物 / 场景组织素材，选片套用模板，生成可分享的故事站或翻页纪念册。

> **P0 地基**：可运行 monorepo 骨架、Compose 基础设施、双模式配置与安全基线文档。业务 API / 上传 / Worker 管线在 P1+ 迭代。

私有仓库：[wuzicong/nianxiang](https://github.com/wuzicong/nianxiang)

---

## 仓库结构

```
├── apps/
│   ├── web/          # Next.js 15 前端壳
│   └── api/          # Node API：/health、上传预签名占位
├── packages/
│   └── shared/       # Job 名、桶路径、共享类型
├── services/
│   ├── worker/       # BullMQ 消费桩
│   └── ml/           # FastAPI /health 桩
├── templates/        # MVP 三套 theme.json 占位
├── deploy/
│   ├── self-host/    # Compose 说明与备份占位
│   └── cloud/        # 云托管 env 与安全清单
├── docker-compose.yml
└── .env.example
```

---

## 双部署模式

同一套代码，用环境变量切换。两种模式都默认私有；分享必须主动发布，并可设密码、过期和撤销。

| 变量 | 自托管（默认开发） | 云托管 |
|------|-------------------|--------|
| `DEPLOY_MODE` | `selfhost` | `cloud` |
| `STORAGE_BACKEND` | `minio`（也可改 `s3` 绑定自有云桶） | `s3` |
| 对象存储 | Compose MinIO，桶匿名访问关闭 | 云厂商 S3 兼容桶，Block Public Access |
| 数据库 | Compose Postgres + pgvector | 托管 PostgreSQL + pgvector |
| 预签名 | 同样夹紧到 5–15 分钟 | 同样夹紧到 5–15 分钟 |
| 加密 | 磁盘与备份由运维负责 | `AWS_KMS_KEY_ID` 可配，生产建议 SSE-KMS |
| 密钥 | 本机 `.env` / Docker secrets，不进 Git | 云 KMS / Secret Manager，不进 Git、不进镜像 |
| CDN | 不需要 | 只缓存衍生图，不缓存原图 |

`S3_BUCKET` 必须是 `memora-${MEMORA_ENV}`（例如 `memora-local`、`memora-prod`）。

详细清单：

- 自托管：[deploy/self-host/README.md](deploy/self-host/README.md)
- 云托管：[deploy/cloud/README.md](deploy/cloud/README.md)

---

## 安全基线（两种模式均需遵守）

**共用**

- 默认全私有；分享须主动发布；支持密码 / 过期 / 一键撤销
- 传输 TLS；**密钥不进仓库**（本仓只有 `.env.example` 与 `env.cloud.example` 占位）
- 原图只走预签名或鉴权代理；`PRESIGN_TTL_MINUTES` 由 API 夹紧到 **5–15 分钟**
- 人脸 / 向量等敏感能力可关闭；删号级联清理
- 分享可剥离 GPS；软删后 GC

**云托管加严（硬门槛）**

- 原图桶 **Block Public Access**；禁止匿名 list/get
- 仅 API 运行时角色最小 IAM（`users/*`、`albums/*` 等前缀，禁止 `*` 资源）
- **SSE-KMS** 可配（`AWS_KMS_KEY_ID`）；密钥与应用角色分离
- CDN **只托衍生图**，不缓存原图
- 运维默认不可读原图；排障需审批 + 短时授权 + 审计
- 备份加密

**自托管**

- Postgres / Redis / MinIO / ML 只绑定 `127.0.0.1`（见 `docker-compose.yml`）
- 公网只暴露反代后的 Web/API，并强制 HTTPS
- 加固：防火墙只开 443、系统更新、磁盘告警、备份落到本机以外
- 开发口令写在 `.env.example` 里，只为对齐 Compose；换到非本机前必须改掉

---

## 最短路径

命令都在仓库根目录执行。

### 自托管

```bash
cp .env.example .env
docker compose up -d
corepack enable && pnpm install
pnpm dev:api    # http://127.0.0.1:3001/health
```

`docker compose ps` 应看到 `postgres`、`redis`、`minio`、`minio-init`（退出码 0）、`ml`。MinIO 控制台：<http://127.0.0.1:9001>。

可选：`pnpm dev:web`（3000）、`pnpm dev:worker`（等 Redis 就绪）。

### 云托管

不要把 Compose 里的 Postgres / MinIO 当生产。在密钥库设置（对照 `deploy/cloud/env.cloud.example`）：

```bash
DEPLOY_MODE=cloud
MEMORA_ENV=prod
STORAGE_BACKEND=s3
DATABASE_URL=postgresql://...@HOST:5432/memora?sslmode=require
REDIS_URL=rediss://...
S3_BUCKET=memora-prod
S3_REGION=ap-southeast-1
S3_ENDPOINT=https://s3.ap-southeast-1.amazonaws.com
S3_FORCE_PATH_STYLE=false
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
AWS_KMS_KEY_ID=...          # 可配，生产建议开启
PRESIGN_TTL_MINUTES=10      # 超出 5–15 会被夹紧
CDN_BASE_URL=https://cdn.example.com/memora-prod
```

然后用同一套 web / api / worker / ml 进程或镜像启动。桶策略示意见 `deploy/cloud/s3-bucket-policy.hcl.example`。

---

## 冻结契约（P0 已入库）

### Job 名

定义于 `packages/shared`：

`media.derivative` · `meta.exif` · `meta.geocode` · `ml.face` · `ml.clip` · `ml.scene` · `smart.album.refresh` · `album.render`

### 桶路径

```
memora-{env}/
  users/{userId}/originals/{assetId}
  users/{userId}/derivatives/{assetId}/{thumb|preview|hero}.webp
  albums/{albumId}/exports/{jobId}.pdf
  templates/{packId}/assets/...
```

### MVP 模板占位

- `templates/cotton-candy/theme.json` — 棉花糖日记
- `templates/kyoto-lantern/theme.json` — 京都纸灯
- `templates/magazine-heirloom/theme.json` — 杂志 Heirloom

---

## 路线图（摘要）

| 阶段 | 目标 |
|------|------|
| P0 | 骨架、Compose、契约、双模式文档 ← **当前** |
| P1 | 预签名上传、derivative worker、桶策略 |
| W6 MVP | 选片 → 3 模板 → 可分享短链 |

---

## 许可与协作

私有项目，未经授权不得分发。功能开发请走 `main` 保护分支 + PR。推送后 CI 会跑 `pnpm typecheck`、Job/桶路径契约检查，并拒绝明显的私钥与云访问密钥。
