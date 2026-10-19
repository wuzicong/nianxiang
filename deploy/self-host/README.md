# 自托管部署（Compose）

隐私优先：数据和 ML 默认留在本机。开发环境走这条路径。也可以把 `STORAGE_BACKEND` 改成 `s3`，只挂你自己的云桶，应用仍跑在本机。

## 最短路径

在仓库根目录：

```bash
cp .env.example .env
docker compose up -d
docker compose ps
```

`.env` 里保持：

```bash
DEPLOY_MODE=selfhost
MEMORA_ENV=local
STORAGE_BACKEND=minio
S3_BUCKET=memora-local
```

`DATABASE_URL` 的口令要和 `POSTGRES_PASSWORD` 相同；`S3_SECRET_ACCESS_KEY` 要和 `MINIO_ROOT_PASSWORD` 相同。模板里的 `memora-dev-change-me` 只给本机用。

要在一台机器上把 web / api / worker 和 Caddy 一起跑起来，用下面的「生产部署」，不要把这条开发命令暴露到公网。公网新机器先勾「从零装机」。

## 监控最短路径

默认关闭。`MEMORA_ALERT_ENABLE` 默认 `0`（`deploy/self-host/monitoring/env.monitor.example` 和 `check.sh` 内置都是这个值）。不进 `compose.prod.yml`，也不要装 cron。阈值从仓库外的 env 读，调用时用 `MEMORA_MONITOR_ENV` 指向它。没设这个变量时，下表这几项用脚本内置默认，和示例文件相同。渠道、状态目录和可选 cron 在「监控告警」。

在仓库根目录：

- [ ] `--self-test`：只用临时文件自检，不访问 Docker，不外发。成功时最后一行是 `[memora] monitor self-test ok`。

```bash
deploy/self-host/monitoring/check.sh --self-test
```

- [ ] `--dry-run`：按仓库外的 env 检查一轮。不写状态，不外发。退出码 0 表示这一轮没有要外发的问题，退出码 1 表示有。输出里不应出现口令、Webhook URL 或邮箱。

```bash
umask 077
sudo mkdir -p /etc/memora
sudo cp deploy/self-host/monitoring/env.monitor.example /etc/memora/monitor.env
sudo chmod 600 /etc/memora/monitor.env
MEMORA_MONITOR_ENV=/etc/memora/monitor.env deploy/self-host/monitoring/check.sh --dry-run
```

`env.monitor.example` 里的默认项：

| 变量 | 默认 | 含义 |
|------|------|------|
| `MEMORA_ALERT_ENABLE` | `0` | `1` 才外发 |
| `MEMORA_HTTP_FAILS` | `3` | `GET /health`、`GET /login`、`GET /ready` 连续失败多少次才记成要外发 |
| `MEMORA_DISK_PERCENT` | `85` | `df` 使用率。路径 `MEMORA_DISK_PATH` 默认 `/` |
| `MEMORA_BACKUP_MAX_AGE_HOURS` | `26` | 最新 `manifest-*.txt` 的年龄上限。目录 `MEMORA_BACKUP_DIR` 默认 `/var/backups/memora`。不读正文 |
| `MEMORA_UNLOCK_429_ALERT` | `30` | 一轮新增的解锁 429，日志 zone 是 `memora_share_unlock` |
| `MEMORA_AUTH_429_ALERT` | `20` | 一轮新增的登录/注册 429，日志 zone 是 `memora_auth` |

公开分享 429（zone `memora_public_shares`）只打印次数，示例里没有单独阈值。

## 从零装机

新机器勾这四项。步骤在后面的专章。

- [ ] 域名。DNS 指到这台机器，防火墙放行 80 和 443。`MEMORA_DOMAIN`、`WEB_ORIGINS` 见「生产部署」的「环境」。域名留空只适合本机明文，不要放到公网。
- [ ] 证书。见「TLS 证书续期」。`MEMORA_DOMAIN` 写成纯域名后，Caddy 申请证书并在后台续期。
- [ ] 备份目录。另一块盘或另一台机器，目录 `700`。见「备份与恢复」的「做一次备份」。
- [ ] 首次 restore drill。先 `deploy/self-host/restore-drill.sh --dry-run`（退出码 0，最后一行是 `[memora] drill dry-run ok`），再按「演练」跑 `restore-drill.sh`，或按顺序贴同一节的空目录演练、校验、回滚。通过与否看「验收清单」。

## 服务

| 服务 | 地址 | 说明 |
|------|------|------|
| postgres | `127.0.0.1:5432` | pgvector |
| redis | `127.0.0.1:6379` | BullMQ，AOF |
| minio | `127.0.0.1:9000` / 控制台 `9001` | 对象存储 |
| minio-init | 一次性 | 建桶并 `anonymous set none` |
| ml | `127.0.0.1:8000/health` | 推理桩 |

web / api / worker 用 `pnpm dev:*` 起。不要把 5432、6379、9000、9001 改绑到 `0.0.0.0`。

API 第一次访问会建 `users` / `sessions` 表。第一次使用相册或分享时再建 `albums` / `album_assets` / `shares`（分享只存令牌哈希；可选密码只存 scrypt）。登录是邮箱加密码，会话 Cookie 名为 `memora_session`（HttpOnly）。本机 HTTP 不加 Secure；放到公网 HTTPS 前把 `COOKIE_SECURE=true`。页面入口是 `http://127.0.0.1:3000/login`，分享页是 `http://127.0.0.1:3000/s/<token>`。新建分享默认可以不设密码；要强制新链接带密码时设 `SHARE_REQUIRE_PASSWORD=true`。公网反代的打码和限流见下文。

## 安全

- 公网只经过 Caddy、Nginx 或 Traefik，强制 HTTPS。打码和限流用 `proxy/` 里的片段
- 防火墙只开放 80 和 443（80 用来签证书并跳到 HTTPS；SSH 按你自己的跳板策略）。不要把 5432、6379、9000、9001 暴露出去
- 密钥放 `.env` 或 Docker secrets，禁止提交
- 做好系统更新、磁盘告警；单盘有坏盘和停电风险，备份请放到另一块盘或另一台机器
- 备份与恢复见下面的专章。脚本不把口令写进日志。演练用 `deploy/self-host/restore-drill.sh`。备份离开过这台机器，或口令泄漏，按「密钥轮换」。介质可能被别人碰过，再按「备份离机后的会话收口」

## 公网反代

浏览器的分享页是 `/s/<token>`，公开接口是 `/api/v1/public/shares/<token>`，解锁是 `POST .../unlock`。令牌是 32 字节 base64url、无填充，固定 43 位。应用日志已经打码，反代不会。片段在 `proxy/`，不进 Compose。默认反代本机 Web `127.0.0.1:3000`（页面再把 `/api/v1` 转到 API）。API 若另开入口，同一套片段也要盖住。

| 文件 | 作用 |
|------|------|
| `proxy/Caddyfile` | 访问日志和进程错误日志打码。官方 Caddy 可用 |
| `proxy/Caddyfile.ratelimit` | 按来源 IP 限制解锁、公开分享，以及登录和注册。需要 `xcaddy build --with github.com/mholt/caddy-ratelimit`。生产镜像已经编进去了 |
| `proxy/nginx-http.conf` | 放进 `http`：日志格式、打码、限流区 |
| `proxy/nginx-server.conf` | 放进 `server`：访问日志，以及解锁和公开分享的限流 |
| `proxy/traefik-dynamic.yml` | 限流路由，并进现有动态配置 |
| `proxy/traefik-static.yml` | 访问日志。Traefik 不能只替换令牌，所以丢掉整段路径 |

Caddy 和 Nginx 把这两条路径上刚好 43 位的令牌写成 `***`，`Referer` 同样处理，查询串里的 `password` 和 `token` 也打掉。`/login` 这类普通路径保持原样。不是刚好 43 位的，原样保留。Caddy 打码需要 2.11（同一字段上的两条正则都要留着，顺序不能反）。Traefik 片段按 v3 写，在 v3.6 上对过。

解锁口令、登录密码、注册密码都在 JSON 正文里。访问日志不要包含请求正文，也不要打开 debug。响应正文里有短时预签名，同样不要记。Nginx 的 `log_format` 不要加 `$request_body`。同一个 `server` 不要再加一条 `access_log ... combined`，否则未打码的那份还在。`http` 里的片段只 include 一次。Caddy 片段会删掉 Cookie、Authorization 和 Set-Cookie，并且管理接口只听 `localhost:2019`。不要打开会记录凭证的选项。

限流按来源 IP，次数写在片段里，可以改：

- 解锁平均每分钟 6 次。Caddy 只限制 `POST .../unlock`。滑动窗口里已经有 6 次时，下一次是 429；同一来源连续打，第 7 次就是 429。Nginx 按这条路径限，GET 也算；短时大约能过 7 次，第 8 次起 429。Traefik 的 `burst` 是短时次数，解锁连续第 7 次 429
- `/api/v1/public/shares/` 平均每分钟 60 次。Caddy 窗口里已经有 60 次时，下一次是 429；同一来源连续 GET，第 61 次就是 429。解锁 POST 也计入这一档。Nginx 短时大约能过 21 次。Traefik 短时 20 次
- `POST /api/v1/auth/login` 和 `POST /api/v1/auth/register` 共用一个额度，平均每分钟 5 次。Caddy 满 5 次后 429。Nginx `5r/m`、`burst=4`，短时大约 5 次，第 6 次 429；GET 不计数。Traefik `average: 5`、`burst: 5`，第 6 次 429。登出和 `GET /api/v1/auth/me` 不在这档里。改 Caddy 的 `memora_auth` `events`、Nginx 的 `memora_auth`、Traefik 的 `memora-auth-limit`

出口 IP 若很多人共用，把次数调高。只有上一跳是你自己的负载均衡时才相信 `X-Forwarded-For`。配错的话，客户端可以伪造来源，绕过限流。

超过限额返回 429。Nginx 和带限流插件的 Caddy 正文是 `请稍后再试`。Traefik 用它自己的 429 正文。

Nginx 的 `error_log` 不能改格式。限流拒绝已经降到 `info`，`error_log` 停在 `warn` 或更高（默认是 `error`）时不会写入。不要调到 `info` 或 `debug`。上游失败时原始请求行仍可能带令牌，入库前用片段里的同一条正则打码。Caddy 全局 `log` 会打码进程错误日志里的路径，级别保持 `INFO`。日志目录不要对所有用户可读。

Traefik 用 JSON 访问日志，并丢掉 `RequestPath`、`RequestLine` 和全部请求头。方法、状态码、耗时还在。需要保留其它路径时改用 Caddy 或 Nginx，不要把这两项改回 keep，也不要改用 `common` 格式。

站点里这样接上 Caddy（`Caddyfile.ratelimit` 要在站点之外先 import；官方二进制不要导入它）：

