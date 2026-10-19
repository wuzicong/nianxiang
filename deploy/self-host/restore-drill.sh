#!/usr/bin/env bash
# 隔离演练：临时栈写入探针 → 备份 → 删卷 → 恢复 → 探针还在。
# --dry-run 不需要 Docker，会做脚本自检，并确认输出里没有口令。
set -euo pipefail
umask 077

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source-path=SCRIPTDIR
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'EOF'
用法: restore-drill.sh [--dry-run]

  --dry-run   检查脚本、拒绝打印口令的回归，以及配置副本权限。不起容器。
  不加参数    拉起项目 memora-backup-drill（不映射端口），跑通备份和恢复。

成功判定：新卷在恢复前没有探针；恢复后
  backup_probe.note = memora-backup-probe
  对象 probe/marker.txt = memora-backup-probe
  备份目录 700，dump 600
  输出里没有演练口令
EOF
}

DRY_RUN=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument" ;;
  esac
  shift
done

scan_scripts() {
  local file
  local -a files=(
    "$SELF_HOST_DIR/backup.sh"
    "$SELF_HOST_DIR/restore.sh"
    "$SELF_HOST_DIR/backup-config.sh"
    "$SELF_HOST_DIR/restore-drill.sh"
    "$SELF_HOST_DIR/lib/common.sh"
    "$SELF_HOST_DIR/lib/mc-inside.sh"
    "$SELF_HOST_DIR/lib/pg-inside.sh"
  )
  for file in "${files[@]}"; do
    if grep -nE '(^|[[:space:]])set[[:space:]]+-x([[:space:]]|$)|set[[:space:]]+-o[[:space:]]+xtrace' "$file" >/dev/null; then
      die "refusing xtrace in ${file}"
    fi
    # 模式里的 $变量 必须保持字面量，不能让本脚本展开。
    # shellcheck disable=SC2016
    if grep -nE '(echo|printf|log)[[:space:]].*\$(POSTGRES_PASSWORD|MINIO_ROOT_PASSWORD|S3_SECRET_ACCESS_KEY|DATABASE_URL|DRILL_POSTGRES_PASSWORD|DRILL_MINIO_ROOT_PASSWORD)\b' "$file" >/dev/null; then
      die "script would print a secret: ${file}"
    fi
  done
}

expect_fail() {
  local needle="$1"
  shift
  local out status
  set +e
  out=$("$@" 2>&1)
  status=$?
  set -e
  if [[ "$status" -eq 0 ]]; then
    die "expected failure: ${needle}"
  fi
  if ! printf '%s\n' "$out" | grep -q -- "$needle"; then
    die "failure output missing expected reason: ${needle}"
  fi
  if printf '%s\n' "$out" | grep -q 'super-secret-token'; then
    die "failure output contained a test secret"
  fi
}

