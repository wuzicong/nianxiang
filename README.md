# 念册 · Memora

智能照片库 + 主题成册：上传后按时间 / 地点 / 人物 / 场景组织素材，选片套用模板，生成可分享的故事站或翻页纪念册。

> **分享**：相册页可以上传照片并生成可撤销链接，可选密码已经接上。令牌与密码都只存哈希。页面和分享只展示衍生图。人脸、CLIP、地理编码和成册排版仍未做。

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
├── templates/        # W6 三套主题（theme.json + assets/）
├── deploy/
│   ├── self-host/    # Compose 说明与备份占位
│   └── cloud/        # 云托管 env 与安全清单
├── docker-compose.yml
└── .env.example
```

---

## 双部署模式

同一套代码，用环境变量切换。两种模式都默认私有；分享必须主动发布。过期、一键撤销和可选密码已实现。不设 `SHARE_REQUIRE_PASSWORD` 时密码可选；设为 `true` 后，新建分享必须带密码。已经发出的无密码链接不受这个开关影响。

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

- 默认全私有；分享须主动发布；支持过期、一键撤销和可选密码
- 传输 TLS；**密钥不进仓库**（本仓只有 `.env.example` 与 `env.cloud.example` 占位）
- 原图只走预签名或鉴权代理；`PRESIGN_TTL_MINUTES` 由 API 夹紧到 **5–15 分钟**
- 上传 / 完成 / 读取素材只认会话里的用户；对象键是 `users/{已认证 userId}/...`
- 人脸 / 向量等敏感能力可关闭；删号级联清理
- 分享令牌只存哈希；密码只存 scrypt，不回显、不进日志。公开页只签衍生图，不签原图
- 无密码分享：撤销、过期、无效都是 404「分享不存在」
- 有密码的分享先返回 401「需要密码」，且不带相册内容。解锁失败一律 401「无法打开分享」，不区分密码错、撤销或过期
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

可选密码。省略 `password` 就是原来的无密码分享。密码至少 8 个字符，最多 128 个，不会去掉首尾空格。创建响应和之后的列表只带 `passwordProtected: true/false`，**不回显密码，也不回显哈希**。

```bash
curl -s -b /tmp/memora.cookies -X POST http://127.0.0.1:3001/api/v1/albums/<albumId>/shares \
  -H 'content-type: application/json' \
  -d '{"password":"replace-with-8-plus-chars"}'
# 有密码时这一步是 401，正文是「需要密码」，只额外带模板 id（themeId）。没有相册标题，也没有预签名
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/api/v1/public/shares/<token>
# 密码放 JSON 正文，不要放 query。
# 格式正确时：密码不对、链接不存在、已撤销或已过期，都是 401「无法打开分享」。
# 路径根本不像令牌时仍是 404。
curl -s -X POST http://127.0.0.1:3001/api/v1/public/shares/<token>/unlock \
  -H 'content-type: application/json' \
  -d '{"password":"replace-with-8-plus-chars"}'
```

想让新分享默认必须带密码（自托管和云托管同一开关）：

```bash
SHARE_REQUIRE_PASSWORD=true
```

只接受 `true` / `1` 打开，`false` / `0` 或留空保持可选。设成别的值会告警并继续可选。这个开关不追溯已经创建的分享。

相册详情（`/albums/<albumId>`）可以选择 jpeg、png、webp、gif 上传。页面通过 `/api/v1` 申请预签名，上传完成后再把素材加入这本相册，不另开上传接口。原图不在相册页和分享页展示；缩略图就绪前会显示处理状态，就绪后用短时预签名显示 thumb / preview / hero。

页面：`pnpm dev:web`，打开 `http://127.0.0.1:3000/s/<token>`。肤色来自 `templates/<themeId>/theme.json`（棉花糖日记、京都纸灯、杂志 Heirloom）。无密码分享直接看图；有密码的先看到对应主题的输入框。模板优先用 401 里的 `themeId`，没有时才认链接上允许的 `?t=`（三套 id 之一），否则挑战态用棉花糖。解锁失败仍是同一句提示，页面沿用挑战态的皮肤，不会从失败响应里再要一次模板。提交后才加载衍生图。撤销后刷新应看到「分享不存在」。刷新密码分享需要再输入一次，应用不发解锁 Cookie。

