#!/usr/bin/env bash
# 复制 .env 和 Docker secret 文件。不打印文件内容。
# 默认不跟着数据备份跑，避免把口令悄悄写进仓库旁的目录。
set -euo pipefail
umask 077

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source-path=SCRIPTDIR
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'EOF'
用法: backup-config.sh [--dry-run] [--yes] [--stamp STAMP]

不带 BACKUP_CONFIG_SOURCES 时，只复制已经存在的这些路径：
  .env
  compose.prod.override.yml
  deploy/self-host/secrets

BACKUP_CONFIG_SOURCES 用冒号分开，列出的每一项都必须存在。
真实复制定义 --yes。可选 BACKUP_AGE_RECIPIENT 加密后删除明文。
EOF
}

DRY_RUN=0
YES=0
STAMP=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --yes) YES=1 ;;
    --stamp)
      STAMP="${2:-}"
      shift
      ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument" ;;
  esac
  shift
done

declare -a SOURCES=()
explicit=0
if [[ -n "${BACKUP_CONFIG_SOURCES:-}" ]]; then
  explicit=1
  local_ifs=$IFS
  IFS=':'
  read -r -a SOURCES <<<"${BACKUP_CONFIG_SOURCES}"
  IFS=$local_ifs
else
  SOURCES=(
    "$REPO_ROOT/.env"
    "$REPO_ROOT/compose.prod.override.yml"
    "$REPO_ROOT/deploy/self-host/secrets"
  )
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  log "dry-run: 不读取、不复制配置内容"
  local_src=""
  for local_src in "${SOURCES[@]}"; do
    if [[ -e "$local_src" ]]; then
      log "config candidate $(basename "$local_src") exists=yes"
    else
      log "config candidate $(basename "$local_src") exists=no"
    fi
  done
  if age_enabled; then
    log "age=on"
  else
    log "age=off"
  fi
  exit 0
fi

[[ "$YES" -eq 1 ]] || die "refusing to copy config without --yes"
if [[ -z "$STAMP" ]]; then
  STAMP=$(new_stamp)
fi
assert_stamp "$STAMP"

BACKUP_DIR=${BACKUP_DIR:-./backups}
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
BACKUP_DIR=$(cd "$BACKUP_DIR" && pwd)
dest="$BACKUP_DIR/config-${STAMP}"
mkdir -p "$dest"
chmod 700 "$dest"

declare -a copied=()
  src=""
for src in "${SOURCES[@]}"; do
  [[ -n "$src" ]] || continue
  if [[ ! -e "$src" ]]; then
    if [[ "$explicit" -eq 1 ]]; then
      die "config source missing"
    fi
    continue
  fi
  src_real=$(realpath "$src")
  dest_real=$(realpath -m "$dest")
  case "${src_real}/" in
    "${dest_real}/"*) die "refusing to copy a backup onto itself" ;;
  esac
  base=$(basename "$src")
  [[ "$base" != "." && "$base" != ".." ]] || die "bad config source name"
  cp -aL "$src" "$dest/$base"
  if [[ -d "$dest/$base" ]]; then
    find "$dest/$base" -type d -exec chmod 700 {} +
    find "$dest/$base" -type f -exec chmod 600 {} +
  else
    chmod 600 "$dest/$base"
  fi
  copied+=("$base")
done

if [[ ${#copied[@]} -eq 0 ]]; then
  rm -rf "$dest"
  die "no config files to copy"
fi

{
  printf '%s\n' "这些文件含口令。不要提交到 git，不要发到聊天或工单。"
  printf '%s\n' "放到另一块盘或另一台机器，并加密。"
  printf '%s\n' "恢复到新机器后，先轮换 Postgres、MinIO 和 .env 里的口令，再对外服务。"
} >"$dest/README.txt"
chmod 600 "$dest/README.txt"

name=""
: >"$dest/SOURCES.txt"
for name in "${copied[@]}"; do
  printf '%s\n' "$name" >>"$dest/SOURCES.txt"
done
chmod 600 "$dest/SOURCES.txt"

if age_enabled; then
  tar_path="${dest}.tar"
  tar -C "$BACKUP_DIR" -cf "$tar_path" "config-${STAMP}"
  chmod 600 "$tar_path"
  encrypt_file_if_needed "$tar_path"
  rm -rf "$dest"
  log "config backup encrypted stamp=${STAMP}"
else
  log "config backup written stamp=${STAMP}"
fi
