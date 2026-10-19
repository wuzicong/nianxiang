#!/usr/bin/env bash
# 可选监控。默认不进 cron，也不随 compose.prod.yml 启动。
# 不读取数据库口令，不打印 Webhook URL 或邮件地址。不要 set -x。
set -euo pipefail
umask 077

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source-path=SCRIPTDIR
# shellcheck source=../lib/common.sh
source "$SCRIPT_DIR/../lib/common.sh"

DRY_RUN=0
SELF_TEST=0
PAGE_LINES=()
INFO_LINES=()
ST_HTTP_STREAK=0
ST_LOG_OFFSET=""
ST_LAST_ALERT_HASH=""
ST_LAST_ALERT_EPOCH=0
NEW_HTTP_STREAK=0
NEW_LOG_OFFSET=""
LOG_OFFSET_KNOWN=0

usage() {
  cat <<'EOF'
用法: check.sh [--dry-run] [--self-test]

  --dry-run     做检查并打印结果。不写状态，不外发。
  --self-test   只用临时文件做自检，不访问 Docker，不外发。

默认关闭。MEMORA_ALERT_ENABLE=0 时即使不加 --dry-run 也只打印。
变量写在仓库外的 env 里，用 MEMORA_MONITOR_ENV 指向它。说明见同目录 README.md。
EOF
}

is_uint() {
  local value="${1:-}"
  [[ "$value" =~ ^[0-9]+$ ]]
}

require_uint() {
  local name="$1"
  local value="$2"
  if ! is_uint "$value"; then
    die "${name} must be a non-negative integer"
  fi
}

apply_defaults() {
  : "${MEMORA_ALERT_ENABLE:=0}"
  : "${MEMORA_ALERT_WEBHOOK:=}"
  : "${MEMORA_ALERT_EMAIL:=}"
  : "${MEMORA_CHECK_BASE:=http://127.0.0.1}"
  : "${MEMORA_BACKUP_DIR:=/var/backups/memora}"
  : "${MEMORA_BACKUP_MAX_AGE_HOURS:=26}"
  : "${MEMORA_DISK_PATH:=/}"
  : "${MEMORA_DISK_PERCENT:=85}"
  : "${MEMORA_STATE_DIR:=/var/lib/memora-monitor}"
  : "${MEMORA_HTTP_FAILS:=3}"
  : "${MEMORA_UNLOCK_429_ALERT:=30}"
  : "${MEMORA_AUTH_429_ALERT:=20}"
  : "${MEMORA_ALERT_REPEAT_SECONDS:=21600}"
  : "${MEMORA_CADDY_SYSTEM_LOG:=/var/log/caddy/memora-system.log}"
  MEMORA_CHECK_BASE=${MEMORA_CHECK_BASE%/}
  if [[ -z "${COMPOSE_FILE:-}" ]]; then
    COMPOSE_FILE="${MEMORA_COMPOSE_FILE:-$REPO_ROOT/compose.prod.yml}"
  fi
  export COMPOSE_FILE
  case "$MEMORA_ALERT_ENABLE" in
    0|1) ;;
    *) die "MEMORA_ALERT_ENABLE must be 0 or 1" ;;
  esac
  require_uint MEMORA_BACKUP_MAX_AGE_HOURS "$MEMORA_BACKUP_MAX_AGE_HOURS"
  require_uint MEMORA_DISK_PERCENT "$MEMORA_DISK_PERCENT"
  require_uint MEMORA_HTTP_FAILS "$MEMORA_HTTP_FAILS"
  require_uint MEMORA_UNLOCK_429_ALERT "$MEMORA_UNLOCK_429_ALERT"
  require_uint MEMORA_AUTH_429_ALERT "$MEMORA_AUTH_429_ALERT"
  require_uint MEMORA_ALERT_REPEAT_SECONDS "$MEMORA_ALERT_REPEAT_SECONDS"
  if [[ "$MEMORA_HTTP_FAILS" -lt 1 ]]; then
    die "MEMORA_HTTP_FAILS must be at least 1"
  fi
}