```caddy
import memora_access_log
import memora_share_limits
import memora_rate_limited
reverse_proxy 127.0.0.1:3000
```

Nginx：

```nginx
http {
    include /path/to/deploy/self-host/proxy/nginx-http.conf;
    server {
        listen 443 ssl;
        include /path/to/deploy/self-host/proxy/nginx-server.conf;
    }
}
```

## 生产部署

开发那条 `docker compose up -d` 只起 Postgres、Redis、MinIO 和 ML。web / api / worker 仍在宿主机用 `pnpm dev:*`。生产用仓库根目录的 `compose.prod.yml`：构建 web、api、worker，前面放已经编进限流插件的 Caddy，套用 `proxy/` 里的打码片段。公网只映射 80 和 443。数据库、Redis、MinIO、ML 和三个应用在内部网络上，没有宿主机端口。

证书在卷 `caddy_data`。数据卷跟开发项目 `memora` 分开，这个项目名是 `memora-prod`。

### 环境

```bash
cp deploy/self-host/env.prod.example .env
```

然后改口令。至少这些要有：

| 变量 | 说明 |
|------|------|
| `POSTGRES_PASSWORD` | 数据库口令。不要用开发口令 |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | MinIO 根账号。`S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` 默认同这两项 |
| `MEMORA_ENV` | `prod` |
| `S3_BUCKET` | `memora-prod`，必须等于 `memora-${MEMORA_ENV}` |
| `MEMORA_DOMAIN` | 公网域名，例如 `photos.example.com`。DNS 指到这台机器 |
| `WEB_ORIGINS` | `https://photos.example.com`。多个来源用逗号隔开，不要写 `*` |
| `COOKIE_SECURE` | `true`。会话 Cookie 名是 `memora_session`，HttpOnly。公网 HTTPS 要显式加上 Secure |

`MEMORA_ENV=prod` 时 API 本来就会给 Cookie 加 Secure。还是把 `COOKIE_SECURE=true` 写上，避免以后改了环境名又退回明文。

口令可以不进 `.env`，改挂 Docker secret。api / worker 的入口在变量为空时读 `/run/secrets/<变量名>` 或 `*_FILE`。Postgres 镜像认 `POSTGRES_PASSWORD_FILE`，MinIO 镜像认 `MINIO_ROOT_PASSWORD_FILE`，`minio-init` 同样认这两个文件。把下面存成仓库根目录的 `compose.prod.override.yml`（已在 `.gitignore` 里）。口令文件放在 `secrets/` 或仓库外，不要提交：

```yaml
services:
  postgres:
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/POSTGRES_PASSWORD
    secrets: [POSTGRES_PASSWORD]
  minio:
    environment:
      MINIO_ROOT_PASSWORD_FILE: /run/secrets/MINIO_ROOT_PASSWORD
    secrets: [MINIO_ROOT_PASSWORD]
  minio-init:
    environment:
      MINIO_ROOT_PASSWORD_FILE: /run/secrets/MINIO_ROOT_PASSWORD
    secrets: [MINIO_ROOT_PASSWORD]
  api:
    secrets: [POSTGRES_PASSWORD, S3_SECRET_ACCESS_KEY]
  worker:
    secrets: [POSTGRES_PASSWORD, S3_SECRET_ACCESS_KEY]
secrets:
  POSTGRES_PASSWORD:
    file: ./deploy/self-host/secrets/postgres_password
  MINIO_ROOT_PASSWORD:
    file: ./deploy/self-host/secrets/minio_root_password
  S3_SECRET_ACCESS_KEY:
    file: ./deploy/self-host/secrets/s3_secret_access_key
```

用 secret 时，`.env` 里把对应口令留空，不要两处都写。`S3_SECRET_ACCESS_KEY` 要和 MinIO 根口令相同。入口拼 `DATABASE_URL` 时会做百分号编码，口令里可以有 `@`。

`NEXT_PUBLIC_SHARE_REQUIRE_PASSWORD` 在构建 web 镜像时写进页面。改了要重新构建，不能只重启容器。

证书通知邮箱不会从环境变量读。怎么续期、证书放在哪，见下面的「TLS 证书续期」。

### 启动

域名已经指过来，防火墙放行 80 和 443：

```bash
docker compose -f compose.prod.yml up -d --build
docker compose -f compose.prod.yml ps
```

用了 override 时：

```bash
docker compose -f compose.prod.yml -f compose.prod.override.yml up -d --build
```

检查：

```bash
curl -fsS "https://photos.example.com/login" -o /dev/null
curl -fsS "https://photos.example.com/health"
```

`/login` 是页面。`/health` 是 API 健康检查，由 Caddy 转到 api，不经过登录。页面上的 `/api/v1` 仍由 web 转到 api。

没有域名、只想在这台机器上看一眼时，把 `MEMORA_DOMAIN` 留空。Caddy 只听 80。用 `http://127.0.0.1/login` 和 `http://127.0.0.1/health`。这种开法不要放到公网。`COOKIE_SECURE=true` 时，浏览器和 curl 都不会在明文 HTTP 上带会话 Cookie。本机要走注册、登录、建册时，把 `COOKIE_SECURE=false`，公网 HTTPS 再改回 `true`。

各服务怎么探活、失败时怎么看日志，以及上线后怎么抽查，见「健康检查」、「何时看哪一节」、「健康检查失败时的自检清单」和「活体抽查」。

### 登录限流

`POST /api/v1/auth/login` 和 `POST /api/v1/auth/register` 按来源 IP 共用额度，默认一分钟 5 次，第 6 次 429，正文是 `请稍后再试`。次数写在片段里，可以改：Caddy 是 `proxy/Caddyfile.ratelimit` 的 `memora_auth` `events`。改完执行：

```bash
docker compose -f compose.prod.yml up -d --force-recreate caddy
```

Nginx、Traefik 的档位见上面「公网反代」。出口 IP 很多人共用时把次数调高。登录密码在 JSON 正文里，访问日志不记正文。不要开 debug。

### 解锁限流

`POST /api/v1/public/shares/<43 位令牌>/unlock` 有两层额度，默认都是每分钟 6 次，第 7 次 429。边缘按来源 IP，次数在 `proxy/Caddyfile.ratelimit` 的 `memora_share_unlock` `events`。应用层是 API 的 `SHARE_UNLOCK_LIMIT`（默认 6），固定窗口，按客户端计数，键不是令牌：上一跳在内网或本机时用 `X-Forwarded-For` 最右边的地址，否则用 socket 地址。假令牌同样计数，限流键看不出分享是否存在。令牌必须刚好 43 位（`secrets.token_urlsafe(32)`）。更短的一段应用直接 404「分享不存在」，访问日志也不会把它打成 `***`。

经 Caddy 时反代在前，第 7 次多为边缘 429。同一来源连续 POST，窗口是空的时候：

| 次序 | 谁返回 | 状态 | 正文 |
|------|--------|------|------|
| 1–6 | 应用 | 401 | `share_unavailable`，「无法打开分享」 |
| 7 起 | Caddy（边缘） | 429 | `rate_limited`，「请稍后再试」，并带 `Retry-After` |

边缘 429 用片段里的 `memora_rate_limited`。进程日志有 `zone=memora_share_unlock`。

直连 api、绕过 Caddy（容器内 `http://127.0.0.1:3001`）时，同一客户端连续 POST，窗口是空的时候：1–6 仍是 401 `share_unavailable`「无法打开分享」，第 7 次是应用自己的 429，正文同样是 `rate_limited`「请稍后再试」，并带 `Retry-After`。`SHARE_UNLOCK_LIMIT` 非法或写成 0 时回落 6。这一层不写 Caddy 的 zone。

这条 POST 同时计入公开分享前缀 `memora_public_shares`（每分钟 60 次）。和下面的 GET 抽查隔开至少一分钟，否则公开前缀会先吃掉额度。

口令只放 JSON 正文。访问日志不记正文。改完 `events` 后：

```bash
docker compose -f compose.prod.yml up -d --force-recreate caddy
```

明文本机（`MEMORA_DOMAIN` 留空，`http://127.0.0.1`）这样复现。口令、Cookie、Authorization 换成一次性值，不要写进仓库、工单或日志。输出只留序号、状态码和 `error`：

```bash
umask 077
token="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
test "${#token}" -eq 43
for n in 1 2 3 4 5 6 7 8; do
  code="$(curl -sS -o /tmp/memora-unlock.body -w '%{http_code}' \
    -X POST "http://127.0.0.1/api/v1/public/shares/${token}/unlock" \
    -H 'content-type: application/json' \
    -H 'cookie: memora_session=replace-me' \
    -H 'authorization: Bearer replace-me' \
    -d '{"password":"replace-with-8-plus-chars"}')"
  printf '%s %s ' "$n" "$code"
  python3 -c 'import json; b=json.load(open("/tmp/memora-unlock.body")); print(b.get("error"), b.get("message"))'
done
rm -f /tmp/memora-unlock.body
```

期望：1 到 6 打印 `401 share_unavailable 无法打开分享`；7 和 8 打印 `429 rate_limited 请稍后再试`。第 7 次多为边缘 429（Caddy 先拦）。第 7 次的 `Retry-After` 在刚打满窗口时是 `60`，之后随这一分钟里剩余的时间减小。

绕过 Caddy，看应用自己的 429：

