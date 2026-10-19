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

要在一台机器上把 web / api / worker 和 Caddy 一起跑起来，用下面的「生产部署」，不要把这条开发命令暴露到公网。

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
- 备份与恢复见下面的专章。脚本不把口令写进日志。演练用 `deploy/self-host/restore-drill.sh`

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

- 解锁平均每分钟 6 次。Caddy 只限制 `POST .../unlock`，滑动窗口满 6 次后 429。Nginx 按这条路径限，GET 也算；短时大约能过 7 次，第 8 次起 429。Traefik 的 `burst` 是短时次数，解锁连续第 7 次 429
- `/api/v1/public/shares/` 平均每分钟 60 次。Caddy 满 60 次后 429。Nginx 短时大约能过 21 次。Traefik 短时 20 次
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

各服务怎么探活、上线后怎么抽查，见「健康检查」和「活体抽查」。

### 登录限流

`POST /api/v1/auth/login` 和 `POST /api/v1/auth/register` 按来源 IP 共用额度，默认一分钟 5 次，第 6 次 429，正文是 `请稍后再试`。次数写在片段里，可以改：Caddy 是 `proxy/Caddyfile.ratelimit` 的 `memora_auth` `events`。改完执行：

```bash
docker compose -f compose.prod.yml up -d --force-recreate caddy
```

Nginx、Traefik 的档位见上面「公网反代」。出口 IP 很多人共用时把次数调高。登录密码在 JSON 正文里，访问日志不记正文。不要开 debug。

### TLS 证书续期

生产站点地址是 `{$MEMORA_DOMAIN}`，写在 `proxy/Caddyfile.prod`。设成纯域名（例如 `photos.example.com`，不要带 `https://`、端口或路径）后，Caddy 打开自动 HTTPS：用 ACME 申请证书，80 上的 HTTP 会跳到 HTTPS。本仓库没有改 `acme_ca`，默认机构是 Let's Encrypt。不要把测试 CA 留在公网配置里。

续期由 Caddy 在后台做，不需要 cron。默认大约每 10 分钟检查一次已加载的证书；剩余寿命不到大约三分之一时开始续（90 天的证书大约还剩 30 天）。续期仍然走 ACME，公网要能访问这台机器的 80（HTTP-01）和 443（TLS-ALPN-01），DNS 要指过来。

`MEMORA_DOMAIN` 留空时，Compose 传入 `:80`。Caddy 只提供明文 HTTP，不申请证书，站点也不听 443。用 `http://127.0.0.1`。这种开法不要放到公网。`compose.prod.yml` 仍映射了宿主机的 443，但里面没有证书站点。

证书和 ACME 账号在卷 `caddy_data`，容器里是 `/data`（官方镜像的 `XDG_DATA_HOME`）。某个域名的证书通常在：

```text
/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/<域名>/
```

目录里有 `.crt`、`.key` 和元数据，私钥在这里。进程用户是镜像里的 `caddy`（非 root）。构建时 `/data`、`/config`、`/var/log/caddy` 交给这个用户，日志目录权限是 `750`。不要把卷改成所有人可读，也不要用 root 拥有的宿主机目录盖住 `/data` 却不改属主。`docker compose down -v` 会连证书一起删掉。升级不要加 `-v`。

通知邮箱写在 `proxy/Caddyfile` 的全局块：`email you@example.com`。改完执行：

```bash
docker compose -f compose.prod.yml up -d --force-recreate caddy
```

没有邮箱也能签发。Let's Encrypt 只是不会发过期邮件。

查看配置、版本和存储（不会打印私钥内容时，不要把 `cat` 出来的 `.key` 贴到工单）：

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

建议：公网每 60 秒探一次 `GET /health` 和 `GET /login`，连续 3 次失败再告警。每 1 到 5 分钟看一次 `docker compose ps` 里有没有 unhealthy。不要用登录或注册的 POST 做探活，那一档一分钟只有 5 次。磁盘告警另做。备份节奏见「备份与恢复」。