load_monitor_env() {
  local file="$1"
  local mode="" line key value enable="0"
  local -a keys=() values=()
  [[ -f "$file" ]] || die "monitor env file missing"
  mode=$(mode_of "$file")
  while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line%$'\r'}
    case "$line" in
      ''|\#*) continue ;;
    esac
    case "$line" in
      *=*) ;;
      *) die "monitor env line must be KEY=VALUE" ;;
    esac
    key=${line%%=*}
    value=${line#*=}
    case "$key" in
      MEMORA_ALERT_ENABLE|MEMORA_ALERT_WEBHOOK|MEMORA_ALERT_EMAIL|MEMORA_CHECK_BASE|\
      MEMORA_BACKUP_DIR|MEMORA_BACKUP_MAX_AGE_HOURS|MEMORA_DISK_PATH|MEMORA_DISK_PERCENT|\
      MEMORA_STATE_DIR|MEMORA_HTTP_FAILS|MEMORA_UNLOCK_429_ALERT|MEMORA_AUTH_429_ALERT|\
      MEMORA_ALERT_REPEAT_SECONDS|MEMORA_CADDY_SYSTEM_LOG|MEMORA_COMPOSE_FILE|\
      COMPOSE_FILE|COMPOSE_ENV_FILES|COMPOSE_PROJECT_NAME)
        keys+=("$key")
        values+=("$value")
        if [[ "$key" == "MEMORA_ALERT_ENABLE" ]]; then
          enable=$value
        fi
        ;;
      *) die "monitor env rejects ${key}" ;;
    esac
  done <"$file"
  if [[ "$enable" == "1" ]]; then
    case "$mode" in
      400|600) ;;
      *) die "monitor env with alerts enabled must be mode 400 or 600" ;;
    esac
  fi
  local i
  for i in "${!keys[@]}"; do
    printf -v "${keys[$i]}" '%s' "${values[$i]}"
    export "${keys[$i]}"
  done
}

state_path() {
  printf '%s/state' "$MEMORA_STATE_DIR"
}

read_state() {
  local file line key value
  file=$(state_path)
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      ''|\#*) continue ;;
      *=*) ;;
      *) continue ;;
    esac
    key=${line%%=*}
    value=${line#*=}
    case "$key" in
      http_streak)
        is_uint "$value" || continue
        ST_HTTP_STREAK=$value
        ;;
      log_offset)
        is_uint "$value" || continue
        ST_LOG_OFFSET=$value
        LOG_OFFSET_KNOWN=1
        ;;
      last_alert_hash)
        [[ "$value" =~ ^[0-9a-f]*$ ]] || continue
        ST_LAST_ALERT_HASH=$value
        ;;
      last_alert_epoch)
        is_uint "$value" || continue
        ST_LAST_ALERT_EPOCH=$value
        ;;
    esac
  done <"$file"
}

write_state() {
  local file tmp
  mkdir -p "$MEMORA_STATE_DIR"
  chmod 700 "$MEMORA_STATE_DIR"
  file=$(state_path)
  tmp=$(mktemp "$MEMORA_STATE_DIR/.state.XXXXXX")
  chmod 600 "$tmp"
  {
    printf 'http_streak=%s\n' "$NEW_HTTP_STREAK"
    if [[ -n "$NEW_LOG_OFFSET" ]]; then
      printf 'log_offset=%s\n' "$NEW_LOG_OFFSET"
    fi
    printf 'last_alert_hash=%s\n' "$ST_LAST_ALERT_HASH"
    printf 'last_alert_epoch=%s\n' "$ST_LAST_ALERT_EPOCH"
  } >"$tmp"
  mv -f "$tmp" "$file"
  chmod 600 "$file"
}

count_rate_limits() {
  python3 -c '
import json
import sys

unlock = auth = public = 0
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        event = json.loads(line)
    except json.JSONDecodeError:
        continue
    if event.get("msg") != "rate limit exceeded":
        continue
    zone = event.get("zone")
    if zone == "memora_share_unlock":
        unlock += 1
    elif zone == "memora_auth":
        auth += 1
    elif zone == "memora_public_shares":
        public += 1
print(f"{unlock} {auth} {public}")
'
}