```bash
docker compose -f compose.prod.yml exec -T -e TOKEN="$token" api \
  node --input-type=module -e '
const token = process.env.TOKEN;
for (let n = 1; n <= 8; n += 1) {
  const res = await fetch(`http://127.0.0.1:3001/api/v1/public/shares/${token}/unlock`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "replace-with-8-plus-chars" }),
  });
  const body = await res.json();
  console.log(n, res.status, body.error, body.message);
}
'
```

期望：1 到 6 打印 `401 share_unavailable 无法打开分享`；7 和 8 打印 `429 rate_limited 请稍后再试`。这是应用 429（`SHARE_UNLOCK_LIMIT` 默认 6），不是边缘。进程日志里没有 `zone=memora_share_unlock`。

然后看日志。访问日志在 `/var/log/caddy/memora-access.log`，进程日志在同目录的 `memora-system.log`：

```bash
docker compose -f compose.prod.yml exec -T caddy cat /var/log/caddy/memora-access.log
docker compose -f compose.prod.yml exec -T caddy cat /var/log/caddy/memora-system.log
```

访问日志里这条 URI 是 `/api/v1/public/shares/***/unlock`。没有 43 位令牌，没有 `Cookie`、`Authorization`，也没有 JSON 正文里的口令。查询串里的 `password` 和 `token` 写成 `***`。`Referer` 里的 `/s/<令牌>` 同样是 `***`。经 Caddy 超额时，进程日志有 `msg` 为 `rate limit exceeded`、`zone` 为 `memora_share_unlock`，字段里没有请求路径。直连 api 的应用 429 不出现在这份日志里。

可选：公开分享 GET。先等上一分钟的解锁计数过期，再用同一个 43 位假令牌。前 60 次是应用的 404 `share_not_found`「分享不存在」，第 61 次是 Caddy 的 429 `rate_limited`「请稍后再试」。进程日志的 `zone` 是 `memora_public_shares`。日志里的路径是 `/api/v1/public/shares/***`。

```bash
for n in $(seq 1 61); do
  code="$(curl -sS -o /tmp/memora-share.body -w '%{http_code}' \
    "http://127.0.0.1/api/v1/public/shares/${token}")"
  printf '%s %s ' "$n" "$code"
  python3 -c 'import json; b=json.load(open("/tmp/memora-share.body")); print(b.get("error"), b.get("message"))'
done
rm -f /tmp/memora-share.body
```

### TLS 证书续期

生产站点地址是 `{$MEMORA_DOMAIN}`，写在 `proxy/Caddyfile.prod`。设成纯域名（例如 `photos.example.com`，不要带 `https://`、端口或路径）后，Caddy 打开自动 HTTPS：用 ACME 申请证书，80 上的 HTTP 会跳到 HTTPS。本仓库没有改 `acme_ca`，默认机构是 Let's Encrypt。不要把测试 CA 留在公网配置里。

续期由 Caddy 在后台做，不需要 cron。默认大约每 10 分钟检查一次已加载的证书；剩余寿命不到大约三分之一时开始续（90 天的证书大约还剩 30 天）。续期仍然走 ACME，公网要能访问这台机器的 80（HTTP-01）和 443（TLS-ALPN-01），DNS 要指过来。

`MEMORA_DOMAIN` 留空时，Compose 传入 `:80`。Caddy 只提供明文 HTTP，不申请证书，站点也不听 443。用 `http://127.0.0.1`。这种开法不要放到公网。`compose.prod.yml` 仍映射了宿主机的 443，但里面没有证书站点。

证书和 ACME 账号在卷 `caddy_data`，容器里是 `/data`（官方镜像的 `XDG_DATA_HOME`）。某个域名的证书通常在：

```text
/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/<域名>/
```

目录里有 `.crt`、`.key` 和元数据，私钥在这里。进程用户是镜像里的 `caddy`（非 root）。构建时 `/data`、`/config`、`/var/log/caddy` 交给这个用户，日志目录权限是 `750`。不要把卷改成所有人可读，也不要用 root 拥有的宿主机目录盖住 `/data` 却不改属主。`docker compose down -v` 会连证书一起删掉。升级不要加 `-v`。

域名留空时不会出现 `certificates`。Caddy 自己写下的 `instance.uuid` 和 `last_clean.json` 是 `600`，`locks` 是 `700`。证书签发后私钥仍在这棵树里，不要拷到别的目录再改成所有人可读。`caddy validate` 和 `caddy reload` 都带 `--config /etc/caddy/Caddyfile --adapter caddyfile`。reload 不会在明文模式下变出一张证书。

通知邮箱写在 `proxy/Caddyfile` 的全局块：`email you@example.com`。改完执行：

```bash
docker compose -f compose.prod.yml up -d --force-recreate caddy
```

没有邮箱也能签发。Let's Encrypt 只是不会发过期邮件。

查看配置、版本和存储。不要把 `.key` 的内容贴到工单：

```bash
docker compose -f compose.prod.yml exec -T caddy caddy version
docker compose -f compose.prod.yml exec -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose -f compose.prod.yml exec -T caddy ls -la /data/caddy
docker compose -f compose.prod.yml logs --since 24h caddy
```

访问日志在卷 `caddy_logs` 的 `/var/log/caddy/memora-access.log`，进程日志在同目录的 `memora-system.log`。续期失败看进程日志。

常见原因：

- DNS 还没指到这台机器，或防火墙没放行 80/443
- `MEMORA_DOMAIN` 写成了 IP、`localhost`、带协议或带路径
- 域名留空：这是本机明文，本来就没有证书
- 系统时间偏差太大
- `/data` 不可写，日志里是 permission denied
- Let's Encrypt 速率限制。先看日志里的原话，不要连续重试
- 只执行 `reload` 时，内存里的旧证书还在

没有单独的「立即续期」子命令。配置没问题、证书仍然有效时，重载不会重签：

```bash
docker compose -f compose.prod.yml exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

只有证书被吊销，或确认必须重新签发时，才删掉**该域名**目录再重启容器。`reload` 不够。这会消耗 Let's Encrypt 额度，不要拿来做例行检查：

```bash
docker compose -f compose.prod.yml exec -T caddy \
  rm -rf /data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/photos.example.com
docker compose -f compose.prod.yml restart caddy
```

把 `photos.example.com` 换成实际域名。不要删整个 `caddy_data` 卷。排查时如果要先打测试 CA，临时在全局块加上下面这一行，测完删掉，再按上面的办法换成正式证书。测试证书浏览器不认：

```caddy
acme_ca https://acme-staging-v02.api.letsencrypt.org/directory
```

### 健康检查

`restart: unless-stopped` 只在进程退出时拉起，不会因为 healthcheck 变成 unhealthy 就重启。外部监控要看 `docker compose ps`，也要看公网 curl。

| 服务 | 容器内检查 | 间隔 | 超时 | 重试 | 启动宽限 |
|------|------------|------|------|------|----------|
| web | `GET http://127.0.0.1:3000/login` | 10s | 5s | 8 | 20s |
| api | `GET http://127.0.0.1:3001/health` | 10s | 5s | 8 | 10s |
| worker | `GET http://127.0.0.1:3002/health` | 10s | 5s | 8 | 15s |
| postgres | `pg_isready -U <POSTGRES_USER> -d <POSTGRES_DB>` | 5s | 5s | 10 | 无 |
| redis | `redis-cli ping` | 5s | 3s | 10 | 无 |
| minio | `mc ready local` | 5s | 5s | 10 | 10s |
| caddy | `GET http://127.0.0.1:2019/config/` | 10s | 5s | 8 | 5s |

Caddy 的管理接口只绑在容器内的 localhost，没有映射到宿主机。ml 另有内部 `GET :8000/health`，同样没有宿主机端口。minio-init 是一次性任务，没有 healthcheck，退出码 0 才算完成。

人工检查。有域名时把主机换成 `https://photos.example.com`。`/health` 经 Caddy 直达 api，不经过登录。`/login` 是页面。`/ready` 由 Caddy 自己返回 `ok`，只说明反代进程在应答。worker 的 `/health` 只表示进程还活着。

```bash
docker compose -f compose.prod.yml ps
curl -fsS http://127.0.0.1/health
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1/login
curl -fsS http://127.0.0.1/ready
docker compose -f compose.prod.yml exec -T postgres pg_isready -U "${POSTGRES_USER:-memora}" -d "${POSTGRES_DB:-memora}"
docker compose -f compose.prod.yml exec -T redis redis-cli ping
docker compose -f compose.prod.yml exec -T minio mc ready local
docker compose -f compose.prod.yml exec -T api node -e "fetch('http://127.0.0.1:3001/health').then(async (r)=>console.log(r.status, await r.text()))"
docker compose -f compose.prod.yml exec -T worker node -e "fetch('http://127.0.0.1:3002/health').then(async (r)=>console.log(r.status, await r.text()))"
docker compose -f compose.prod.yml exec -T web node -e "fetch('http://127.0.0.1:3000/login').then((r)=>console.log(r.status))"
docker compose -f compose.prod.yml exec -T caddy wget -q -O /dev/null http://127.0.0.1:2019/config/
```

建议：公网每 60 秒探一次 `GET /health` 和 `GET /login`，连续 3 次失败再告警。每 1 到 5 分钟看一次 `docker compose ps` 里有没有 unhealthy。不要用登录或注册的 POST 做探活，那一档一分钟只有 5 次。unhealthy 或这三条 curl 失败时，按「何时看哪一节」进入自检清单看日志。磁盘、备份新鲜度和 429 计数见「监控告警」。备份节奏见「备份与恢复」。

### 何时看哪一节

先分清两条路径。入口或容器不健康走自检清单；证书、磁盘、429、备份目录走速查。两条可以连着做。

`docker compose ps` 里有服务不是 healthy，或 `/health`、`/login`、`/ready` 不是 200（连不上时状态码是 `000`）：先做「健康检查失败时的自检清单」。按那一节的三条 curl，再按服务看 `logs`。

证书过期或不被信任、磁盘满、响应 429、备份目录权限不对：做「常见故障速查」。这四件事有时三条 GET 仍是 200，自检清单盖不住。速查每件只写现象、检查、处理，长步骤留在专章。

| 你看到的 | 打开 |
|----------|------|
| 有服务不是 healthy，或 `/health`、`/login`、`/ready` 不是 200 | 「健康检查失败时的自检清单」 |
| 浏览器报证书过期或不被信任 | 「常见故障速查」的「证书续期失败」 |
| 磁盘到了告警，或上传失败但入口仍是 200 | 「常见故障速查」的「磁盘满」 |
| 响应是 429，而这三条 GET 仍是 200 | 「常见故障速查」的「429 误判」 |
| `backup.sh` 的 `mkdir` / `chmod` 失败，或没有新的 `manifest-*.txt` | 「常见故障速查」的「备份目录权限」 |

自检的日志已经指到证书卷、磁盘、429 或备份目录时，再打开速查里同名的小节。打开速查之前，先看过 `ps` 和这三条 GET。磁盘使用率和备份新鲜度仍见「监控告警」。备份节奏见「备份与恢复」。

### 健康检查失败时的自检清单

`ps` 里有服务不是 healthy，或下面三条不是 200，在仓库根目录按这个顺序做。项目名是 `compose.prod.yml` 里的 `memora-prod`。命令和本文其他地方一样，写 `-f compose.prod.yml`。有域名时把主机换成 `https://photos.example.com`。开发栈 `docker compose up -d` 的项目名是 `memora`，里面没有 web、api、worker、caddy。和「常见故障速查」怎么分工，见「何时看哪一节」。

公网只探这三条 GET。路径和 `deploy/self-host/proxy/Caddyfile.prod` 一致。

| 路径 | 谁答 | 正常 |
|------|------|------|
| `/health` | Caddy 转到 `api:3001` 的 `/health` | 200 |
| `/login` | Caddy 转到 `web:3000` 的登录页 | 200 |
| `/ready` | Caddy 自己返回 `ok` | 200 |

`/health` 不经过登录。`/ready` 只说明反代进程在应答。worker 的 `GET http://127.0.0.1:3002/health`、ml 的 `GET http://127.0.0.1:8000/health`、Caddy 管理接口 `GET http://127.0.0.1:2019/config/` 没有映射到宿主机，探法在「健康检查」。不要用 `POST /api/v1/auth/login` 做探活。

```bash
docker compose -f compose.prod.yml ps
curl -sS --max-time 5 --max-redirs 0 -o /dev/null -w 'health %{http_code}\n' http://127.0.0.1/health
curl -sS --max-time 5 --max-redirs 0 -o /dev/null -w 'login %{http_code}\n' http://127.0.0.1/login
curl -sS --max-time 5 --max-redirs 0 -o /dev/null -w 'ready %{http_code}\n' http://127.0.0.1/ready
```

连不上时状态码是 `000`。三条都是 200 时，worker 或 ml 仍可能不健康，以 `ps` 为准。

然后看日志。服务名与 `compose.prod.yml` 相同。只看一个服务时把名字留在最后：

```bash
docker compose -f compose.prod.yml logs --tail 100 api
```

一次看完：

```bash
docker compose -f compose.prod.yml logs --tail 100 web api worker postgres redis minio caddy ml minio-init
```

三条都是 `000` 时先看 `caddy`。只有 `/health` 失败先看 `api`，再看 `postgres`、`redis`、`minio` 和 `minio-init`。只有 `/login` 失败看 `web`。只有 `/ready` 失败看 `caddy`。Caddy 写在卷里的 `memora-system.log` 见「TLS 证书续期」。证书续期、磁盘、429 和备份目录见「常见故障速查」。

### 常见故障速查

服务不是 healthy，或 `/health`、`/login`、`/ready` 不是 200，先做「健康检查失败时的自检清单」。这里只收那一节盖不住的四件事：证书续期、磁盘满、429、备份目录权限。每件是现象、检查、处理。长步骤留在专章。两条怎么选，见「何时看哪一节」。

#### 证书续期失败

现象：浏览器报证书过期或不被信任，HTTPS 起不来。

检查：证书和 ACME 账号在卷 `caddy_data`，容器里是 `/data`。续期失败看进程日志 `/var/log/caddy/memora-system.log`。在仓库根目录：

```bash
docker compose -f compose.prod.yml exec -T caddy cat /var/log/caddy/memora-system.log
docker compose -f compose.prod.yml exec -T caddy ls -la /data/caddy
```

处理：DNS 指到这台机器，防火墙放行 80 和 443。日志里 `/data` 是 permission denied，就是卷不可写；不要用 root 拥有的宿主机目录盖住 `/data` 却不改属主。其余原因和重签见「TLS 证书续期」。不要删整个 `caddy_data`。

#### 磁盘满

现象：「监控告警」用 `df`，使用率达到 85%（`MEMORA_DISK_PERCENT`）就记一笔。默认看 `/`。备份目录在另一块盘、并且那一块也到 85% 时，再单独记一笔。

检查：项目 `memora-prod` 的 Compose 卷在 Docker 数据盘上：`memora_pg_data`、`memora_redis_data`、`memora_minio_data`、`caddy_data`、`caddy_config`、`caddy_logs`。`MEMORA_BACKUP_DIR` 默认 `/var/backups/memora`，按「备份与恢复」放在另一块盘，不要和这些卷同一块盘。

处理：数据盘满时，库和对象写不进去，上传失败，Caddy 也写不进 `caddy_logs` 里的 `memora-access.log` 和 `memora-system.log`。备份盘满时，`backup.sh` 写不出 dump 和 `manifest-*.txt`，站点仍可能是 200。先腾出对应那块盘的空间，再按「做一次备份」补一份。不要用 `docker compose down -v` 腾空间。

#### 429 误判

现象：响应是 429，正文 `rate_limited`，「请稍后再试」。`/health`、`/login`、`/ready` 仍是 200 时，这是额度用完，不是宕机。零星 429 按预期限流处理，不要当成故障。「监控告警」要一轮解锁 429 达到 30 次、登录 429 达到 20 次才外发。

检查：解锁有两层，见「解锁限流」。边缘是 Caddy zone `memora_share_unlock`（`proxy/Caddyfile.ratelimit` 的 `events`，默认每分钟 6 次，第 7 次 429），进程日志有 `zone=memora_share_unlock`。应用层是 `SHARE_UNLOCK_LIMIT`（默认 6）。经 Caddy 时边缘先拦；直连 api 的应用 429 不写这个 zone。登录和注册共用 zone `memora_auth`，每分钟 5 次，第 6 次 429。登出和 `GET /api/v1/auth/me` 不在这档，见「登录限流」。

处理：等这一分钟过去再试。出口 IP 很多人共用时，按那两节把次数调高。不要为了消掉 429 关掉限流。

#### 备份目录权限

现象：跑 `deploy/self-host/backup.sh` 时 `mkdir` 报 permission denied，或 `chmod` 报 Operation not permitted，目录里没有新的 `manifest-*.txt`。

检查：`MEMORA_BACKUP_DIR` 默认 `/var/backups/memora`，和「做一次备份」里的 `BACKUP_DIR` 是同一条路径。目录 `700`，dump `600`。脚本 `umask 077`，并自己 `chmod`。父目录不可写，或目录属主不是当前用户时，这一步会失败。

处理：见「备份与恢复」。由跑备份的用户建好目录，属主留在这个用户上：

```bash
mkdir -p /var/backups/memora
chmod 700 /var/backups/memora
```

不要把目录改成所有人可写。

这四件对不上，或 `ps` 不是 healthy、三条 GET 不是 200，回到「健康检查失败时的自检清单」。

### 监控告警

默认关闭。`compose.prod.yml` 不启动监控容器，仓库里没有已启用的 cron。不跑下面的脚本，生产栈和现在一样。本机照抄的命令和默认阈值在上面「监控最短路径」。

建议看这些信号。可选脚本是 `deploy/self-host/monitoring/check.sh`，变量表在同目录的 README。

| 信号 | 从哪看 | 脚本默认 |
|------|--------|----------|
| caddy、web、api、worker、postgres、redis、minio | `docker compose ps` 的 healthy | 不是 healthy 就记一笔。`starting` 只打印 |
| 公网入口 | `GET /health`、`GET /login`、`GET /ready` | 连续 3 次失败再记成要外发 |
| 磁盘 | `df` 使用率 | 达到 85%。默认看 `/`，备份目录在另一块盘时再看那一块 |
| 备份 | 最新 `manifest-*.txt` 的修改时间 | 超过 26 小时，或目录里没有 manifest，就记一笔。不读正文 |
| 解锁 429 | Caddy 进程日志 `zone=memora_share_unlock` | 只数新出现的行。一轮里达到 30 次再外发 |
| 登录 429 | 同一份日志 `zone=memora_auth` | 一轮里达到 20 次再外发 |
| 公开分享 429 | `zone=memora_public_shares` | 只打印次数 |

ml 建议在 `docker compose ps` 里一起看，脚本不把它算进失败。应用没有 Prometheus 出口。进程日志保持 `INFO`，`rate limit exceeded` 那一行不带请求路径。脚本只输出次数。

第一次真正执行会从日志末尾起算，不回放旧的 429。`--dry-run` 不写偏移。

告警渠道写在仓库外。示例是 `deploy/self-host/monitoring/env.monitor.example` 里的 `https://hooks.example.com/memora` 和 `ops@example.com`。`MEMORA_ALERT_ENABLE` 默认 `0`：检查照常做，只打印，不外发。设成 `1` 之后才会 POST JSON `{"text":"..."}`，或交给本机的 `mail` / `sendmail`。示例地址即使打开开关也不会发出去。Webhook 用 https，URL 里不要夹带账号口令。SMTP 口令留在本机 MTA，不要写进 env。`MEMORA_ALERT_ENABLE=1` 时这个文件权限必须是 `400` 或 `600`。

```bash
deploy/self-host/monitoring/check.sh --self-test
umask 077
sudo mkdir -p /etc/memora
sudo cp deploy/self-host/monitoring/env.monitor.example /etc/memora/monitor.env
sudo chmod 600 /etc/memora/monitor.env
MEMORA_MONITOR_ENV=/etc/memora/monitor.env deploy/self-host/monitoring/check.sh --dry-run
```

`--dry-run` 不写状态、不外发。输出里不应出现口令、Webhook URL 或邮箱。确认之后把仓库外文件的 `MEMORA_ALERT_ENABLE` 改成 `1`，换上自己的渠道，再加 cron（路径按机器改）。下面是每 5 分钟一次。要贴近上面「每 60 秒」的建议，把分钟改成 `*`，连续 3 次失败大约 3 分钟。

```cron
*/5 * * * * MEMORA_MONITOR_ENV=/etc/memora/monitor.env /opt/memora/deploy/self-host/monitoring/check.sh
```

同一组问题 6 小时内不重复外发。退出码 1 表示这一轮有要看的问题。跑 cron 的用户要能访问 Docker。

### 活体抽查

第一次上线、升级之后，以及每季度，和「备份与恢复」里的演练一起做。演练是否通过仍以那一节的验收清单为准。这里是对外服务能不能用的顺序：登录、相册、备份、恢复命令、解锁限流。

口令放临时 env 或 Docker secret，不要写进仓库、工单或日志。项目名保持 `memora-prod`。演练项目是 `memora-backup-drill`。开发栈是 `memora`。不要对着生产库做演练删除。

本机已经有开发用的 `.env` 时不要覆盖它。另写一份权限 `600` 的文件（放在 `/tmp` 或仓库外），用 Compose v2 的 `COMPOSE_ENV_FILES`。指定之后，这次 Compose 不再读项目目录里的 `.env`。`backup.sh` 和 `restore.sh` 内部的 `docker compose` 会继承这个变量。

```bash
COMPOSE_ENV_FILES=/tmp/memora-prod.env docker compose -f compose.prod.yml up -d --build
```

没有域名时按「启动」把 `MEMORA_DOMAIN` 留空，只用 `http://127.0.0.1`。明文抽查设 `COOKIE_SECURE=false`。公网改回 `true`。

