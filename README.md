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

同一套代码，用环境变量切换：

| 变量 | 自托管（默认开发） | 云托管 |
|------|-------------------|--------|
| `DEPLOY_MODE` | `selfhost` | `cloud` |
| `STORAGE_BACKEND` | `minio` | `s3` |
| 对象存储 | Compose MinIO | 云厂商 S3 兼容桶 |
| 数据库 | Compose Postgres | 托管 PostgreSQL + pgvector |
| 密钥 | `.env` / Docker secrets | KMS / Secret Manager |

详细清单：

- 自托管：[deploy/self-host/README.md](deploy/self-host/README.md)
- 云托管：[deploy/cloud/README.md](deploy/cloud/README.md)

---

## 安全基线（两种模式均需遵守）

**共用**

- 默认全私有；分享须主动发布；支持密码 / 过期 / 撤销
- 传输 TLS；**密钥不进仓库**（本仓仅 `.env.example`）
- 人脸 / 向量等敏感能力可关闭；删号级联清理
- 分享可剥离 GPS；软删后 GC

**云托管加严（硬门槛）**

- 原图桶 **Block Public Access**；禁止匿名 list/get
- 仅 API 运行时角色最小 IAM（限定 `users/*` 等前缀）
- 原图访问：**预签名 5–15 分钟**（`PRESIGN_TTL_MINUTES`）
- **SSE-KMS** 可配（`AWS_KMS_KEY_ID`）；密钥与应用角色分离
- CDN **只托衍生图**，不缓存原图
- 运维默认不可读原图；排障需审批 + 短时授权 + 审计

**自托管**

- Postgres / Redis / MinIO 仅绑定 `127.0.0.1`（见 `docker-compose.yml`）
- 公网暴露请走反代 + HTTPS；附备份与加固清单（逐步补齐）

---

## 快速开始

### 1. 基础设施（Compose）

```bash
cp .env.example .env
docker compose up -d
docker compose ps
```

预期服务：`postgres`、`redis`、`minio`、`minio-init`（建桶）、`ml`（`/health`）。

MinIO 控制台：<http://127.0.0.1:9001>（凭据见 `.env`）。

### 2. 应用（本地开发）

```bash
corepack enable
pnpm install
pnpm --filter @memora/shared build
pnpm dev:api    # http://127.0.0.1:3001/health
pnpm dev:web    # http://127.0.0.1:3000
pnpm dev:worker # Redis 就绪后启动 BullMQ 桩
```

云模式：将 `deploy/cloud/env.cloud.example` 中的变量写入部署侧密钥库，**不要**提交真实凭据。

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

私有项目，未经授权不得分发。功能开发请走 `main` 保护分支 + PR。