scan_file_delta() {
  local path="$1"
  local stored="${2-}"
  local size start counts
  size=$(wc -c <"$path" | tr -d ' ')
  if [[ -z "$stored" ]]; then
    printf 'baseline 0 0 0 %s\n' "$size"
    return 0
  fi
  if (( stored > size )); then
    stored=0
  fi
  if (( stored == size )); then
    printf 'delta 0 0 0 %s\n' "$size"
    return 0
  fi
  start=$((stored + 1))
  counts=$(tail -c +"$start" "$path" | count_rate_limits)
  printf 'delta %s %s\n' "$counts" "$size"
}

backup_status() {
  local dir="$1"
  local newest mtime stamp now age
  if [[ ! -d "$dir" ]]; then
    printf 'missing\n'
    return 0
  fi
  newest=$(find "$dir" -maxdepth 1 -type f -name 'manifest-*.txt' -printf '%T@ %f\n' | sort -n | tail -n 1)
  if [[ -z "$newest" ]]; then
    printf 'none\n'
    return 0
  fi
  mtime=${newest%% *}
  mtime=${mtime%.*}
  stamp=${newest##* }
  stamp=${stamp#manifest-}
  stamp=${stamp%.txt}
  now=$(date +%s)
  if (( mtime > now )); then
    age=0
  else
    age=$(((now - mtime) / 3600))
  fi
  printf '%s %s\n' "$age" "$stamp"
}

disk_percent() {
  local path="$1"
  df -P "$path" | awk 'NR==2 { gsub(/%/, "", $5); print $5 }'
}

next_streak() {
  local ok="$1"
  local prev="$2"
  if [[ "$ok" == "1" ]]; then
    printf '0\n'
  else
    printf '%s\n' "$((prev + 1))"
  fi
}

decide_send() {
  local has_pages="$1"
  local fp="$2"
  local last_fp="$3"
  local last_epoch="$4"
  local now="$5"
  local repeat="$6"
  if [[ "$has_pages" != "1" ]]; then
    printf 'no\n'
    return 0
  fi
  if [[ "$fp" != "$last_fp" ]]; then
    printf 'yes\n'
    return 0
  fi
  if (( now - last_epoch >= repeat )); then
    printf 'yes\n'
    return 0
  fi
  printf 'no\n'
}

webhook_allowed() {
  local url="${MEMORA_ALERT_WEBHOOK:-}"
  [[ "$MEMORA_ALERT_ENABLE" == "1" ]] || return 1
  case "$url" in
    *$'\n'*|*$'\r'*|*' '*) return 1 ;;
    *://*:*@*) return 1 ;;
    https://hooks.example.com|https://hooks.example.com/*) return 1 ;;
    https://*) return 0 ;;
    http://127.0.0.1:*|http://localhost:*) return 0 ;;
    *) return 1 ;;
  esac
}

email_allowed() {
  local email="${MEMORA_ALERT_EMAIL:-}"
  [[ "$MEMORA_ALERT_ENABLE" == "1" ]] || return 1
  case "$email" in
    *$'\n'*|*$'\r'*|*' '*) return 1 ;;
    ops@example.com|"") return 1 ;;
    *@*.*) return 0 ;;
    *) return 1 ;;
  esac
}

channel_label() {
  if [[ -z "${MEMORA_ALERT_WEBHOOK:-}" ]]; then
    printf 'webhook=empty'
  elif webhook_allowed; then
    printf 'webhook=ready'
  else
    printf 'webhook=not-sent'
  fi
  printf ' '
  if [[ -z "${MEMORA_ALERT_EMAIL:-}" ]]; then
    printf 'email=empty'
  elif email_allowed; then
    printf 'email=ready'
  else
    printf 'email=not-sent'
  fi
  printf '\n'
}