### 活体抽查

第一次上线、升级之后，以及每季度，和「备份与恢复」里的演练一起做。演练是否通过仍以那一节的验收清单为准。这里是对外服务能不能用的顺序：登录、相册、备份、恢复命令。

口令放临时 env 或 Docker secret，不要写进仓库、工单或日志。项目名保持 `memora-prod`。演练项目是 `memora-backup-drill`。开发栈是 `memora`。不要对着生产库做演练删除。

本机已经有开发用的 `.env` 时不要覆盖它。另写一份权限 `600` 的文件（放在 `/tmp` 或仓库外），用 Compose v2 的 `COMPOSE_ENV_FILES`。指定之后，这次 Compose 不再读项目目录里的 `.env`。`backup.sh` 和 `restore.sh` 内部的 `docker compose` 会继承这个变量。

```bash
COMPOSE_ENV_FILES=/tmp/memora-prod.env docker compose -f compose.prod.yml up -d --build
```

没有域名时按「启动」把 `MEMORA_DOMAIN` 留空，只用 `http://127.0.0.1`。明文抽查设 `COOKIE_SECURE=false`。公网改回 `true`。

下面的邮箱、口令和 Cookie 都是占位，换成一次性值。输出里打掉口令和 `memora_session`。注册和登录 POST 共用每分钟 5 次，先做完业务步骤，再做限流短测。

1. 健康。上一节的 `ps` 和 curl。web、api、worker、postgres、redis、minio、caddy 为 healthy，minio-init 退出码 0。
2. 端口。`docker compose -f compose.prod.yml ps` 只发布 `80` 和 `443`。不要出现 5432、6379、9000、9001、3000、3001、3002。
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
7. 恢复命令。`restore.sh --dry-run --stamp <时间>` 只核对文件，不改库。隔离的完整路径用「演练」里的 `restore-drill.sh`（先 `--dry-run`，再不带参数）。不要对 `memora-prod` 加 `--yes` 做演练。
8. 访问日志。向 Caddy 打一条带假 `Cookie`、假 `Authorization` 和 `?password=` 的请求，再看 `/var/log/caddy/memora-access.log`。日志里不应出现 Cookie 值、Authorization 或查询串里的口令。登录密码在 JSON 正文里，访问日志不记正文。
9. 登录限流。同一来源连续 POST `/api/v1/auth/login`，第 6 次是 429，正文含 `请稍后再试`。测完等一分钟再给真人登录。
10. 页面点击（打开登录页、进入相册、拖拽上传）标「需运维人工」。第 3 到 5 步的 curl 是替代。

勾选：

- [ ] 七个服务 healthy，minio-init 退出码 0
- [ ] 宿主机只发布 80 和 443
- [ ] `/health`、`/login`、`/ready` 正常
- [ ] 注册或登录后 `/api/v1/auth/me` 为 200
- [ ] 建册成功
- [ ] 上传探针已完成，或注明需运维人工并留下 curl
- [ ] `backup.sh --compose` 写出 manifest，权限正确，输出无口令
- [ ] `restore.sh --dry-run --stamp` 成功；`restore-drill.sh` 按「演练」通过，没有动 `memora` / `memora-prod`
- [ ] 访问日志无 Cookie、Authorization 和口令
- [ ] 登录第 6 次 429
- [ ] 浏览器点击已由运维人工过，或明确留下未做

### 升级

先做下面的「备份与恢复」，至少留下一份带 `manifest-*.txt` 的备份。然后：

```bash
git pull
docker compose -f compose.prod.yml up -d --build
```

不要加 `-v`。`-v` 会删掉数据库、对象和证书卷。

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

`--dry-run` 只打印每个候选文件在不在，不读内容。

#### 加密、权限、口令

