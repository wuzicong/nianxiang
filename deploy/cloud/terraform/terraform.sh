#!/usr/bin/env bash
# 包一层 terraform，拒绝会改云账号的子命令。
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if [[ $# -eq 0 ]]; then
  printf '[memora] 用法: ./terraform.sh fmt|validate|plan\n' >&2
  exit 2
fi

for arg in "$@"; do
  case "$arg" in
    apply|destroy|import)
      printf '[memora] 云草稿禁止 terraform %s。等主人云账号。见 README.md。\n' "$arg" >&2
      exit 1
      ;;
  esac
done

command -v terraform >/dev/null 2>&1 || {
  printf '[memora] 未安装 terraform\n' >&2
  exit 1
}

exec terraform "$@"