下面的邮箱、口令和 Cookie 都是占位，换成一次性值。输出里打掉口令和 `memora_session`。注册和登录 POST 共用每分钟 5 次，先做完业务步骤，再做限流短测。解锁 POST 每分钟 6 次，公开分享 GET 每分钟 60 次，这两项不要放在同一分钟。

1. 健康。按「健康检查」的 `ps` 和 curl。web、api、worker、postgres、redis、minio、caddy 为 healthy，minio-init 退出码 0。不健康时按「健康检查失败时的自检清单」看日志。
2. 端口。`docker compose -f compose.prod.yml ps` 只发布 `80` 和 `443`。不要出现 5432、6379、9000、9001、3000、3001、3002。`docker ps` 里如果看到 `443/udp` 或 `2019/tcp`，但前面没有 `0.0.0.0:`，那是镜像暴露的端口，没有映射到宿主机。管理端口 2019 只在容器内。
3. 注册或登录：

```bash
umask 077
curl -sS -c /tmp/memora.cookies -X POST http://127.0.0.1/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"spotcheck@example.com","password":"replace-with-8-plus-chars"}'
curl -sS -b /tmp/memora.cookies http://127.0.0.1/api/v1/auth/me
```

4. 建相册：

```bash
curl -sS -b /tmp/memora.cookies -X POST http://127.0.0.1/api/v1/albums \
  -H 'content-type: application/json' \
  -d '{"title":"抽查","themeId":"kyoto-lantern"}'
```

