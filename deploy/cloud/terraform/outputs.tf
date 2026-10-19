output "bucket_name" {
  description = "私有桶。应等于 memora-加上环境名。"
  value       = aws_s3_bucket.memora.bucket
}

output "api_iam_policy_json" {
  description = "交给部署系统挂到 API / Worker 角色。本骨架不创建角色，也不写入凭证。"
  value       = data.aws_iam_policy_document.api.json
}

output "postgres_endpoint" {
  description = "托管 Postgres 地址。未开启时为空。连接串里的口令不要写进输出。"
  value       = var.enable_managed_postgres ? aws_db_instance.memora[0].address : null
}

output "redis_primary_endpoint" {
  description = "托管 Redis 地址。未开启时为空。AUTH 口令不在输出里。"
  value       = var.enable_managed_redis ? aws_elasticache_replication_group.memora[0].primary_endpoint_address : null
}

output "https_dns_name" {
  description = "HTTPS 负载均衡的 DNS 名。未开启时为空。目标组是空的，要另外注册 web / api。"
  value       = var.enable_https_ingress ? aws_lb.memora[0].dns_name : null
}

output "acm_dns_validation_records" {
  description = "证书的 DNS 验证记录。主人加到自己的 DNS。本草稿不创建 Route53 记录。"
  value       = var.enable_https_ingress ? aws_acm_certificate.memora[0].domain_validation_options : []
}