post_webhook() {
  local text="$1"
  local payload err status
  payload=$(mktemp)
  err=$(mktemp)
  chmod 600 "$payload" "$err"
  python3 -c 'import json,sys; print(json.dumps({"text": sys.stdin.read()}, ensure_ascii=False))' <<<"$text" >"$payload"
  set +e
  curl -fsS --max-time 10 -X POST \
    -H 'content-type: application/json' \
    --data-binary @"$payload" \
    -o /dev/null \
    "$MEMORA_ALERT_WEBHOOK" 2>"$err"
  status=$?
  set -e
  rm -f "$payload" "$err"
  if [[ "$status" -ne 0 ]]; then
    log "webhook post failed"
    return 1
  fi
  log "webhook posted"
}

post_email() {
  local text="$1"
  if command -v mail >/dev/null 2>&1; then
    printf '%s\n' "$text" | mail -s 'memora monitor' "$MEMORA_ALERT_EMAIL"
    log "email handed to mail"
    return 0
  fi
  if command -v sendmail >/dev/null 2>&1; then
    printf 'To: %s\nSubject: memora monitor\n\n%s\n' "$MEMORA_ALERT_EMAIL" "$text" | sendmail -t
    log "email handed to sendmail"
    return 0
  fi
  log "email not sent: no local mailer"
  return 1
}

http_code() {
  local url="$1"
  local code
  set +e
  code=$(curl -sS --max-time 5 --max-redirs 0 -o /dev/null -w '%{http_code}' "$url")
  set -e
  if [[ ! "$code" =~ ^[0-9]{3}$ ]]; then
    code=000
  fi
  printf '%s' "$code"
}

check_edge() {
  local health login ready ok
  health=$(http_code "${MEMORA_CHECK_BASE}/health")
  login=$(http_code "${MEMORA_CHECK_BASE}/login")
  ready=$(http_code "${MEMORA_CHECK_BASE}/ready")
  if [[ "$health" == "200" && "$login" == "200" && "$ready" == "200" ]]; then
    ok=1
  else
    ok=0
  fi
  NEW_HTTP_STREAK=$(next_streak "$ok" "$ST_HTTP_STREAK")
  if [[ "$ok" == "1" ]]; then
    INFO_LINES+=("公网 /health=200 /login=200 /ready=200")
    return 0
  fi
  local line="公网 /health=${health} /login=${login} /ready=${ready} 连续失败 ${NEW_HTTP_STREAK}/${MEMORA_HTTP_FAILS}"
  if (( NEW_HTTP_STREAK >= MEMORA_HTTP_FAILS )); then
    PAGE_LINES+=("$line")
  else
    INFO_LINES+=("$line")
  fi
}

check_services() {
  local ps_out status svc health state part local_match
  local problem=0
  local -a watched=(caddy web api worker postgres redis minio)
  local -A seen=()
  set +e
  ps_out=$(compose ps --format '{{.Service}}|{{.Health}}|{{.Status}}' 2>/dev/null)
  status=$?
  set -e
  if [[ "$status" -ne 0 ]]; then
    PAGE_LINES+=("读不到 compose ps")
    return 0
  fi
  while IFS='|' read -r svc health state; do
    [[ -n "$svc" ]] || continue
    seen["$svc"]=1
    local_match=0
    for part in "${watched[@]}"; do
      if [[ "$part" == "$svc" ]]; then
        local_match=1
      fi
    done
    [[ "$local_match" -eq 1 ]] || continue
    if [[ "$health" == "healthy" ]]; then
      continue
    fi
    if [[ "$health" == "starting" ]]; then
      INFO_LINES+=("服务 ${svc} 仍在 starting")
      problem=1
      continue
    fi
    PAGE_LINES+=("服务 ${svc} health=${health:-none} status=${state:-unknown}")
    problem=1
  done <<<"$ps_out"
  for part in "${watched[@]}"; do
    if [[ -z "${seen[$part]:-}" ]]; then
      PAGE_LINES+=("服务 ${part} 不在 compose ps 里")
      problem=1
    fi
  done
  if [[ "$problem" -eq 0 ]]; then
    INFO_LINES+=("服务 healthy: caddy web api worker postgres redis minio")
  fi
}

