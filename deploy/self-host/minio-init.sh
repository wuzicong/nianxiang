#!/bin/sh
# 创建私有桶。失败应让 init 容器非 0 退出，避免「桶没建好却显示成功」。
# 口令只传给 mc，不写进这条脚本的输出。
set -eu

: "${MINIO_ROOT_USER:?MINIO_ROOT_USER required}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD required}"
: "${S3_BUCKET:?S3_BUCKET required}"

case "$S3_BUCKET" in
  memora-*) ;;
  *)
    echo "S3_BUCKET must match memora-\${MEMORA_ENV}" >&2
    exit 1
    ;;
esac

mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
if ! mc mb -p "local/${S3_BUCKET}"; then
  echo "bucket create skipped, checking it exists"
fi
# 实际生效的是 anonymous none。bucket-policy.json 是同等意图的说明，
# 不在这里 set-json：MinIO 上对 Principal * 的 Deny 可能把根用户也拒绝掉。
mc anonymous set none "local/${S3_BUCKET}"
if [ -f /minio-cors.xml ]; then
  if ! mc cors set "local/${S3_BUCKET}" /minio-cors.xml; then
    echo "warning: bucket CORS was not applied; browser PUT from the web origin may fail" >&2
  fi
fi
mc stat "local/${S3_BUCKET}" >/dev/null
echo "MinIO bucket ${S3_BUCKET} is private"
