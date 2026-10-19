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
- 防火墙只开放 443（SSH 按你自己的跳板策略）
- 密钥放 `.env` 或 Docker secrets，禁止提交
- 做好系统更新、磁盘告警；单盘有坏盘和停电风险，备份请放到另一块盘或另一台机器
- 备份：`deploy/self-host/backup.sh` 读取环境变量做 `pg_dump` 和 `mc mirror`，不把口令写进日志。需要本机有 `pg_dump` 和 `mc`。

## 公网反代

浏览器的分享页是 `/s/<token>`，公开接口是 `/api/v1/public/shares/<token>`，解锁是 `POST .../unlock`。令牌是 32 字节 base64url、无填充，固定 43 位。应用日志已经打码，反代不会。片段在 `proxy/`，不进 Compose。默认反代本机 Web `127.0.0.1:3000`（页面再把 `/api/v1` 转到 API）。API 若另开入口，同一套片段也要盖住。

| 文件 | 作用 |
|------|------|
| `proxy/Caddyfile` | 访问日志和进程错误日志打码。官方 Caddy 可用 |
| `proxy/Caddyfile.ratelimit` | 按来源 IP 限流。需要 `xcaddy build --with github.com/mholt/caddy-ratelimit` |
| `proxy/nginx-http.conf` | 放进 `http`：日志格式、打码、限流区 |
| `proxy/nginx-server.conf` | 放进 `server`：访问日志，以及解锁和公开分享的限流 |
| `proxy/traefik-dynamic.yml` | 限流路由，并进现有动态配置 |
| `proxy/traefik-static.yml` | 访问日志。Traefik 不能只替换令牌，所以丢掉整段路径 |

Caddy 和 Nginx 把这两条路径上刚好 43 位的令牌写成 `***`，`Referer` 同样处理，查询串里的 `password` 和 `token` 也打掉。`/login` 这类普通路径保持原样。不是刚好 43 位的，原样保留。Caddy 打码需要 2.11（同一字段上的两条正则都要留着，顺序不能反）。Traefik 片段按 v3 写，在 v3.6 上对过。

解锁口令在 JSON 正文里。访问日志不要包含请求正文，也不要打开 debug。响应正文里有短时预签名，同样不要记。Nginx 的 `log_format` 不要加 `$request_body`。同一个 `server` 不要再加一条 `access_log ... combined`，否则未打码的那份还在。`http` 里的片段只 include 一次。

限流按来源 IP，次数写在片段里，可以改：

- 解锁平均每分钟 6 次。Caddy 只限制 `POST .../unlock`，滑动窗口满 6 次后 429。Nginx 按这条路径限，GET 也算；短时大约能过 7 次，第 8 次起 429。Traefik 的 `burst` 是短时次数，解锁连续第 7 次 429
- `/api/v1/public/shares/` 平均每分钟 60 次。Caddy 满 60 次后 429。Nginx 短时大约能过 21 次。Traefik 短时 20 次

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

## 存储

桶名 `memora-${MEMORA_ENV}`。对象键：

```text
users/{userId}/originals/{assetId}
users/{userId}/derivatives/{assetId}/{thumb|preview|hero}.webp
```

`minio-init` 会 `mc anonymous set none`。匿名拒绝的策略意图写在 `bucket-policy.json`，init **不会**把这份 Deny 套到桶上，避免误伤根用户。同一组固定镜像里 `mc cors set` 可能打印未实现的警告；`curl` 上传不依赖 CORS。浏览器从 3000 跨域 PUT 时，要在反代上加 CORS，或换更新的 MinIO。

素材表在 API 或 Worker 第一次连上 Postgres 时创建，SQL 见 `packages/storage/migrations/001_assets.sql`。

上传验证见仓库根 README 的「本地验证上传」。