公开接口的取舍：令牌是 32 字节随机数，不能靠试 token 来枚举分享。持有链接的人需要知道要不要输密码，所以 **GET** 在「有效且设了密码」时用 **401「需要密码」**，和其他 404 分开。**POST /unlock** 则把密码错误、不存在、撤销、过期合成同一句 **401「无法打开分享」**，这个接口本身不能用来区分原因。密码错误时仍做一次 scrypt；分享不存在时对哑哈希做一次，避免只靠快慢判断链接是否还在。应用内不做按 IP 计数。公网反代要打码 `/s/` 和 `/api/v1/public/shares/`，限制 `POST .../unlock`，并且不要记录这个 POST 的正文。片段在 `deploy/self-host/proxy/`，说明见 `deploy/self-host/README.md`。

## 本地冒烟（可分享 MVP）

先按上面的开发环境把 Postgres、Redis、MinIO、ML 用 `docker compose up -d` 起来，再在宿主机跑 API、worker 和 web。冒烟不负责拉起这套进程。

`WEB_BASE`、`API_BASE`、`ML_BASE` 指向要测的站点，默认是 `http://127.0.0.1:3000`、`http://127.0.0.1:3001`、`http://127.0.0.1:8000`。对着另一套自托管栈复跑时，改这三个地址即可。

日志二选一。本机进程把标准输出转到文件，用 `SMOKE_LOG_FILES`。应用已经在 Compose 里时，用 `SMOKE_LOG_SERVICES` 写服务名，脚本执行 `docker compose logs`。

```bash
corepack enable && pnpm install
pnpm exec playwright install --with-deps chromium
mkdir -p tmp
pnpm dev:api > tmp/api.log 2>&1
pnpm dev:web > tmp/web.log 2>&1
pnpm dev:worker > tmp/worker.log 2>&1
SMOKE_LOG_FILES=tmp/api.log,tmp/web.log,tmp/worker.log pnpm smoke
```

另一套栈的例子：

```bash
WEB_BASE=https://photos.example \
API_BASE=https://photos.example \
ML_BASE=http://127.0.0.1:8000 \
SMOKE_LOG_SERVICES=api,web,worker \
pnpm smoke
```

页面若把 `/api/v1` 反代到 API，`WEB_BASE` 和 `API_BASE` 可以是同一个源。脚本会注册一个一次性用户，任选三套主题之一建相册，上传两张 PNG 和一张带 GPS 的 JPEG，等到衍生图 `ready`，打开 `/albums/<id>/preview?layout=story`，创建带密码的分享，再用另一个浏览器上下文打开 `/s/<token>`。错密码和撤销后的解锁都是 401「无法打开分享」。撤销后的页面是 404「分享不存在」。它检查预览页、分享页和这些接口里没有 `/originals/`、EXIF、明文密码；应用日志里有这次注册、建分享和衍生图完成的记录，但没有明文令牌、会话或密码。主人上传原图的预签名地址本身含 `/originals/`，不记入泄漏。终端不打印令牌、密码或带签名的 URL。

`next dev` 默认会把请求路径打出来。`next.config.ts` 忽略了 `/s/` 和 `/api/v1/public/shares/`，所以开发日志可以交给这次检查。生产模式的 `next start` 本来就不记这些访问。

合入前在仓库根目录跑，这三项不依赖 Compose：

```bash
pnpm typecheck
pnpm check:contracts
pnpm test
```

`pnpm test` 覆盖预签名、登录、相册、分享撤销、可选密码、跨用户隔离和日志打码。`pnpm typecheck` 与 `pnpm check:contracts` 是合入前要绿的两项。

还没做：邮箱验证后才能打开的分享、一次性密码、解锁会话（刷新免重输）、按 IP 的应用内限流、细粒度协作者权限、社交登录 / OIDC 授权码、相册改名和删除、拖拽排序、完整成册排版、把原图放进分享。

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

### W6 主题

可分享 MVP 使用这三套完整主题。装饰 SVG 在各自的 `assets/` 下，说明见 [templates/README.md](templates/README.md)。

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
| W6 MVP | 相册、链接分享、过期与撤销 |
| 分享密码 | 可选密码、scrypt、公开页挑战 |
| 相册上传 | 相册页上传、加入相册、预览就绪后出现在分享 |
| 发布前收口 | 端到端冒烟 | ← **当前** |
| 后续 | 细粒度权限、邮箱验证分享、一次性密码、人脸 / CLIP、地理编码、成册排版 |

---

## 许可与协作

私有项目，未经授权不得分发。功能开发请走 `main` 保护分支 + PR。推送后 CI 会跑 `pnpm typecheck`、Job/桶路径契约检查，并拒绝明显的私钥与云访问密钥。
