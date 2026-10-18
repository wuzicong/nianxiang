#!/bin/sh
# 创建私有桶。失败应让 init 容器非 0 退出，避免「桶没建好却显示成功」。
set -eu

: "${MINIO_ROOT_USER:?MINIO_ROOT_USER required}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD required}"
: "${S3_BUCKET:?S3_BUCKET required}"

mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
if ! mc mb -p "local/${S3_BUCKET}"; then
  echo "bucket create skipped, checking it exists"
fi
mc anonymous set none "local/${S3_BUCKET}"
mc stat "local/${S3_BUCKET}" >/dev/null
echo "MinIO bucket ${S3_BUCKET} is private"