5. 上传探针。`POST /api/v1/assets/upload-url`，正文带 `filename`、`mime`、`size`，可以带上一步的 `albumId`。返回的 `url` 指向内部的 `minio:9000`，宿主机解析不了，也不要打印这个 URL。把响应存进权限 `600` 的临时文件，在 api 容器里按返回的 `headers` 做 PUT，再 `POST /api/v1/assets/<assetId>/complete`。浏览器里的拖拽上传标「需运维人工」。
6. 备份。按「做一次备份」执行 `backup.sh --compose`。目录里要有 `manifest-<时间>.txt`，目录权限 `700`，dump 权限 `600`。标准输出里没有口令。
7. 恢复命令。`restore.sh --dry-run --stamp <时间>` 只核对文件，不改库。隔离的完整路径用「演练」里的 `restore-drill.sh`（先 `--dry-run`，再不带参数），或按顺序贴同一节的空目录演练、校验、回滚。不要对 `memora-prod` 加 `--yes` 做演练。
8. 解锁限流。按「解锁限流」对一个 43 位假令牌连续 POST `.../unlock`。经 Caddy：前 6 次是 401「无法打开分享」，第 7 次多为边缘 429「请稍后再试」（`rate_limited`，带 `Retry-After`；Caddy 先拦）。api 容器内绕过 Caddy、直连 `127.0.0.1:3001`：前 6 次仍是 401，第 7 次是应用 429，正文同为 `rate_limited`（`SHARE_UNLOCK_LIMIT` 默认 6）。可选的公开 GET 见那一节，和这次解锁隔开一分钟。
9. 访问日志。用上一节的请求看 `/var/log/caddy/memora-access.log`。路径是 `/api/v1/public/shares/***/unlock`，`Referer` 里的 `/s/` 令牌也是 `***`。没有 Cookie 值、Authorization、查询串口令或 JSON 正文。经 Caddy 超额的那几行进程日志是 `zone=memora_share_unlock`，字段里没有请求路径。直连 api 的应用 429 不在这份日志里。登录密码同样只在 JSON 正文里，访问日志不记正文。
10. 登录限流。同一来源连续 POST `/api/v1/auth/login`，第 6 次是 429，正文含 `请稍后再试`。测完等一分钟再给真人登录。登录和注册单独一档，按来源 IP。测完给真人用之前留出这一分钟。
11. 页面点击（打开登录页、进入相册、拖拽上传）标「需运维人工」。第 3 到 5 步的 curl 是替代。

勾选：

- [ ] 七个服务 healthy，minio-init 退出码 0
- [ ] 宿主机只发布 80 和 443
- [ ] `/health`、`/login`、`/ready` 正常
- [ ] 注册或登录后 `/api/v1/auth/me` 为 200
- [ ] 建册成功
- [ ] 上传探针已完成，或注明需运维人工并留下 curl
- [ ] `backup.sh --compose` 写出 manifest，权限正确，输出无口令
- [ ] `restore.sh --dry-run --stamp` 成功；`restore-drill.sh` 或空目录三段按「演练」通过，没有动 `memora` / `memora-prod`
- [ ] 假令牌解锁：经 Caddy 前 6 次 401「无法打开分享」，第 7 次多为边缘 429「请稍后再试」；直连 api 第 7 次为应用 429（同一 `rate_limited` 正文）
- [ ] 访问日志路径为 `***`，无 Cookie、Authorization 和口令
- [ ] 登录第 6 次 429
- [ ] 浏览器点击已由运维人工过，或明确留下未做

### 升级

在仓库根目录做。项目名是 `compose.prod.yml` 里的 `memora-prod`。命令写 `-f compose.prod.yml`。不要加 `-v`，也不要 `docker compose down -v`。`-v` 会删掉数据库、对象和证书卷。

1. 升级前备份。用「做一次备份」里升级前那一条（`--compose --pause-writers`）。成功时最后一行是 `[memora] backup written under <目录> stamp=<时间>`。把这一行里的 stamp 记下来，回滚用它。目录里要有 `manifest-<时间>.txt`。

```bash
BACKUP_DIR=/var/backups/memora S3_BUCKET=memora-prod \
  deploy/self-host/backup.sh --compose --pause-writers
```

`--pause-writers` 只停止当时正在跑的 api / worker，失败也会尽量拉起来。不要在脚本外面再 `stop postgres` 或 `stop minio`。见「停写，还是不停库」。

2. 升级。用了 `compose.prod.override.yml` 时，按「启动」再加一个 `-f`，项目名不变。

```bash
git pull
docker compose -f compose.prod.yml up -d --build
```

无单独迁移步骤。表仍按「存储」在 API 或 Worker 第一次连上 Postgres 时创建。

3. 升级后核对。按「健康检查」看 `ps` 和下面三条。有域名时把主机换成 `https://photos.example.com`。web、api、worker、postgres、redis、minio、caddy 为 healthy，minio-init 退出码 0。不是 healthy，或这三条不是 200，按「健康检查失败时的自检清单」看日志。登录、相册和限流见「活体抽查」。

```bash
docker compose -f compose.prod.yml ps
curl -fsS http://127.0.0.1/health
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1/login
curl -fsS http://127.0.0.1/ready
```

4. 不行就回滚。用第 1 步记下的 stamp，走「恢复」里的覆盖命令。stamp 换成升级前那一份。那一节的 `--fresh` 只给新卷、空库，升级回滚不要加，也不要 `down -v`：

```bash
BACKUP_DIR=/var/backups/memora S3_BUCKET=memora-prod \
  deploy/self-host/restore.sh --compose --stamp 20260101T000000Z --yes
```

`--compose` 会停下正在跑的 api / worker，恢复完不自动拉起。抽查通过后再：

```bash
docker compose -f compose.prod.yml start api worker
```

Redis 保持空队列，不要把旧 AOF 拷回来。没有 `--yes` 不会改数据。

### 备份与恢复

逻辑备份，不拍 Docker 卷。Postgres 用 `pg_dump` 自定义格式，对象桶用 `mc mirror`。Redis 只放 BullMQ 队列，**不备份**。恢复后让 Redis 空着，不要把旧 AOF 拷回来，否则过期任务会重放。

脚本在 `deploy/self-host/`：

| 文件 | 作用 |
|------|------|
| `backup.sh` | `pg_dump`，然后 `mc mirror`。写出 `manifest-<时间>.txt` |
| `restore.sh` | 按 manifest 校验后恢复。没有 `--yes` 不会改数据 |
| `backup-config.sh` | 复制 `.env`、`compose.prod.override.yml`、`deploy/self-host/secrets`。不打印内容 |
| `restore-drill.sh` | 隔离演练，或 `--dry-run` 做不连库的自检 |
| `compose.drill.yml` | 演练专用项目 `memora-backup-drill`。不映射端口，不动 `memora` / `memora-prod` 的卷 |

在仓库根目录执行。`BACKUP_DIR` 放到另一块盘或另一台机器，不要和数据库、MinIO 卷同一块盘。上线或升级后的整路径（登录、相册、备份、恢复命令、日志和限流）见「活体抽查」。

#### 目标与节奏

| 项 | 建议 |
|----|------|
| RPO | 24 小时：每天一份成功备份。升级前再加一份。照片更新很勤时改成每 6 小时。RPO 就是距离最近一份**完整** manifest 的时间 |
| RTO | 小库（几十 GB 以内）按 2 小时准备到「库和桶都能读」。这是目标，不是保证。演练要记下真实体积和耗时，再改这个数 |
| 演练 | 上线前至少一次。之后每季度一次。改了备份脚本、换盘或改了卷，再加一次 |

空库演练只证明步骤是通的，不能代替全量照片的计时。

#### 停写，还是不停库

`pg_dump` 走 MVCC，得到一份一致的库快照，**不用停 Postgres**，也不会为了备份长时间锁表。MinIO 没有和这次快照绑在一起。

顺序固定为先 dump、再镜像桶。不停写时，镜像比快照更新，窗口里的新上传多半只是桶里多一个没有库记录的对象。反过来先镜像再 dump，容易出现「库里有键、桶里没有」。窗口里的删除仍可能留下悬空键。

| 做法 | Postgres / MinIO | api / worker | 何时 |
|------|------------------|--------------|------|
| 不停写 | 都继续跑 | 继续服务 | 每天例行 |
| 停写 | 都不停。停了就没法 dump 和 mirror | 备份前停下，结束再启动 | 升级前，以及每月一次对齐 |

停写交给脚本：`--pause-writers` 只停止**当时正在跑**的 api / worker，失败也会尽量拉起来。不要在备份脚本外面再 `stop postgres` 或 `stop minio`。

#### 做一次备份

每天，不停写：

```bash
mkdir -p /var/backups/memora
chmod 700 /var/backups/memora
BACKUP_DIR=/var/backups/memora S3_BUCKET=memora-prod \
  deploy/self-host/backup.sh --compose
```

升级前，停写并对齐：

```bash
BACKUP_DIR=/var/backups/memora S3_BUCKET=memora-prod \
  deploy/self-host/backup.sh --compose --pause-writers
```

用了 `compose.prod.override.yml` 时，把两个文件用冒号拼起来（路径里不要再写冒号）：

```bash
COMPOSE_FILE=compose.prod.yml:compose.prod.override.yml \
  BACKUP_DIR=/var/backups/memora S3_BUCKET=memora-prod \
  deploy/self-host/backup.sh --compose --pause-writers
```

Compose 模式在容器里跑 `pg_dump` 和 `mc`，走内部网络的 `minio:9000`。口令留在容器环境或 Docker secret 里，不出现在宿主机参数上，也不写入 `~/.mc`。成功后目录里有：

```text
manifest-<UTC时间>.txt
memora-<UTC时间>.dump
objects-<UTC时间>/
objects-<UTC时间>.sha256
```

没有 manifest 的目录不要拿去恢复。dump 权限是 `600`，目录是 `700`。