check_disk() {
  local pct line
  if [[ ! -e "$MEMORA_DISK_PATH" ]]; then
    PAGE_LINES+=("磁盘路径不存在")
    return 0
  fi
  pct=$(disk_percent "$MEMORA_DISK_PATH")
  if ! is_uint "$pct"; then
    PAGE_LINES+=("读不到磁盘使用率")
    return 0
  fi
  line="磁盘 ${MEMORA_DISK_PATH}=${pct}% 阈值 ${MEMORA_DISK_PERCENT}%"
  if (( pct >= MEMORA_DISK_PERCENT )); then
    PAGE_LINES+=("$line")
  else
    INFO_LINES+=("$line")
  fi
  if [[ -d "$MEMORA_BACKUP_DIR" ]]; then
    local backup_pct
    backup_pct=$(disk_percent "$MEMORA_BACKUP_DIR")
    if is_uint "$backup_pct" && [[ "$backup_pct" != "$pct" ]] && (( backup_pct >= MEMORA_DISK_PERCENT )); then
      PAGE_LINES+=("磁盘 备份目录=${backup_pct}% 阈值 ${MEMORA_DISK_PERCENT}%")
    fi
  fi
}

check_backup() {
  local status age stamp
  status=$(backup_status "$MEMORA_BACKUP_DIR")
  case "$status" in
    missing)
      PAGE_LINES+=("备份目录不存在")
      ;;
    none)
      PAGE_LINES+=("备份目录里没有 manifest")
      ;;
    *)
      age=${status%% *}
      stamp=${status#* }
      if (( age >= MEMORA_BACKUP_MAX_AGE_HOURS )); then
        PAGE_LINES+=("备份过期 age=${age}h 上限 ${MEMORA_BACKUP_MAX_AGE_HOURS}h stamp=${stamp}")
      else
        INFO_LINES+=("备份 age=${age}h stamp=${stamp}")
      fi
      ;;
  esac
}

caddy_log_size() {
  local out
  set +e
  out=$(compose exec -T caddy wc -c "$MEMORA_CADDY_SYSTEM_LOG" 2>/dev/null)
  set -e
  [[ -n "$out" ]] || return 1
  printf '%s' "$out" | awk '{ print $1 }'
}

check_rate_limits() {
  local size stored start counts unlock auth public
  set +e
  size=$(caddy_log_size)
  set -e
  if ! is_uint "${size:-}"; then
    PAGE_LINES+=("读不到 Caddy 进程日志")
    NEW_LOG_OFFSET=$ST_LOG_OFFSET
    return 0
  fi
  if [[ "$LOG_OFFSET_KNOWN" -eq 0 ]]; then
    NEW_LOG_OFFSET=$size
    INFO_LINES+=("429 建立基线，不回放旧日志 unlock=0 auth=0 public=0")
    return 0
  fi
  stored=$ST_LOG_OFFSET
  if (( stored > size )); then
    stored=0
  fi
  NEW_LOG_OFFSET=$size
  if (( stored == size )); then
    INFO_LINES+=("429 新增 unlock=0 auth=0 public=0")
    return 0
  fi
  start=$((stored + 1))
  set +e
  counts=$(compose exec -T caddy tail -c +"$start" "$MEMORA_CADDY_SYSTEM_LOG" | count_rate_limits)
  set -e
  if [[ ! "$counts" =~ ^[0-9]+\ [0-9]+\ [0-9]+$ ]]; then
    PAGE_LINES+=("Caddy 进程日志没有数出 429")
    return 0
  fi
  read -r unlock auth public <<<"$counts"
  INFO_LINES+=("429 新增 unlock=${unlock} auth=${auth} public=${public}")
  if (( unlock >= MEMORA_UNLOCK_429_ALERT )); then
    PAGE_LINES+=("解锁 429 新增 ${unlock} 次，阈值 ${MEMORA_UNLOCK_429_ALERT}")
  fi
  if (( auth >= MEMORA_AUTH_429_ALERT )); then
    PAGE_LINES+=("登录 429 新增 ${auth} 次，阈值 ${MEMORA_AUTH_429_ALERT}")
  fi
}

