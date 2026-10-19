# 可选的托管 Redis，给 BullMQ 用。默认不进计划。
# 传输加密打开后，应用用 rediss://。不要把旧队列快照恢复进新环境，任务会重放。

resource "aws_security_group" "redis" {
  count       = var.enable_managed_redis ? 1 : 0
  name        = "memora-${var.environment}-redis"
  description = "Redis TLS from application security groups only"
  vpc_id      = var.vpc_id
  tags        = local.tags
  depends_on  = [terraform_data.draft_guard]

  dynamic "ingress" {
    for_each = toset(var.app_security_group_ids)
    content {
      description     = "application"
      from_port       = 6379
      to_port         = 6379
      protocol        = "tcp"
      security_groups = [ingress.value]
    }
  }
}

resource "aws_elasticache_subnet_group" "memora" {
  count      = var.enable_managed_redis ? 1 : 0
  name       = "memora-${var.environment}"
  subnet_ids = var.private_subnet_ids
  tags       = local.tags
  depends_on = [terraform_data.draft_guard]

  lifecycle {
    precondition {
      condition     = var.vpc_id != "" && length(var.private_subnet_ids) >= 2
      error_message = "开启托管 Redis 时需要 vpc_id，以及至少两个私有子网。"
    }
    precondition {
      condition     = length(var.redis_auth_token) >= 16
      error_message = "redis_auth_token 至少 16 位。用 TF_VAR_redis_auth_token 或未提交的 tfvars 传入，不要写进仓库。"
    }
  }
}

resource "aws_elasticache_replication_group" "memora" {
  count                      = var.enable_managed_redis ? 1 : 0
  replication_group_id       = "memora-${var.environment}"
  description                = "Memora BullMQ Redis"
  engine                     = "redis"
  engine_version             = var.redis_engine_version
  node_type                  = var.redis_node_type
  num_cache_clusters         = 1
  parameter_group_name       = "default.redis7"
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.memora[0].name
  security_group_ids         = [aws_security_group.redis[0].id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = var.redis_auth_token
  automatic_failover_enabled = false
  snapshot_retention_limit   = 0
  apply_immediately          = false
  tags                       = local.tags
  depends_on                 = [terraform_data.draft_guard]
}
