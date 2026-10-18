output "bucket_name" {
  description = "创建出的私有桶。应等于 memora-加上环境名。"
  value       = aws_s3_bucket.memora.bucket
}

output "api_iam_policy_json" {
  description = "交给部署系统挂到 API / Worker 角色。本骨架不创建角色，也不写入凭证。"
  value       = data.aws_iam_policy_document.api.json
}