宿主机上已经有 `pg_dump` 和 `mc`、并且能连上库和桶时，可以不带 `--compose`，改用 `DATABASE_URL`、`S3_ENDPOINT`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`。`S3_ENDPOINT` 不要把口令写进 URL。生产 Compose 没有把 5432 和 9000 映射出来，所以生产用 `--compose`。

只看参数、不连库：

```bash
deploy/self-host/backup.sh --dry-run
deploy/self-host/backup.sh --compose --dry-run
```

#### 密钥与配置

`.env` 和 `deploy/self-host/secrets/` 不进 git。数据备份默认也不抄它们，避免口令混进照片备份。单独复制，且不要把输出贴到工单里：

```bash
BACKUP_DIR=/var/backups/memora deploy/self-host/backup-config.sh --yes
```

脚本只复制已经存在的 `.env`、`compose.prod.override.yml`、`deploy/self-host/secrets/`。文件落到 `config-<时间>/`，权限 `600`（目录 `700`）。想改路径时用冒号分隔的 `BACKUP_CONFIG_SOURCES`，不要在路径里再写冒号。

Docker secret 的口令文件在仓库外或 `secrets/`（已 gitignore）。override 示例见上面「环境」。恢复配置是手动把这些文件放回原处，脚本不会自动覆盖正在使用的 `.env`。

`--dry-run` 只打印每个候选文件在不在，不读内容。要换口令时做下一节「密钥轮换」，不要把 `config-<时间>/` 里的旧口令抄回去。

#### 密钥轮换

备份离开过这台机器、`.env` 或 `deploy/self-host/secrets/` 泄漏，或到了你们的轮换周期，做这一节。验收清单里「备份若离开过本机」那一项，做完再勾。副本怎么留见上面「密钥与配置」，不要把口令贴进工单。

换这些，规则和「环境」相同：

- `POSTGRES_PASSWORD`。不改 `POSTGRES_USER`
- `MINIO_ROOT_PASSWORD` 和 `S3_SECRET_ACCESS_KEY`，必须仍是同一个新口令。不改 `MINIO_ROOT_USER`
- 用了 Docker secret 时，改 `deploy/self-host/secrets/postgres_password`、`minio_root_password`、`s3_secret_access_key`。`.env` 里这几项留空。`compose.prod.override.yml` 不用改，`file:` 仍是「环境」里那三份
- `.env` 里若有未注释的 `DATABASE_URL=`，先把其中的口令换成新的 Postgres 口令，或删掉这一行让入口自己拼。下面的命令碰到这一行会停

现象：`BACKUP_DIR` 或 `config-<时间>/` 离开过这台机器，或口令文件出现在工单、聊天、别的仓库。

检查（不要打开文件内容）：

```bash
test -f compose.prod.override.yml && echo override=yes || echo override=no
```

`override=yes`，且 `file:` 就是上面三个路径：写 secret 文件。`override=no`：改 `.env`。`file:` 指到仓库外时，把同样的两份新口令写进那些文件，`.env` 里的口令行留空，然后只做下面脚本里的 `up -d --force-recreate`。

处理：在仓库根目录用 bash 贴。会先停下 api / worker。口令用 `od` 生成，只进变量和权限 `600` 的文件，不进 `docker compose` 的参数，也不要 `set -x`。项目名是 `memora-prod`。脚本会清掉演练留下的 `COMPOSE_PROJECT_NAME`，避免打到 `memora-backup-drill`。

已经有 `memora_pg_data` 时，Postgres 镜像只在空卷第一次初始化时读 `POSTGRES_PASSWORD`。所以先在容器本地套接字上 `ALTER ROLE`，再改文件。MinIO 这一版重建之后才从 `MINIO_ROOT_PASSWORD` 或 `MINIO_ROOT_PASSWORD_FILE` 读新的根口令。

用 `up -d --force-recreate` 让 postgres、minio、minio-init 读到新口令。不要加 `-v`，也不要 `docker compose down -v`。`-v` 会删掉数据库、对象和证书卷。

「恢复」之后相册还没抽查、api / worker 还不能对外：把 `START_APPS` 改成 `0`。抽查通过后再 `--force-recreate` 拉起 api / worker。不要用「恢复」里的 `start`：`start` 沿用容器创建时的旧环境。

```bash
set -euo pipefail
umask 077
cd "$(git rev-parse --show-toplevel)"
unset COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_ENV_FILES
# 恢复后还不能对外时改为 0
START_APPS=1
if [[ "$START_APPS" != "0" && "$START_APPS" != "1" ]]; then
  printf '[memora] START_APPS 只能是 0 或 1\n' >&2
  exit 1
fi
if [[ ! -f .env ]]; then
  printf '[memora] 缺少 .env\n' >&2
  exit 1
fi
if grep -q '^DATABASE_URL=' .env; then
  printf '[memora] .env 里有 DATABASE_URL。先改掉其中的口令，或删掉这一行\n' >&2
  exit 1
fi
if [[ -f compose.prod.override.yml ]]; then
  missing=0
  grep -q 'deploy/self-host/secrets/postgres_password' compose.prod.override.yml || missing=1
  grep -q 'deploy/self-host/secrets/minio_root_password' compose.prod.override.yml || missing=1
  grep -q 'deploy/self-host/secrets/s3_secret_access_key' compose.prod.override.yml || missing=1
  if [[ "$missing" == "1" ]]; then
    printf '[memora] override 的口令文件不是 deploy/self-host/secrets/ 下那三份\n' >&2
    exit 1
  fi
  mode=secrets
  for secret_file in \
    deploy/self-host/secrets/postgres_password \
    deploy/self-host/secrets/minio_root_password \
    deploy/self-host/secrets/s3_secret_access_key
  do
    if [[ ! -f "$secret_file" ]]; then
      printf '[memora] 缺少 %s\n' "$secret_file" >&2
      exit 1
    fi
  done
else
  mode=env
  grep -q '^POSTGRES_PASSWORD=' .env || { printf '[memora] .env 缺少 POSTGRES_PASSWORD=\n' >&2; exit 1; }
  grep -q '^MINIO_ROOT_PASSWORD=' .env || { printf '[memora] .env 缺少 MINIO_ROOT_PASSWORD=\n' >&2; exit 1; }
fi
if [[ -z "${POSTGRES_USER:-}" ]]; then
  POSTGRES_USER=$(awk -F= '/^POSTGRES_USER=/{print substr($0, index($0,"=")+1); exit}' .env)
  POSTGRES_USER=${POSTGRES_USER:-memora}
fi
if [[ -z "${POSTGRES_DB:-}" ]]; then
  POSTGRES_DB=$(awk -F= '/^POSTGRES_DB=/{print substr($0, index($0,"=")+1); exit}' .env)
  POSTGRES_DB=${POSTGRES_DB:-memora}
