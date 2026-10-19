# shellcheck shell=bash
# 备份 / 恢复共用函数。由 bash 脚本 source，不要直接执行。
# 这里的函数不打印口令。调用方也不要 set -x。

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  printf '[memora] source this file, do not execute it\n' >&2
  exit 1
fi

SELF_HOST_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
REPO_ROOT=$(cd "$SELF_HOST_DIR/../.." && pwd)
export SELF_HOST_DIR REPO_ROOT

WRITERS_TO_RESUME=()
MC_TMP=""

log() {
  printf '[memora] %s\n' "$*"
}

die() {
  printf '[memora] %s\n' "$*" >&2
  exit 1
}

new_stamp() {
  date -u +%Y%m%dT%H%M%SZ
}

assert_stamp() {
  local stamp="${1:-}"
  case "$stamp" in
    [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z) ;;
    *) die "stamp must look like 20260101T000000Z" ;;
  esac
}

assert_bucket_name() {
  local bucket="${1:-}"
  [[ -n "$bucket" ]] || die "S3_BUCKET required"
  case "$bucket" in
    memora-*) ;;
    *) die "S3_BUCKET must match memora-\${MEMORA_ENV}" ;;
  esac
}

age_enabled() {
  [[ -n "${BACKUP_AGE_RECIPIENT:-}" ]]
}

mode_of() {
  stat -c '%a' "$1"
}

require_mode() {
  local path="$1"
  local expected="$2"
  local actual
  actual=$(mode_of "$path")
  if [[ "$actual" != "$expected" ]]; then
    die "mode of ${path} is ${actual}, want ${expected}"
  fi
}

require_docker() {
  command -v docker >/dev/null 2>&1 || die "需要 docker，才能在 Compose 网络里备份"
  if ! docker info >/dev/null 2>&1; then
    die "连不上 Docker。把当前用户加入 docker 组，或换一个有权限的用户再跑"
  fi
}

# 把脚本拷进正在运行的 Postgres 容器再执行。exec 不能临时挂载卷。
compose_pg() {
  local cmd="$1"
  local status
  shift
  require_docker
  compose cp "${SELF_HOST_DIR}/lib/pg-inside.sh" postgres:/tmp/pg-inside.sh >/dev/null
  set +e
  compose exec -T postgres /bin/sh /tmp/pg-inside.sh "$cmd" "$@"
  status=$?
  set -e
  compose exec -T -u root postgres rm -f /tmp/pg-inside.sh >/dev/null 2>&1 || true
  return "$status"
}