run_static_checks() {
  local file
  local -a files=(
    "$SELF_HOST_DIR/backup.sh"
    "$SELF_HOST_DIR/restore.sh"
    "$SELF_HOST_DIR/backup-config.sh"
    "$SELF_HOST_DIR/restore-drill.sh"
    "$SELF_HOST_DIR/lib/common.sh"
  )
  for file in "${files[@]}"; do
    bash -n "$file"
  done
  sh -n "$SELF_HOST_DIR/lib/mc-inside.sh"
  sh -n "$SELF_HOST_DIR/lib/pg-inside.sh"
  scan_scripts

  local dry_out
  dry_out=$(
    DATABASE_URL='postgresql://memora:super-secret-token@127.0.0.1/memora' \
      S3_SECRET_ACCESS_KEY='super-secret-token' \
      S3_ACCESS_KEY_ID='super-secret-token' \
      S3_BUCKET='memora-local' \
      "$SELF_HOST_DIR/backup.sh" --dry-run
  )
  if printf '%s\n' "$dry_out" | grep -q 'super-secret-token'; then
    die "backup dry-run printed a secret"
  fi
  printf '%s\n' "$dry_out" | grep -q 'database_url=set' || die "backup dry-run did not acknowledge DATABASE_URL"
  printf '%s\n' "$dry_out" | grep -q 's3_secret_access_key=set' || die "backup dry-run did not acknowledge the object secret"

  "$SELF_HOST_DIR/restore.sh" --dry-run >/dev/null
  "$SELF_HOST_DIR/backup-config.sh" --dry-run >/dev/null

  expect_fail 'stamp must look like' "$SELF_HOST_DIR/restore.sh" --dry-run --stamp '../etc/passwd'
  expect_fail 'without --yes' "$SELF_HOST_DIR/restore.sh" --stamp '20260101T000000Z'
  expect_fail 'manifest missing' "$SELF_HOST_DIR/restore.sh" --dry-run --stamp '20260101T000000Z' --compose

  local tmp src sentinel out mode
  tmp=$(mktemp -d)
  src=$(mktemp -d)
  chmod 700 "$tmp" "$src"
  sentinel='sentinel-secret-value'
  printf 'POSTGRES_PASSWORD=%s\n' "$sentinel" >"$src/fake.env"
  chmod 600 "$src/fake.env"
  out=$(BACKUP_DIR="$tmp" BACKUP_CONFIG_SOURCES="$src/fake.env" \
    "$SELF_HOST_DIR/backup-config.sh" --yes --stamp '20260101T000000Z')
  if printf '%s\n' "$out" | grep -q "$sentinel"; then
    die "config backup printed the file contents"
  fi
  [[ -f "$tmp/config-20260101T000000Z/fake.env" ]] || die "config copy missing"
  mode=$(mode_of "$tmp/config-20260101T000000Z/fake.env")
  [[ "$mode" == "600" ]] || die "config file mode is ${mode}"
  mode=$(mode_of "$tmp/config-20260101T000000Z")
  [[ "$mode" == "700" ]] || die "config dir mode is ${mode}"
  grep -q 'fake.env' "$tmp/config-20260101T000000Z/SOURCES.txt" || die "config source list missing"
  if grep -q "$sentinel" "$tmp/config-20260101T000000Z/SOURCES.txt"; then
    die "config source list contained file contents"
  fi
  rm -rf "$tmp" "$src"

  if command -v age >/dev/null 2>&1; then
    local key recipient plain
    tmp=$(mktemp -d)
    chmod 700 "$tmp"
    key="$tmp/identity"
    age-keygen -o "$key" >/dev/null 2>&1
    chmod 600 "$key"
    recipient=$(age-keygen -y "$key")
    plain="$tmp/plain.txt"
    printf 'probe-body' >"$plain"
    BACKUP_AGE_RECIPIENT="$recipient" encrypt_file_if_needed "$plain"
    [[ ! -f "$plain" ]] || die "age left plaintext in place"
    [[ -f "${plain}.age" ]] || die "age ciphertext missing"
    BACKUP_AGE_IDENTITY="$key" decrypt_age_file "${plain}.age" "$tmp/back.txt"
    [[ "$(cat "$tmp/back.txt")" == "probe-body" ]] || die "age roundtrip mismatch"
    rm -rf "$tmp"
    log "age roundtrip ok"
  else
    log "age not installed, skip encryption roundtrip"
  fi
}

if [[ "$DRY_RUN" -eq 1 ]]; then
  run_static_checks
  log "drill dry-run ok"
  exit 0
fi

run_static_checks

export COMPOSE_FILE="$SELF_HOST_DIR/compose.drill.yml"
export COMPOSE_PROJECT_NAME=memora-backup-drill
[[ "$COMPOSE_PROJECT_NAME" == "memora-backup-drill" ]] || die "refusing to touch another compose project"
grep -q '^name: memora-backup-drill$' "$COMPOSE_FILE" || die "unexpected drill compose project"

require_docker

DRILL_POSTGRES_PASSWORD=$(od -An -N 16 -tx1 /dev/urandom | tr -d ' \n')
DRILL_MINIO_ROOT_PASSWORD=$(od -An -N 16 -tx1 /dev/urandom | tr -d ' \n')
export DRILL_POSTGRES_PASSWORD
export DRILL_MINIO_ROOT_PASSWORD
export S3_BUCKET=memora-local
export POSTGRES_USER=memora
export POSTGRES_DB=memora

BACKUP_DIR=$(mktemp -d)
chmod 700 "$BACKUP_DIR"

cleanup_drill() {
  local status=$?
  set +e
  if [[ "${COMPOSE_PROJECT_NAME:-}" == "memora-backup-drill" ]]; then
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  if [[ "$status" -eq 0 ]]; then
    rm -rf "$BACKUP_DIR"
  else
    log "drill failed. leftover backup dir: ${BACKUP_DIR}"
  fi
  exit "$status"
}
trap cleanup_drill EXIT

wait_healthy() {
  local attempt=0 pg_health="" minio_health=""
  while [[ "$attempt" -lt 60 ]]; do
    attempt=$((attempt + 1))
    pg_health=$(compose ps postgres --format '{{.Health}}' 2>/dev/null || true)
    minio_health=$(compose ps minio --format '{{.Health}}' 2>/dev/null || true)
    if [[ "$pg_health" == "healthy" && "$minio_health" == "healthy" ]]; then
      return 0
    fi
    sleep 2
  done
  die "postgres or minio did not become healthy after ${attempt} checks (last postgres=${pg_health:-unknown} minio=${minio_health:-unknown})"
}

