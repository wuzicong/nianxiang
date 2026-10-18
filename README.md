# 念册 · Memora

智能照片库 + 主题成册：上传后按时间 / 地点 / 人物 / 场景组织素材，选片套用模板，生成可分享的故事站或翻页纪念册。

> **W6**：相册和可撤销分享已经接上。分享链接只存令牌哈希，可设过期，撤销后立即失效。密码分享、人脸、CLIP、地理编码和成册排版仍未做。

私有仓库：[wuzicong/nianxiang](https://github.com/wuzicong/nianxiang)

---

## 仓库结构

```
├── apps/
│   ├── web/          # Next.js 15 前端壳
│   └── api/          # Node API：会话、上传、相册与分享
├── packages/
│   ├── shared/       # Job 名、桶路径、上传限制、模板 id
│   └── storage/      # MinIO / S3、素材、用户、相册与分享
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

同一套代码，用环境变量切换。两种模式都默认私有；分享必须主动发布。过期和一键撤销已实现，密码分享还没做。

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

- 默认全私有；分享须主动发布；支持过期和一键撤销（密码分享未做）
- 传输 TLS；**密钥不进仓库**（本仓只有 `.env.example` 与 `env.cloud.example` 占位）
- 原图只走预签名或鉴权代理；`PRESIGN_TTL_MINUTES` 由 API 夹紧到 **5–15 分钟**
- 上传 / 完成 / 读取素材只认会话里的用户；对象键是 `users/{已认证 userId}/...`
- 人脸 / 向量等敏感能力可关闭；删号级联清理
- 分享令牌只存哈希；公开页只签衍生图，不签原图；撤销和过期都是 404
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

可选：`pnpm dev:web`（3000）、`pnpm dev:worker`（等 Redis 就绪）。上传链路需要 API 和 Worker 同时在跑，步骤见下方「本地验证上传」。

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

然后用同一套 web / api / worker / ml 进程或镜像启动。可执行的桶骨架在 [`deploy/cloud/terraform`](deploy/cloud/terraform/README.md)，阅读用摘要仍是 `deploy/cloud/s3-bucket-policy.hcl.example`。两处都没有生产凭证。

---

## 本地验证上传

Postgres、Redis、MinIO 用 Compose 起。API 和 Worker 在宿主机跑，这样改代码不用重建镜像。

```bash
cp .env.example .env
docker compose up -d
corepack enable && pnpm install
pnpm dev:api
pnpm dev:worker
```

另开一个终端：

```bash
pnpm verify:upload
```

脚本会先确认未登录是 401，再注册一个一次性用户、申请 `PUT` 预签名、把一张 1×1 PNG 传到 `memora-local`、调用完成接口，然后轮询到 `ready`。它只打印 asset id、对象键、过期时间和衍生图字节数，**不打印带签名的 URL，也不打印密码或会话令牌**。

`mime` 只接受 jpeg / png / webp / gif，`size` 默认不超过 25 MiB。请求体里的 `userId` 会被忽略。完成接口确认对象大小和类型与申请一致后，入队 `media.derivative` 和 `meta.exif`。Worker 写出 `thumb.webp`、`preview.webp`、`hero.webp`，失败最多重试 3 次。读取接口不返回 GPS 坐标。

## 本地验证登录

API 和 Postgres 起来之后。下面的密码只是占位，换成你自己的，不要用真实口令，也不要把它写进仓库：

```bash
curl -s -c /tmp/memora.cookies -X POST http://127.0.0.1:3001/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"replace-with-8-plus-chars"}'
curl -s -b /tmp/memora.cookies http://127.0.0.1:3001/api/v1/auth/me
curl -s -b /tmp/memora.cookies -X POST http://127.0.0.1:3001/api/v1/assets/upload-url \
  -H 'content-type: application/json' \
  -d '{"filename":"trip.jpg","mime":"image/jpeg","size":12345}'
# 用返回的 url 和 headers 做 PUT，再：
curl -s -b /tmp/memora.cookies -X POST http://127.0.0.1:3001/api/v1/assets/<assetId>/complete
curl -s -b /tmp/memora.cookies http://127.0.0.1:3001/api/v1/assets/<assetId>
curl -s -b /tmp/memora.cookies -c /tmp/memora.cookies -X POST http://127.0.0.1:3001/api/v1/auth/logout
```

不带 Cookie 时，上传、完成和读取都是 401。别人的素材返回 404。登出会撤销当前会话。

也可以开页面：`pnpm dev:web`，浏览器打开 <http://127.0.0.1:3000/login>。页面把 `/api/v1` 转到 `127.0.0.1:3001`，Cookie 落在 Web 源上。自托管开发不给 Cookie 加 Secure；`DEPLOY_MODE=cloud`、`MEMORA_ENV=staging|prod` 或 `NODE_ENV=production` 会加。

注册默认开放（`AUTH_REGISTRATION=open`）。云上线前可以设成 `closed`。OIDC 的环境变量名已经留好，授权码流程还没接。

## 本地验证相册和分享

Postgres 和 API 已经在跑。如果上一步已经登出，先重新登录，把 Cookie 留在 `/tmp/memora.cookies`。`token` 只在创建分享的响应里出现一次，数据库只存它的 sha256。不要把 token 写进日志、工单或截图。

```bash
curl -s -b /tmp/memora.cookies -X POST http://127.0.0.1:3001/api/v1/albums \
  -H 'content-type: application/json' \
  -d '{"title":"京都周末","themeId":"kyoto-lantern"}'
curl -s -b /tmp/memora.cookies -X POST http://127.0.0.1:3001/api/v1/albums/<albumId>/assets \
  -H 'content-type: application/json' \
  -d '{"assetIds":["<assetId>"]}'
# expiresAt 可省略，表示不过期；要设的话用一个未来的 ISO 时间，且不超过 366 天
curl -s -b /tmp/memora.cookies -X POST http://127.0.0.1:3001/api/v1/albums/<albumId>/shares \
  -H 'content-type: application/json' \
  -d '{}'
# 不带 Cookie。响应是衍生图的短时预签名，没有原图键，也没有 GPS。
curl -s http://127.0.0.1:3001/api/v1/public/shares/<token>
curl -s -b /tmp/memora.cookies -X POST http://127.0.0.1:3001/api/v1/shares/<shareId>/revoke
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/api/v1/public/shares/<token>
```

撤销后、过期后、以及乱写的 token，都是 **404**，正文都是 `分享不存在`。未登录不能建相册；别人的相册和分享同样是 404。

页面：`pnpm dev:web`，打开 `http://127.0.0.1:3000/s/<token>`。肤色来自 `templates/<themeId>/theme.json`（棉花糖日记、京都纸灯、杂志 Heirloom）。撤销后刷新应看到「分享不存在」。

合入前在仓库根目录跑，这三项不依赖 Compose：

```bash
pnpm typecheck
pnpm check:contracts
pnpm test
```

`pnpm test` 覆盖预签名、登录、相册、分享撤销、跨用户隔离和日志打码。`pnpm typecheck` 与 `pnpm check:contracts` 是合入前要绿的两项。

还没做：分享密码、细粒度协作者权限、社交登录 / OIDC 授权码、相册改名和删除、拖拽排序、完整成册排版、把原图放进分享。

## 冻结契约（P0 已入库，P1 沿用）

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
| P0 | 骨架、Compose、契约、双模式文档 |
| P1 | 预签名上传、derivative / exif worker、桶策略骨架 |
| 登录 | 邮箱密码会话；上传和读取绑定已认证用户 |
| W6 MVP | 相册、链接分享、过期与撤销 ← **当前** |
| 后续 | 分享密码、细粒度权限、人脸 / CLIP、地理编码、成册排版 |

---

## 许可与协作

私有项目，未经授权不得分发。功能开发请走 `main` 保护分支 + PR。推送后 CI 会跑 `pnpm typecheck`、Job/桶路径契约检查，并拒绝明显的私钥与云访问密钥。