- 备份目录 `700`，dump 和密钥副本 `600`。脚本用 `umask 077`
- 备份盘最好是另一块已加密的磁盘（例如 LUKS）。和数据库同一块盘不算备份
- 可选：安装 [age](https://github.com/FiloSottile/age)，设置公钥 `BACKUP_AGE_RECIPIENT`（形如 `age1...`）。脚本会加密 dump 和对象包，并删掉明文。没有 age 时直接失败，不会假装已经加密
- 私钥文件权限 `400` 或 `600`，用 `BACKUP_AGE_IDENTITY` 指向它。私钥不要进仓库
- 没有 age 时可以手动 `gpg --encrypt`，加密后删除明文。`shred` 在 SSD 上也不等于彻底擦掉，加密盘更重要
- 脚本不 `set -x`，失败信息里的 URL 账号和已知口令会打成 `***`

恢复不会改应用用户的口令哈希。对外服务前：

1. 先别启动 api / worker，抽查相册
2. 备份离开过这台机器时，轮换 Postgres、MinIO 和 `.env` 里的口令，并改掉对应的 Docker secret
3. 备份介质可能被别人接触过时，在库里执行 `TRUNCATE sessions;`，让旧会话失效
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

没有 `--yes` 时脚本直接退出。`--dry-run` 不连接数据库。

#### 演练

不碰开发项目 `memora`，也不碰生产项目 `memora-prod`。演练项目名是 `memora-backup-drill`，不映射宿主机端口。口令由脚本临时生成，不写进仓库，也不打印。

不需要 Docker 的自检（脚本语法、拒绝打印口令、配置副本权限、非法时间戳）：

```bash
deploy/self-host/restore-drill.sh --dry-run
```

成功时最后一行是 `[memora] drill dry-run ok`。

完整冒烟需要 Docker，以及和 `compose.prod.yml` 相同的镜像标签（本机已有镜像时不会强行重新拉取）：

```bash
deploy/self-host/restore-drill.sh
```

步骤：起临时 Postgres 和 MinIO → 写入探针行和对象 → `backup.sh --compose` → `down -v` 换新卷 → 确认探针已经消失 → `restore.sh --fresh` → 确认探针回来。成功时最后一行是：

```text
[memora] drill ok: postgres probe=memora-backup-probe object probe=memora-backup-probe dump_mode=600 backup_dir_mode=700
```

成功判定（必须同时满足）：

1. 新卷在恢复前没有表 `backup_probe`，也没有对象 `probe/marker.txt`
2. 恢复后 `SELECT note FROM backup_probe WHERE id = 'probe-1'` 得到 `memora-backup-probe`
3. 对象 `probe/marker.txt` 的内容是 `memora-backup-probe`
4. 备份目录权限 `700`，dump 权限 `600`
5. 演练输出里没有 Postgres / MinIO 口令

机器拉不动镜像时，在一套**专用**的空 Compose 上手动做同样五步，用上面的判定。不要对着生产库演练删除。

#### 验收清单

把这份清单抄到变更单里勾选。有一项做不到，这次演练不算通过。

- [ ] `deploy/self-host/restore-drill.sh --dry-run` 退出码是 0，输出里没有口令
- [ ] 隔离演练（脚本或手动五步）在新卷上恢复后，探针行和探针对象都还在；恢复前它们不在
- [ ] 备份目录权限是 `700`，dump、校验文件和密钥副本是 `600`
- [ ] 备份不在数据库和 MinIO 的同一块盘上
- [ ] 标准输出和标准错误里没有 Postgres、MinIO、`.env` 的口令；`~/.mc` 没有新增这份口令
- [ ] `pg_restore -l` 能列出 dump。加密的先解密到权限 `600` 的临时文件，用完删除
- [ ] manifest 存在，dump 和对象的 sha256 与 manifest 一致
- [ ] `.env` 和 Docker secret 另有一份加密副本，且不在 git 里
- [ ] 恢复步骤先停 api / worker；确认后再启动
- [ ] 备份若离开过本机：已计划轮换 Postgres / MinIO / `.env` 口令
- [ ] 备份介质可能被他人接触时：已计划 `TRUNCATE sessions`
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