# COMPOSE_FILE 可以是单个文件，也可以用冒号拼多个（不要在路径里再写冒号）。
compose() {
  local -a args=()
  local -a files=()
  local first project_dir part
  [[ -n "${COMPOSE_FILE:-}" ]] || die "COMPOSE_FILE required"
  local IFS=':'
  read -r -a files <<<"${COMPOSE_FILE}"
  unset IFS
  [[ ${#files[@]} -gt 0 ]] || die "COMPOSE_FILE required"
  first="${files[0]}"
  [[ -f "$first" ]] || die "compose file missing"
  for part in "${files[@]}"; do
    args+=(-f "$part")
  done
  project_dir=$(cd "$(dirname "$first")" && pwd)
  args+=(--project-directory "$project_dir")
  if [[ -n "${COMPOSE_PROJECT_NAME:-}" ]]; then
    args+=(--project-name "$COMPOSE_PROJECT_NAME")
  fi
  docker compose "${args[@]}" "$@"
}

writers_stop_if_running() {
  local services svc state
  WRITERS_TO_RESUME=()
  services=$(compose config --services)
  for svc in api worker; do
    if printf '%s\n' "$services" | grep -qx "$svc"; then
      state=$(compose ps --status running --format '{{.Service}}' "$svc" || true)
      if [[ "$state" == "$svc" ]]; then
        WRITERS_TO_RESUME+=("$svc")
      fi
    fi
  done
  if [[ ${#WRITERS_TO_RESUME[@]} -gt 0 ]]; then
    log "stopping writers: ${WRITERS_TO_RESUME[*]}"
    compose stop "${WRITERS_TO_RESUME[@]}"
  else
    log "api / worker 没有在跑"
  fi
}

writers_resume() {
  if [[ ${#WRITERS_TO_RESUME[@]} -gt 0 ]]; then
    log "starting writers: ${WRITERS_TO_RESUME[*]}"
    compose start "${WRITERS_TO_RESUME[@]}"
  fi
}

scrub_text() {
  local text="$1"
  local secret
  text=$(printf '%s\n' "$text" | sed -E 's#(://)[^[:space:]/@]+:[^[:space:]/@]+@#\1***:***@#g')
  for secret in \
    "${S3_SECRET_ACCESS_KEY:-}" \
    "${S3_ACCESS_KEY_ID:-}" \
    "${DATABASE_URL:-}" \
    "${MINIO_ROOT_PASSWORD:-}" \
    "${POSTGRES_PASSWORD:-}" \
    "${DRILL_POSTGRES_PASSWORD:-}" \
    "${DRILL_MINIO_ROOT_PASSWORD:-}"
  do
    if [[ -n "$secret" ]]; then
      text=${text//"$secret"/***}
    fi
  done
  printf '%s\n' "$text"
}

run_scrubbed() {
  local err_file status
  err_file=$(mktemp)
  chmod 600 "$err_file"
  set +e
  "$@" >"$err_file" 2>&1
  status=$?
  set -e
  if [[ "$status" -ne 0 ]]; then
    scrub_text "$(cat "$err_file")" >&2
    rm -f "$err_file"
    return "$status"
  fi
  rm -f "$err_file"
}

begin_private_mc() {
  MC_TMP=$(mktemp -d)
  chmod 700 "$MC_TMP"
  export MC_CONFIG_DIR="$MC_TMP"
}

end_private_mc() {
  if [[ -n "${MC_TMP:-}" && -d "$MC_TMP" ]]; then
    rm -rf "$MC_TMP"
  fi
  MC_TMP=""
  unset MC_CONFIG_DIR || true
}

encrypt_file_if_needed() {
  local src="$1"
  if ! age_enabled; then
    return 0
  fi
  command -v age >/dev/null 2>&1 || die "设置了 BACKUP_AGE_RECIPIENT，但没有安装 age"
  age -r "$BACKUP_AGE_RECIPIENT" -o "${src}.age" "$src"
  chmod 600 "${src}.age"
  if command -v shred >/dev/null 2>&1; then
    shred -u "$src" || rm -f "$src"
  else
    rm -f "$src"
  fi
}

decrypt_age_file() {
  local src="$1"
  local dest="$2"
  local mode
  [[ -n "${BACKUP_AGE_IDENTITY:-}" ]] || die "加密备份需要 BACKUP_AGE_IDENTITY 指向私钥文件"
  [[ -f "$BACKUP_AGE_IDENTITY" ]] || die "BACKUP_AGE_IDENTITY 文件不存在"
  mode=$(mode_of "$BACKUP_AGE_IDENTITY")
  case "$mode" in
    400|600) ;;
    *) die "BACKUP_AGE_IDENTITY 权限必须是 400 或 600，现在是 ${mode}" ;;
  esac
  age -d -i "$BACKUP_AGE_IDENTITY" -o "$dest" "$src"
  chmod 600 "$dest"
}

hash_tree() {
  local dir="$1"
  local out="$2"
  (
    cd "$dir"
    # shellcheck disable=SC2312
    LC_ALL=C find . -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum
  ) >"$out"
  chmod 600 "$out"
}

manifest_get() {
  local file="$1"
  local key="$2"
  local line k v
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -n "$line" ]] || continue
    k=${line%%=*}
    v=${line#*=}
    if [[ "$k" == "$key" ]]; then
      printf '%s' "$v"
      return 0
    fi
  done <"$file"
  return 1
}

count_lines() {
  local file="$1"
  if [[ ! -s "$file" ]]; then
    printf '0'
    return 0
  fi
  wc -l <"$file" | tr -d ' '
}