fingerprint() {
  if [[ ${#PAGE_LINES[@]} -eq 0 ]]; then
    printf '\n'
    return 0
  fi
  printf '%s\n' "${PAGE_LINES[@]}" | sha256sum | awk '{ print $1 }'
}

print_report() {
  local line
  for line in "${INFO_LINES[@]}"; do
    log "$line"
  done
  for line in "${PAGE_LINES[@]}"; do
    log "需要处理: ${line}"
  done
}

alert_text() {
  local line
  printf 'memora monitor\n'
  for line in "${PAGE_LINES[@]}"; do
    printf '%s\n' "$line"
  done
  for line in "${INFO_LINES[@]}"; do
    case "$line" in
      429\ *) printf '%s\n' "$line" ;;
    esac
  done
}

acquire_lock() {
  local lock pid
  mkdir -p "$MEMORA_STATE_DIR"
  chmod 700 "$MEMORA_STATE_DIR"
  lock="${MEMORA_STATE_DIR}/lock"
  if ! mkdir "$lock" 2>/dev/null; then
    pid=$(cat "$lock/pid" 2>/dev/null || true)
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      log "另一轮检查还在跑"
      exit 0
    fi
    rm -rf "$lock"
    mkdir "$lock"
  fi
  printf '%s\n' "$$" >"$lock/pid"
  trap 'rm -rf "$MEMORA_STATE_DIR/lock"' EXIT
}

run_checks() {
  PAGE_LINES=()
  INFO_LINES=()
  check_edge
  check_services
  check_disk
  check_backup
  check_rate_limits
}

maybe_alert() {
  local fp now decision text sent
  fp=$(fingerprint)
  now=$(date +%s)
  if [[ ${#PAGE_LINES[@]} -eq 0 ]]; then
    ST_LAST_ALERT_HASH=""
    ST_LAST_ALERT_EPOCH=0
    log "这一轮没有需要外发的问题"
    log "$(channel_label)"
    return 0
  fi
  decision=$(decide_send 1 "$fp" "$ST_LAST_ALERT_HASH" "$ST_LAST_ALERT_EPOCH" "$now" "$MEMORA_ALERT_REPEAT_SECONDS")
  log "$(channel_label)"
  if [[ "$decision" != "yes" ]]; then
    log "同一组问题还在重复窗口内，这一轮不外发"
    return 0
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "未外发：dry-run"
    return 0
  fi
  if [[ "$MEMORA_ALERT_ENABLE" != "1" ]]; then
    log "未外发：MEMORA_ALERT_ENABLE=0"
    return 0
  fi
  text=$(alert_text)
  sent=0
  if webhook_allowed; then
    if post_webhook "$text"; then
      sent=1
    fi
  fi
  if email_allowed; then
    if post_email "$text"; then
      sent=1
    fi
  fi
  if [[ "$sent" -eq 1 ]]; then
    ST_LAST_ALERT_HASH=$fp
    ST_LAST_ALERT_EPOCH=$now
    return 0
  fi
  log "没有发出去。渠道还是占位、为空，或本机没有 mail"
}

assert_eq() {
  local got="$1"
  local want="$2"
  local label="$3"
  if [[ "$got" != "$want" ]]; then
    die "self-test ${label}: got [${got}] want [${want}]"
  fi
}

assert_not_in() {
  local haystack="$1"
  local needle="$2"
  local label="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    die "self-test ${label}: output contained a secret"
  fi
}

run_self_test() {
  local tmp secret_ip secret_pass counts report status age
  local env_file mode_env bad_env body_file port_file port server_pid payload
  tmp=$(mktemp -d)
  chmod 700 "$tmp"
  secret_ip="203.0.113.50"
  secret_pass="super-secret-value"
  cat >"$tmp/log.json" <<EOF
{"msg":"rate limit exceeded","zone":"memora_share_unlock","remote_ip":"${secret_ip}","password":"${secret_pass}"}
{"msg":"rate limit exceeded","zone":"memora_auth","remote_ip":"${secret_ip}"}
{"msg":"something else","zone":"memora_share_unlock","remote_ip":"${secret_ip}"}
{"msg":"rate limit exceeded","zone":"memora_public_shares"}
not-json
EOF
  counts=$(count_rate_limits <"$tmp/log.json")
  assert_eq "$counts" "1 1 1" "zone counts"
  assert_not_in "$counts" "$secret_pass" "count stdout"
  assert_not_in "$counts" "$secret_ip" "count ip"
  report="解锁 429 新增 1 次，阈值 30"
  assert_not_in "$report" "$secret_pass" "report"

  mkdir -p "$tmp/backup"
  touch -d '2 hours ago' "$tmp/backup/manifest-20260101T000000Z.txt"
  status=$(backup_status "$tmp/backup")
  age=${status%% *}
  if (( age < 1 || age > 3 )); then
    die "self-test fresh backup age unexpected: ${status}"
  fi
  touch -d '48 hours ago' "$tmp/backup/manifest-20260101T000000Z.txt"
  status=$(backup_status "$tmp/backup")
  age=${status%% *}
  if (( age < 47 )); then
    die "self-test old backup age unexpected: ${status}"
  fi
  assert_eq "$(backup_status "$tmp/missing-backup")" "missing" "missing backup"
  mkdir -p "$tmp/empty-backup"
  assert_eq "$(backup_status "$tmp/empty-backup")" "none" "empty backup"

  assert_eq "$(next_streak 1 4)" "0" "streak reset"
  assert_eq "$(next_streak 0 2)" "3" "streak inc"
  assert_eq "$(decide_send 0 abc abc 0 100 10)" "no" "no pages"
  assert_eq "$(decide_send 1 abc def 0 100 10)" "yes" "hash changed"
  assert_eq "$(decide_send 1 abc abc 90 100 20)" "no" "inside window"
  assert_eq "$(decide_send 1 abc abc 90 100 5)" "yes" "window elapsed"

  MEMORA_ALERT_ENABLE=0
  MEMORA_ALERT_WEBHOOK="https://hooks.example.com/memora"
  MEMORA_ALERT_EMAIL="ops@example.com"
  if webhook_allowed || email_allowed; then
    die "self-test placeholder channel was allowed while disabled"
  fi
  label=$(channel_label)
  assert_not_in "$label" "hooks.example.com" "label url"
  assert_not_in "$label" "ops@example.com" "label email"
  assert_eq "$label" "webhook=not-sent email=not-sent" "disabled label"

  MEMORA_ALERT_ENABLE=1
  if webhook_allowed; then
    die "self-test example webhook was allowed"
  fi
  if email_allowed; then
    die "self-test example email was allowed"
  fi
  MEMORA_ALERT_WEBHOOK="https://user:secret-token@alerts.example.net/hook"
  if webhook_allowed; then
    die "self-test webhook with userinfo was allowed"
  fi
  MEMORA_ALERT_WEBHOOK="http://127.0.0.1:9/hook"
  if ! webhook_allowed; then
    die "self-test localhost webhook was refused"
  fi
  MEMORA_ALERT_EMAIL="ops@example.net"
  if ! email_allowed; then
    die "self-test non-placeholder email was refused"
  fi

  scan=$(scan_file_delta "$tmp/log.json")
  case "$scan" in
    baseline\ 0\ 0\ 0\ *) ;;
    *) die "self-test baseline scan: ${scan}" ;;
  esac
  offset=${scan##* }
  printf '%s\n' '{"msg":"rate limit exceeded","zone":"memora_share_unlock","remote_ip":"203.0.113.8"}' >>"$tmp/log.json"
  scan=$(scan_file_delta "$tmp/log.json" "$offset")
  case "$scan" in
    "delta 1 0 0 "*) ;;
    *) die "self-test delta scan: ${scan}" ;;
  esac
  printf '%s\n' '{"msg":"rate limit exceeded","zone":"memora_auth"}' >"$tmp/rotated.json"
  scan=$(scan_file_delta "$tmp/rotated.json" 999999)
  case "$scan" in
    "delta 0 1 0 "*) ;;
    *) die "self-test rotation scan: ${scan}" ;;
  esac

  env_file="$tmp/monitor.env"
  printf '%s\n' 'MEMORA_ALERT_ENABLE=0' 'MEMORA_CHECK_BASE=http://127.0.0.1' >"$env_file"
  chmod 644 "$env_file"
  load_monitor_env "$env_file"
  assert_eq "$MEMORA_ALERT_ENABLE" "0" "env enable"
  bad_env="$tmp/bad.env"
  printf '%s\n' 'POSTGRES_PASSWORD=hunter2' >"$bad_env"
  chmod 600 "$bad_env"
  set +e
  (load_monitor_env "$bad_env") >"$tmp/bad.out" 2>"$tmp/bad.err"
  status=$?
  set -e
  if [[ "$status" -eq 0 ]]; then
    die "self-test accepted a database password key"
  fi
  assert_not_in "$(cat "$tmp/bad.err")" "hunter2" "reject message"
  mode_env="$tmp/open.env"
  printf '%s\n' 'MEMORA_ALERT_ENABLE=1' >"$mode_env"
  chmod 644 "$mode_env"
  set +e
  (load_monitor_env "$mode_env") >"$tmp/mode.out" 2>"$tmp/mode.err"
  status=$?
  set -e
  if [[ "$status" -eq 0 ]]; then
    die "self-test accepted mode 644 with alerts enabled"
  fi

  body_file="$tmp/body"
  port_file="$tmp/port"
  python3 - "$body_file" "$port_file" <<'PY' &
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

body_path, port_path = sys.argv[1], sys.argv[2]

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        data = self.rfile.read(length)
        with open(body_path, "wb") as handle:
            handle.write(data)
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        return

server = HTTPServer(("127.0.0.1", 0), Handler)
with open(port_path, "w", encoding="utf-8") as handle:
    handle.write(str(server.server_address[1]))
server.handle_request()
PY
  server_pid=$!
  port=""
  local i
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    if [[ -s "$port_file" ]]; then
      port=$(cat "$port_file")
      break
    fi
    sleep 0.05
  done
  if [[ -z "$port" ]]; then
    kill "$server_pid" 2>/dev/null || true
    die "self-test webhook server did not start"
  fi
  MEMORA_ALERT_ENABLE=1
  MEMORA_ALERT_WEBHOOK="http://127.0.0.1:${port}/hook"
  PAGE_LINES=("解锁 429 新增 1 次，阈值 30")
  INFO_LINES=("429 新增 unlock=1 auth=0 public=0")
  if ! post_webhook "$(alert_text)"; then
    kill "$server_pid" 2>/dev/null || true
    die "self-test webhook post failed"
  fi
  wait "$server_pid" || true
  payload=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["text"])' "$body_file")
  case "$payload" in
    *'解锁 429 新增 1 次'*) ;;
    *) die "self-test webhook body missing the finding" ;;
  esac
  assert_not_in "$payload" "$secret_pass" "webhook body"
  assert_not_in "$payload" "hooks.example.com" "webhook body url"

  example="$SCRIPT_DIR/env.monitor.example"
  [[ -f "$example" ]] || die "self-test missing env example"
  grep -q '^MEMORA_ALERT_ENABLE=0$' "$example"
  grep -q '^MEMORA_ALERT_WEBHOOK=https://hooks.example.com/memora$' "$example"
  grep -q '^MEMORA_ALERT_EMAIL=ops@example.com$' "$example"
  if grep -q 'POSTGRES_PASSWORD\|MINIO_ROOT_PASSWORD\|AKIA' "$example"; then
    die "self-test example env looks like it contains a secret"
  fi

  rm -rf "$tmp"
  log "monitor self-test ok"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --self-test) SELF_TEST=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument" ;;
  esac
  shift
done

if [[ "$SELF_TEST" -eq 1 ]]; then
  run_self_test
  exit 0
fi

if [[ -n "${MEMORA_MONITOR_ENV:-}" ]]; then
  load_monitor_env "$MEMORA_MONITOR_ENV"
fi
apply_defaults

if [[ "$DRY_RUN" -eq 0 ]]; then
  acquire_lock
  read_state
else
  read_state || true
fi

run_checks
print_report
maybe_alert

if [[ "$DRY_RUN" -eq 0 ]]; then
  write_state
fi

if [[ ${#PAGE_LINES[@]} -gt 0 ]]; then
  exit 1
fi
exit 0
