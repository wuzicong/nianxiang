# 监控告警（草稿，默认关闭）

这份目录不随 `compose.prod.yml` 启动，仓库里也没有已启用的 cron。不跑 `check.sh`，生产栈和现在一样。不要对云上 Terraform 做 apply。

脚本看七件事，外发另说：

| 信号 | 从哪看 | 默认 |
|------|--------|------|
| caddy、web、api、worker、postgres、redis、minio | `docker compose ps` 的 healthy | 不是 healthy 就记一笔。`starting` 只打印 |
| 公网入口 | `GET /health`、`GET /login`、`GET /ready` | 连续失败达到 `MEMORA_HTTP_FAILS`（默认 3）再记成要外发 |
| 磁盘 | `df` 使用率 | 达到 `MEMORA_DISK_PERCENT`（默认 85）。路径默认 `/`。备份目录在另一块盘且更高时再记一笔 |
| 备份 | `BACKUP_DIR` 里最新的 `manifest-*.txt` | 目录不存在、没有 manifest，或年龄达到 `MEMORA_BACKUP_MAX_AGE_HOURS`（默认 26）就记一笔。不读 manifest 正文 |
| 解锁 429 | Caddy 进程日志 `zone=memora_share_unlock` | 只数上次偏移之后的新行。达到 `MEMORA_UNLOCK_429_ALERT`（默认 30）再外发 |
| 登录 429 | 同一份日志 `zone=memora_auth` | 达到 `MEMORA_AUTH_429_ALERT`（默认 20）再外发 |
| 公开分享 429 | `zone=memora_public_shares` | 只打印次数 |

ml 在 `compose ps` 里也能看到，脚本不把它算进失败。应用没有 Prometheus 出口。计数用的是 Caddy 已经在写的进程日志，级别保持 `INFO`。那一行是 `rate limit exceeded`，带 zone，不带请求路径。脚本只输出次数，不把日志行、来源 IP、Webhook URL 或邮箱打出来。

第一次真正执行会把日志偏移记到文件末尾，不回放旧的 429。`--dry-run` 不写这个偏移。

状态目录是 `MEMORA_STATE_DIR`（默认 `/var/lib/memora-monitor`），权限 `700`。同一组问题在 `MEMORA_ALERT_REPEAT_SECONDS`（默认 21600，6 小时）内不重复外发。问题消失后，下一次再出现会马上外发。

## 变量

复制 `env.monitor.example`。注释和空行可以留。等号两边不要加空格。未知的键会拒绝，避免把数据库口令塞进这个文件。

| 变量 | 默认 | 作用 |
|------|------|------|
| `MEMORA_ALERT_ENABLE` | `0` | `1` 才允许外发 |
| `MEMORA_ALERT_WEBHOOK` | 空 | `https` 的 URL，正文是 JSON `{"text":"..."}`。`https://hooks.example.com/...` 不会发出去。URL 里不要带账号口令 |
| `MEMORA_ALERT_EMAIL` | 空 | 交给本机的 `mail` 或 `sendmail`。`ops@example.com` 不会发出去。SMTP 口令留在 MTA |
| `MEMORA_CHECK_BASE` | `http://127.0.0.1` | 公网探测的源。有域名时写成 `https://photos.example.com` |
| `MEMORA_BACKUP_DIR` | `/var/backups/memora` | 与 `backup.sh` 的目录相同 |
| `MEMORA_BACKUP_MAX_AGE_HOURS` | `26` | 最新 manifest 的年龄上限 |
| `MEMORA_DISK_PATH` | `/` | `df` 的路径 |
| `MEMORA_DISK_PERCENT` | `85` | 使用率达到这个数就记一笔 |
| `MEMORA_STATE_DIR` | `/var/lib/memora-monitor` | 偏移、连续失败次数、上次外发指纹 |
| `MEMORA_HTTP_FAILS` | `3` | 公网连续失败多少次才外发 |
| `MEMORA_UNLOCK_429_ALERT` | `30` | 一轮里新增的解锁 429 |
| `MEMORA_AUTH_429_ALERT` | `20` | 一轮里新增的登录/注册 429 |
| `MEMORA_ALERT_REPEAT_SECONDS` | `21600` | 同一组问题的重复外发间隔 |
| `MEMORA_CADDY_SYSTEM_LOG` | `/var/log/caddy/memora-system.log` | 容器内路径 |
| `MEMORA_MONITOR_ENV` | 空 | 指向仓库外的 env。这是调用时的环境变量，不要写进文件自己 |
| `COMPOSE_FILE` | 仓库根的 `compose.prod.yml` | 可以用冒号拼上 `compose.prod.override.yml` |
| `COMPOSE_ENV_FILES` | 空 | 生产 Compose 的 env 路径。脚本不读、不打印它 |

`MEMORA_ALERT_ENABLE=1` 时，这个 env 文件的权限必须是 `400` 或 `600`。

本机回环上的 `http://127.0.0.1` 或 `http://localhost` 可以当 Webhook，用来接到同一台机器上的接收端。放到别的机器上用 `https`。

## 启用

在仓库根目录：

```bash
deploy/self-host/monitoring/check.sh --self-test
umask 077
sudo mkdir -p /etc/memora
sudo cp deploy/self-host/monitoring/env.monitor.example /etc/memora/monitor.env
sudo chmod 600 /etc/memora/monitor.env
```

先改探测地址和备份目录，Webhook 与邮箱仍可以留着示例值。然后：

```bash
MEMORA_MONITOR_ENV=/etc/memora/monitor.env deploy/self-host/monitoring/check.sh --dry-run
```

`--dry-run` 不写状态、不外发。退出码 0 表示这一轮没有要外发的问题，退出码 1 表示有。输出里不应出现口令、Webhook URL 或邮箱。

确认之后，把仓库外文件里的 `MEMORA_ALERT_ENABLE` 改成 `1`，换上自己的渠道，再加 cron。路径按机器改。健康检查一节建议公网大约每 60 秒看一次；下面这条是 5 分钟，连续 3 次失败大约 15 分钟。要更紧就把分钟改成 `*`。

```cron
*/5 * * * * MEMORA_MONITOR_ENV=/etc/memora/monitor.env /opt/memora/deploy/self-host/monitoring/check.sh
```

跑 cron 的用户要能访问 Docker。不要用登录或注册的 POST 做探活。

改过脚本之后：

```bash
shellcheck -x deploy/self-host/monitoring/check.sh
deploy/self-host/monitoring/check.sh --self-test
```