fi
export POSTGRES_USER POSTGRES_DB
if [[ ! "$POSTGRES_USER" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  printf '[memora] POSTGRES_USER 只允许字母、数字和下划线\n' >&2
  exit 1
fi
printf '[memora] 轮换方式=%s\n' "$mode"
args=(-f compose.prod.yml)
if [[ "$mode" == "secrets" ]]; then
  args+=(-f compose.prod.override.yml)
fi
docker compose "${args[@]}" stop api worker
NEW_POSTGRES_PASSWORD=$(od -An -N 24 -tx1 /dev/urandom | tr -d ' \n')
NEW_MINIO_ROOT_PASSWORD=$(od -An -N 24 -tx1 /dev/urandom | tr -d ' \n')
export NEW_POSTGRES_PASSWORD NEW_MINIO_ROOT_PASSWORD
if [[ ! "$NEW_POSTGRES_PASSWORD" =~ ^[0-9a-f]{16,}$ || ! "$NEW_MINIO_ROOT_PASSWORD" =~ ^[0-9a-f]{16,}$ ]]; then
  printf '[memora] 新口令生成失败\n' >&2
  exit 1
fi
sql=$(mktemp)
tmp=$(mktemp)
chmod 600 "$sql" "$tmp"
trap 'rm -f "$sql" "$tmp"; unset NEW_POSTGRES_PASSWORD NEW_MINIO_ROOT_PASSWORD' EXIT
awk 'BEGIN {
  printf "ALTER ROLE %s PASSWORD '\''%s'\'';\n", ENVIRON["POSTGRES_USER"], ENVIRON["NEW_POSTGRES_PASSWORD"]
}' >"$sql"
docker compose "${args[@]}" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <"$sql"
rm -f "$sql"
if [[ "$mode" == "secrets" ]]; then
  awk 'BEGIN { printf "%s\n", ENVIRON["NEW_POSTGRES_PASSWORD"] }' >deploy/self-host/secrets/postgres_password
  awk 'BEGIN { printf "%s\n", ENVIRON["NEW_MINIO_ROOT_PASSWORD"] }' >deploy/self-host/secrets/minio_root_password
  awk 'BEGIN { printf "%s\n", ENVIRON["NEW_MINIO_ROOT_PASSWORD"] }' >deploy/self-host/secrets/s3_secret_access_key
  chmod 600 deploy/self-host/secrets/postgres_password \
    deploy/self-host/secrets/minio_root_password \
    deploy/self-host/secrets/s3_secret_access_key
  awk '
    /^POSTGRES_PASSWORD=/ { print "POSTGRES_PASSWORD="; next }
    /^MINIO_ROOT_PASSWORD=/ { print "MINIO_ROOT_PASSWORD="; next }
    /^S3_SECRET_ACCESS_KEY=/ { print "S3_SECRET_ACCESS_KEY="; next }
    { print }
  ' .env >"$tmp"
else
  if ! awk '
    BEGIN { pg = ENVIRON["NEW_POSTGRES_PASSWORD"]; mio = ENVIRON["NEW_MINIO_ROOT_PASSWORD"] }
    /^POSTGRES_PASSWORD=/ { print "POSTGRES_PASSWORD=" pg; pg_done = 1; next }
    /^MINIO_ROOT_PASSWORD=/ { print "MINIO_ROOT_PASSWORD=" mio; mio_done = 1; next }
    /^S3_SECRET_ACCESS_KEY=/ { print "S3_SECRET_ACCESS_KEY=" mio; next }
    { print }
    END { if (!pg_done || !mio_done) exit 4 }
  ' .env >"$tmp"; then
    printf '[memora] 没有写上 Postgres 或 MinIO 口令\n' >&2
    exit 1
  fi
fi
mv "$tmp" .env
chmod 600 .env
unset NEW_POSTGRES_PASSWORD NEW_MINIO_ROOT_PASSWORD
services=(postgres minio minio-init)
if [[ "$START_APPS" == "1" ]]; then
  services+=(api worker)
fi
docker compose "${args[@]}" up -d --force-recreate "${services[@]}"
trap - EXIT
rm -f "$sql" "$tmp"
if [[ "$START_APPS" == "1" ]]; then
  docker compose "${args[@]}" ps
  printf '[memora] 口令已轮换\n'
else
  printf '[memora] 口令已写入。api / worker 仍停止，抽查后用 up -d --force-recreate 拉起\n'
fi
```

重建的退出码是 0 之后，按「健康检查」看 `ps`。有域名时把主机换成 `https://photos.example.com`，和「启动」一样。

```bash
docker compose -f compose.prod.yml ps
curl -fsS http://127.0.0.1/health
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1/login
curl -fsS http://127.0.0.1/ready
```

`/login` 为 200 后，用原来的账号登录一次。这次不改用户口令哈希。不是 healthy，或这三条不是 200，按「健康检查失败时的自检清单」。备份介质可能被别人接触过时，做「备份离机后的会话收口」。

然后给新口令留一份副本。`BACKUP_DIR` 没有离开过这台机器时，用「密钥与配置」那条 `backup-config.sh --yes`。目录就是离开过的那一份时，改走「新口令不要写回离机目录」。旧的 `config-<时间>/` 不要再当现行口令。

整段可以重跑。重跑会再换一对新口令。`START_APPS=0` 时，抽查通过后在仓库根目录：

```bash
docker compose -f compose.prod.yml up -d --force-recreate api worker
```

有 `compose.prod.override.yml` 时按「启动」再加一个 `-f`。

#### 备份离机后的会话收口

验收清单里「备份介质可能被他人接触」这一项做这里。只在介质可能被别人碰到时做。单纯到了轮换周期、备份仍在你手里，不必截断会话。

`sessions` 只存会话令牌的哈希，用户表和口令哈希不动（表在 `packages/storage/migrations/002_auth.sql`）。覆盖恢复会把备份里的会话写回来，所以放在这次 `restore.sh` 成功之后。Postgres 在跑就可以做，不必先拉起 api / worker。表要等 API 第一次访问才创建；还没有 `sessions` 时下面第一条会失败，库里本来就没有会话。

```bash
docker compose -f compose.prod.yml exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-memora}" -d "${POSTGRES_DB:-memora}" \
  -c "TRUNCATE sessions;"
```

检查，输出应是 `0`：

```bash
docker compose -f compose.prod.yml exec -T postgres \
  psql -v ON_ERROR_STOP=1 -tA -U "${POSTGRES_USER:-memora}" -d "${POSTGRES_DB:-memora}" \
  -c "SELECT count(*) FROM sessions;"
```

有 `compose.prod.override.yml` 时按「启动」再加一个 `-f`。浏览器里的 `memora_session` 会失效，用原来的账号重新登录。不要 `docker compose down -v`。

#### 新口令不要写回离机目录

「密钥轮换」之后要给新口令留副本。命令仍是「密钥与配置」的 `backup-config.sh --yes`，不要另写一套复制。原来的 `BACKUP_DIR` 若就是离开过这台机器的那块盘或那个目录，不要再往那里写。换一个还在你手里的目录：

```bash
mkdir -p /var/backups/memora-kept
chmod 700 /var/backups/memora-kept
BACKUP_DIR=/var/backups/memora-kept deploy/self-host/backup-config.sh --yes
```

能装 age 时，先按「加密、权限、口令」设 `BACKUP_AGE_RECIPIENT`，再跑上面这条。没设时脚本留下明文 `config-<时间>/`，权限 `600`。验收清单里的「加密副本」指设了 age 的那一份。已经离机的 `config-<时间>/` 不要拷回来盖住现行 `.env` 或 `deploy/self-host/secrets/`。不要把这些文件贴进工单。

#### 加密、权限、口令

- 备份目录 `700`，dump 和密钥副本 `600`。脚本用 `umask 077`
- 备份盘最好是另一块已加密的磁盘（例如 LUKS）。和数据库同一块盘不算备份
- 可选：安装 [age](https://github.com/FiloSottile/age)，设置公钥 `BACKUP_AGE_RECIPIENT`（形如 `age1...`）。脚本会加密 dump 和对象包，并删掉明文。没有 age 时直接失败，不会假装已经加密
- 私钥文件权限 `400` 或 `600`，用 `BACKUP_AGE_IDENTITY` 指向它。私钥不要进仓库
- 没有 age 时可以手动 `gpg --encrypt`，加密后删除明文。`shred` 在 SSD 上也不等于彻底擦掉，加密盘更重要
- 脚本不 `set -x`，失败信息里的 URL 账号和已知口令会打成 `***`

恢复不会改应用用户的口令哈希。对外服务前：

1. 先别启动 api / worker，抽查相册
2. 备份离开过这台机器时，按「密钥轮换」做，并把 `START_APPS` 留在 `0`。那里会改 Postgres、MinIO 和 `.env` 的口令，以及对应的 Docker secret。api / worker 仍先别拉起
3. 备份介质可能被别人接触过时，按「备份离机后的会话收口」在库里 `TRUNCATE sessions;`。放在这次恢复成功之后，避免旧会话被备份写回来
4. Redis 保持空的

#### 恢复

先停写。`--compose` 时脚本会停下正在跑的 api / worker，**恢复完不自动拉起**。

覆盖现有库（升级回滚）：

```bash
BACKUP_DIR=/var/backups/memora S3_BUCKET=memora-prod \
  deploy/self-host/restore.sh --compose --stamp 20260101T000000Z --yes
```

新卷、空库（演练或换盘）加 `--fresh`，这样不会对空库做 `--clean`：

```bash
BACKUP_DIR=/var/backups/memora S3_BUCKET=memora-prod \
  deploy/self-host/restore.sh --compose --fresh --stamp 20260101T000000Z --yes
```

恢复前会核对 manifest 里的 sha256。对不上就停，不改库。对象默认只覆盖同名键，不删除备份之后新上传的对象。确定要把桶收成和备份完全一致时才加 `--exact-objects`（`mc mirror --remove`），这会删掉窗口之后的新照片。

确认抽查通过后再：

```bash
docker compose -f compose.prod.yml start api worker
```

没有改过口令时用上面的 `start`。按「密钥轮换」改过口令时，停着的容器仍是旧环境，改用那一节的 `up -d --force-recreate`，不要 `start`。

没有 `--yes` 时脚本直接退出。`--dry-run` 不连接数据库。

#### 演练

不碰开发项目 `memora`，也不碰生产项目 `memora-prod`。演练项目名是 `memora-backup-drill`，不映射宿主机端口。口令由脚本临时生成，不写进仓库，也不打印。

不需要 Docker 的自检（脚本语法、拒绝打印口令、配置副本权限、非法时间戳）：

```bash
deploy/self-host/restore-drill.sh --dry-run
```

成功时退出码是 0，最后一行是 `[memora] drill dry-run ok`。没有 Docker、也没有生产栈时，这一条仍然可以做。它只证明脚本自检通过。

完整冒烟需要 Docker，以及和 `compose.prod.yml` 相同的镜像标签（本机已有镜像时不会强行重新拉取）。这一条自己建空备份目录、写探针、`down -v` 换新卷、再 `restore.sh --fresh`。成功或失败都会拆掉演练容器和卷；成功时删掉临时目录，失败时日志留下 `leftover backup dir`。

```bash
deploy/self-host/restore-drill.sh
```

成功时最后一行是：

```text
[memora] drill ok: postgres probe=memora-backup-probe object probe=memora-backup-probe dump_mode=600 backup_dir_mode=700
```

成功判定（必须同时满足）：

1. 新卷在恢复前没有表 `backup_probe`，也没有对象 `probe/marker.txt`
2. 恢复后 `SELECT note FROM backup_probe WHERE id = 'probe-1'` 得到 `memora-backup-probe`
3. 对象 `probe/marker.txt` 的内容是 `memora-backup-probe`
4. 备份目录权限 `700`，dump 权限 `600`
5. 演练输出里没有 Postgres / MinIO 口令

要分步看空目录、校验和回滚，在仓库根目录的**同一个 bash** 里按顺序贴下面三段。`restore-drill.sh` 和这三段是同一条路径：`backup.sh --compose`，然后 `down -v`，再 `restore.sh --compose --fresh --no-pause-writers --yes`。镜像已在本机时，`compose.drill.yml` 的 `pull_policy: missing` 用本地标签。拉取失败就停，不要改去 `memora` 或 `memora-prod`。

三段只动项目 `memora-backup-drill` 和 `mktemp` 出来的空目录。`DRILL_BACKUP_DIR` 不要指到 `/var/backups/memora`。演练 Compose 没有 api / worker，所以恢复带 `--no-pause-writers`，和 `restore-drill.sh` 相同。生产恢复不要加这个参数，也不要 `down -v`。生产库回滚用上面「恢复」里的覆盖命令，stamp 用升级前那一份。`minio-init` 可能先打 CORS 未实现，再打 `warning: bucket CORS was not applied`，退出码仍是 0，桶已经是 private。见「存储」。

中途失败也贴「回滚」。口令只 export，不 echo，不写进仓库。

##### 空目录演练

`drill` 与 `deploy/self-host/lib/common.sh` 的 `compose` 一样，带上 `-f`、`--project-directory`、`--project-name`。`backup.sh` / `restore.sh` 会继承已经 export 的 `COMPOSE_FILE`、`COMPOSE_PROJECT_NAME`、`S3_BUCKET` 和两份演练口令。

```bash
set -euo pipefail
umask 077
unset COMPOSE_ENV_FILES BACKUP_AGE_RECIPIENT BACKUP_AGE_IDENTITY
cd "$(git rev-parse --show-toplevel)"
export COMPOSE_FILE="$PWD/deploy/self-host/compose.drill.yml"
export COMPOSE_PROJECT_NAME=memora-backup-drill
export S3_BUCKET=memora-local
export POSTGRES_USER=memora
export POSTGRES_DB=memora
[[ "$COMPOSE_PROJECT_NAME" == "memora-backup-drill" ]]
[[ -f "$COMPOSE_FILE" ]]
grep -q '^name: memora-backup-drill$' "$COMPOSE_FILE"
DRILL_POSTGRES_PASSWORD=$(od -An -N 16 -tx1 /dev/urandom | tr -d ' \n')
DRILL_MINIO_ROOT_PASSWORD=$(od -An -N 16 -tx1 /dev/urandom | tr -d ' \n')
export DRILL_POSTGRES_PASSWORD
export DRILL_MINIO_ROOT_PASSWORD
DRILL_BACKUP_DIR=$(mktemp -d)
chmod 700 "$DRILL_BACKUP_DIR"
export DRILL_BACKUP_DIR
printf '[memora] drill backup dir=%s\n' "$DRILL_BACKUP_DIR"

drill() {
  docker compose \
    -f "$COMPOSE_FILE" \
    --project-directory "$(dirname "$COMPOSE_FILE")" \
    --project-name "$COMPOSE_PROJECT_NAME" \
    "$@"
}

mc_drill() {
  drill run --rm --no-deps -T --entrypoint /bin/sh \
    -e "S3_BUCKET=${S3_BUCKET}" \
    -v "$(dirname "$COMPOSE_FILE")/lib/mc-inside.sh:/mc-inside.sh:ro" \
    minio-init /mc-inside.sh "$@"
}

wait_drill_healthy() {
  local attempt=0 pg_health="" minio_health=""
  while [[ "$attempt" -lt 60 ]]; do
    attempt=$((attempt + 1))
    pg_health=$(drill ps postgres --format '{{.Health}}' 2>/dev/null || true)
    minio_health=$(drill ps minio --format '{{.Health}}' 2>/dev/null || true)
    if [[ "$pg_health" == "healthy" && "$minio_health" == "healthy" ]]; then
      return 0
    fi
    sleep 2
  done
  printf '[memora] postgres or minio did not become healthy (last postgres=%s minio=%s)\n' \
    "${pg_health:-unknown}" "${minio_health:-unknown}" >&2
  return 1
}

start_drill_stack() {
  drill up -d --quiet-pull postgres minio
  wait_drill_healthy
  drill run --rm --no-deps minio-init
  local cname
  cname=$(drill ps postgres --format '{{.Name}}')
  [[ "$cname" == memora-backup-drill-* ]]
}

drill down -v --remove-orphans
start_drill_stack

drill exec -T postgres psql -v ON_ERROR_STOP=1 -U memora -d memora <<'SQL'
CREATE TABLE backup_probe (
  id text PRIMARY KEY,
  note text NOT NULL
);
INSERT INTO backup_probe (id, note) VALUES ('probe-1', 'memora-backup-probe');
SQL
printf '%s' 'memora-backup-probe' | mc_drill put 'probe/marker.txt'

[[ "$COMPOSE_FILE" == "$PWD/deploy/self-host/compose.drill.yml" ]]
[[ "$COMPOSE_PROJECT_NAME" == "memora-backup-drill" ]]
backup_log=$(mktemp)
chmod 600 "$backup_log"
BACKUP_DIR="$DRILL_BACKUP_DIR" deploy/self-host/backup.sh --compose | tee "$backup_log"
stamp=$(sed -n 's/^\[memora\] backup written under .* stamp=//p' "$backup_log" | head -n 1)
rm -f "$backup_log"
[[ "$stamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]
export stamp

drill down -v --remove-orphans
start_drill_stack
before=$(drill exec -T postgres psql -v ON_ERROR_STOP=1 -tA -U memora -d memora \
  -c "SELECT to_regclass('public.backup_probe');" | tr -d '[:space:]')
[[ -z "$before" ]]
set +e
mc_drill stat 'probe/marker.txt' >/dev/null 2>&1
stat_status=$?
set -e
[[ "$stat_status" -ne 0 ]]

BACKUP_DIR="$DRILL_BACKUP_DIR" \
  deploy/self-host/restore.sh --compose --fresh --no-pause-writers --yes --stamp "$stamp"
```

`backup.sh` 成功时最后一行是 `[memora] backup written under <目录> stamp=<时间>`。`restore.sh` 成功时有一行 `[memora] restore finished stamp=<时间>`，最后一行是 `[memora] Redis 队列没有恢复，保持空队列，不要把旧的 AOF 拷回来`。退出码都是 0。这段会 `unset BACKUP_AGE_RECIPIENT`，产物是明文 dump。加密往返由装了 age 的 `--dry-run` 另做。

##### 校验

栈还在、空目录还在时贴。某一项对不上就停，先留着目录。

```bash
set -euo pipefail
[[ "${COMPOSE_PROJECT_NAME:-}" == "memora-backup-drill" ]]
[[ -n "${stamp:-}" && -n "${DRILL_BACKUP_DIR:-}" ]]
declare -F drill >/dev/null
declare -F mc_drill >/dev/null
[[ "$(stat -c '%a' "$DRILL_BACKUP_DIR")" == "700" ]]
[[ "$(stat -c '%a' "$DRILL_BACKUP_DIR/memora-${stamp}.dump")" == "600" ]]
[[ "$(stat -c '%a' "$DRILL_BACKUP_DIR/manifest-${stamp}.txt")" == "600" ]]
[[ "$(stat -c '%a' "$DRILL_BACKUP_DIR/objects-${stamp}.sha256")" == "600" ]]
[[ "$(stat -c '%a' "$DRILL_BACKUP_DIR/objects-${stamp}/probe/marker.txt")" == "600" ]]
[[ "$(head -c 5 "$DRILL_BACKUP_DIR/memora-${stamp}.dump")" == "PGDMP" ]]
manifest="$DRILL_BACKUP_DIR/manifest-${stamp}.txt"
[[ "$(awk -F= '$1=="stamp"{print $2}' "$manifest")" == "$stamp" ]]
[[ "$(awk -F= '$1=="s3_bucket"{print $2}' "$manifest")" == "$S3_BUCKET" ]]
[[ "$(awk -F= '$1=="postgres_dump"{print $2}' "$manifest")" == "memora-${stamp}.dump" ]]
[[ "$(awk -F= '$1=="age_encrypted"{print $2}' "$manifest")" == "no" ]]
dump_sha=$(awk -F= '$1=="postgres_dump_sha256"{print $2}' "$manifest")
actual=$(sha256sum "$DRILL_BACKUP_DIR/memora-${stamp}.dump" | awk '{print $1}')
[[ -n "$dump_sha" && "$actual" == "$dump_sha" ]]
objects_now="$DRILL_BACKUP_DIR/objects.now.sha256"
(
  cd "$DRILL_BACKUP_DIR/objects-${stamp}"
  LC_ALL=C find . -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum
) >"$objects_now"
diff -q "$DRILL_BACKUP_DIR/objects-${stamp}.sha256" "$objects_now"
rm -f "$objects_now"
files=$(awk -F= '$1=="objects_files"{print $2}' "$manifest")
lines=$(wc -l < "$DRILL_BACKUP_DIR/objects-${stamp}.sha256" | tr -d ' ')
[[ "$files" == "$lines" ]]
BACKUP_DIR="$DRILL_BACKUP_DIR" S3_BUCKET="$S3_BUCKET" \
  deploy/self-host/restore.sh --dry-run --stamp "$stamp"
drill exec -T postgres pg_restore -l < "$DRILL_BACKUP_DIR/memora-${stamp}.dump" >/dev/null
note=$(drill exec -T postgres psql -v ON_ERROR_STOP=1 -tA -U memora -d memora \
  -c "SELECT note FROM backup_probe WHERE id = 'probe-1';" | tr -d '[:space:]')
[[ "$note" == "memora-backup-probe" ]]
body=$(mc_drill cat 'probe/marker.txt' | tr -d '[:space:]')
[[ "$body" == "memora-backup-probe" ]]
printf '[memora] empty-dir verify ok stamp=%s\n' "$stamp"
```

权限、魔数 `PGDMP`、manifest 字段和 sha256 与 `restore.sh` 改库前的检查相同。对象树的算法与 `lib/common.sh` 的 `hash_tree` 相同。`--dry-run --stamp` 只确认 manifest 文件在，不改库；成功时最后两行是 `[memora] manifest=ok` 和 `[memora] dry-run: 不会覆盖数据`。`pg_restore -l` 在演练的 Postgres 容器里读这份 dump，退出码 0。宿主机没有 `pg_restore` 时不要改到生产容器里做。这段自己的最后一行是 `[memora] empty-dir verify ok stamp=<时间>`。

##### 回滚

校验通过后拆演练栈，并删掉这次 `mktemp` 的空目录。项目名和 compose 文件写死，避免跟着别的 `COMPOSE_FILE` 走到生产。

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
drill_file="$PWD/deploy/self-host/compose.drill.yml"
grep -q '^name: memora-backup-drill$' "$drill_file"
docker compose \
  -f "$drill_file" \
  --project-directory "$PWD/deploy/self-host" \
  --project-name memora-backup-drill \
  down -v --remove-orphans
if [[ -n "${DRILL_BACKUP_DIR:-}" ]]; then
  case "$DRILL_BACKUP_DIR" in
    /var/backups/memora|/var/backups/memora/*)
      printf '[memora] refusing to delete %s\n' "$DRILL_BACKUP_DIR" >&2
      exit 1
      ;;
  esac
  case "$(basename "$DRILL_BACKUP_DIR")" in
    tmp.*)
      rm -rf "$DRILL_BACKUP_DIR"
      ;;
    *)
      printf '[memora] leaving drill backup dir %s\n' "$DRILL_BACKUP_DIR" >&2
      ;;
  esac
fi
unset DRILL_POSTGRES_PASSWORD DRILL_MINIO_ROOT_PASSWORD DRILL_BACKUP_DIR stamp
printf '[memora] drill rollback ok project=memora-backup-drill\n'
```

成功时退出码是 0，最后一行是 `[memora] drill rollback ok project=memora-backup-drill`。shell 断了、变量没了时，仍可单独贴上面的 `docker compose ... down -v`。空目录按演练时打印的 `drill backup dir=` 那一行手工删，只删 `tmp.*`。`memora` 和 `memora-prod` 的卷不要动。

#### 验收清单

把这份清单抄到变更单里勾选。有一项做不到，这次演练不算通过。

- [ ] `deploy/self-host/restore-drill.sh --dry-run` 退出码是 0，输出里没有口令
- [ ] 隔离演练（`restore-drill.sh`，或上面的空目录三段）在新卷上恢复后，探针行和探针对象都还在；恢复前它们不在。回滚后 `memora-backup-drill` 已 `down -v`
- [ ] 备份目录权限是 `700`，dump、校验文件和密钥副本是 `600`
- [ ] 备份不在数据库和 MinIO 的同一块盘上
- [ ] 标准输出和标准错误里没有 Postgres、MinIO、`.env` 的口令；`~/.mc` 没有新增这份口令
- [ ] `pg_restore -l` 能列出 dump。加密的先解密到权限 `600` 的临时文件，用完删除
- [ ] manifest 存在，dump 和对象的 sha256 与 manifest 一致
- [ ] `.env` 和 Docker secret 另有一份加密副本，且不在 git 里。离机过的目录不要再收新口令，见「新口令不要写回离机目录」
- [ ] 恢复步骤先停 api / worker；确认后再启动
- [ ] 备份若离开过本机：已按「密钥轮换」轮换 Postgres / MinIO / `.env` 口令
- [ ] 备份介质可能被他人接触时：已按「备份离机后的会话收口」执行 `TRUNCATE sessions`
- [ ] Redis 保持空队列，没有恢复旧 AOF
- [ ] 记下演练日期、耗时、备份时间点、数据体积和结果

## 存储

桶名 `memora-${MEMORA_ENV}`。对象键：

```text
users/{userId}/originals/{assetId}
users/{userId}/derivatives/{assetId}/{thumb|preview|hero}.webp
```

`minio-init` 会 `mc anonymous set none`。匿名拒绝的策略意图写在 `bucket-policy.json`，init **不会**把这份 Deny 套到桶上，避免误伤根用户。同一组固定镜像里 `mc cors set` 可能打印未实现的警告；`curl` 上传不依赖 CORS。浏览器从 3000 跨域 PUT 时，要在反代上加 CORS，或换更新的 MinIO。

素材表在 API 或 Worker 第一次连上 Postgres 时创建，SQL 见 `packages/storage/migrations/001_assets.sql`。

上传验证见仓库根 README 的「本地验证上传」。