start_stack() {
  local init_log
  compose up -d --quiet-pull postgres minio
  wait_healthy
  init_log=$(mktemp)
  chmod 600 "$init_log"
  if ! compose run --rm --no-deps minio-init >"$init_log" 2>&1; then
    scrub_text "$(cat "$init_log")" >&2
    rm -f "$init_log"
    die "minio-init failed"
  fi
  rm -f "$init_log"
}

mc_drill() {
  local action="$1"
  shift
  compose run --rm --no-deps -T --entrypoint /bin/sh \
    -e "S3_BUCKET=${S3_BUCKET}" \
    -v "${SELF_HOST_DIR}/lib/mc-inside.sh:/mc-inside.sh:ro" \
    minio-init /mc-inside.sh "$action" "$@"
}

start_stack

compose_pg psql <<'SQL'
CREATE TABLE backup_probe (
  id text PRIMARY KEY,
  note text NOT NULL
);
INSERT INTO backup_probe (id, note) VALUES ('probe-1', 'memora-backup-probe');
SQL

printf '%s' 'memora-backup-probe' | mc_drill put 'probe/marker.txt'

backup_log=$(mktemp)
chmod 600 "$backup_log"
if ! BACKUP_DIR="$BACKUP_DIR" \
  COMPOSE_FILE="$COMPOSE_FILE" \
  COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
  S3_BUCKET="$S3_BUCKET" \
  "$SELF_HOST_DIR/backup.sh" --compose >"$backup_log" 2>&1; then
  scrub_text "$(cat "$backup_log")" >&2
  rm -f "$backup_log"
  die "backup failed"
fi
if grep -q "$DRILL_POSTGRES_PASSWORD" "$backup_log" || grep -q "$DRILL_MINIO_ROOT_PASSWORD" "$backup_log"; then
  rm -f "$backup_log"
  die "backup output contained a credential"
fi
stamp=$(sed -n 's/^\[memora\] backup written under .* stamp=//p' "$backup_log" | head -n 1)
rm -f "$backup_log"
assert_stamp "$stamp"

require_mode "$BACKUP_DIR" 700
require_mode "$BACKUP_DIR/memora-${stamp}.dump" 600
require_mode "$BACKUP_DIR/manifest-${stamp}.txt" 600
require_mode "$BACKUP_DIR/objects-${stamp}/probe/marker.txt" 600
magic=$(head -c 5 "$BACKUP_DIR/memora-${stamp}.dump" || true)
[[ "$magic" == "PGDMP" ]] || die "drill dump magic mismatch"

[[ "$COMPOSE_PROJECT_NAME" == "memora-backup-drill" ]] || die "refusing to wipe another project"
compose down -v --remove-orphans

start_stack

before=$(compose_pg psql -tA -c "SELECT to_regclass('public.backup_probe');" | tr -d '[:space:]')
[[ -z "$before" ]] || die "probe table still present before restore"

set +e
mc_drill stat 'probe/marker.txt' >/dev/null 2>&1
stat_status=$?
set -e
[[ "$stat_status" -ne 0 ]] || die "object probe still present before restore"

restore_log=$(mktemp)
chmod 600 "$restore_log"
if ! BACKUP_DIR="$BACKUP_DIR" \
  COMPOSE_FILE="$COMPOSE_FILE" \
  COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
  S3_BUCKET="$S3_BUCKET" \
  "$SELF_HOST_DIR/restore.sh" --compose --fresh --no-pause-writers --yes --stamp "$stamp" \
  >"$restore_log" 2>&1; then
  scrub_text "$(cat "$restore_log")" >&2
  rm -f "$restore_log"
  die "restore failed"
fi
if grep -q "$DRILL_POSTGRES_PASSWORD" "$restore_log" || grep -q "$DRILL_MINIO_ROOT_PASSWORD" "$restore_log"; then
  rm -f "$restore_log"
  die "restore output contained a credential"
fi
rm -f "$restore_log"

note=$(compose_pg psql -tA -c "SELECT note FROM backup_probe WHERE id = 'probe-1';" | tr -d '[:space:]')
[[ "$note" == "memora-backup-probe" ]] || die "postgres probe mismatch"

body=$(mc_drill cat 'probe/marker.txt' | tr -d '[:space:]')
[[ "$body" == "memora-backup-probe" ]] || die "object probe mismatch"

log "drill ok: postgres probe=memora-backup-probe object probe=memora-backup-probe dump_mode=600 backup_dir_mode=700"
