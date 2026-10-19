# 可选的托管 Postgres。默认不进计划（enable_managed_postgres=false）。
# 自管时继续用仓库根目录的 compose.prod.yml（pgvector/pgvector:pg16），不要同时开两套库。
# 托管实例需要能 CREATE EXTENSION vector。账号不允许时改回自管，不要在这里换一个没有 pgvector 的引擎。

resource "aws_security_group" "postgres" {
  count       = var.enable_managed_postgres ? 1 : 0
  name        = "memora-${var.environment}-postgres"
  description = "Postgres from application security groups only"
  vpc_id      = var.vpc_id
  tags        = local.tags
  depends_on  = [terraform_data.draft_guard]

  dynamic "ingress" {
    for_each = toset(var.app_security_group_ids)
    content {
      description     = "application"
      from_port       = 5432
      to_port         = 5432
      protocol        = "tcp"
      security_groups = [ingress.value]
    }
  }
}

resource "aws_db_subnet_group" "memora" {
  count       = var.enable_managed_postgres ? 1 : 0
  name        = "memora-${var.environment}"
  subnet_ids  = var.private_subnet_ids
  description = "Memora private subnets"
  tags        = local.tags
  depends_on  = [terraform_data.draft_guard]

  lifecycle {
    precondition {
      condition     = var.vpc_id != "" && length(var.private_subnet_ids) >= 2
      error_message = "开启托管 Postgres 时需要 vpc_id，以及至少两个私有子网。"
    }
    precondition {
      condition     = length(var.db_password) >= 16
      error_message = "db_password 至少 16 位。用 TF_VAR_db_password 或未提交的 tfvars 传入，不要写进仓库。"
    }
  }
}

resource "aws_db_instance" "memora" {
  count                      = var.enable_managed_postgres ? 1 : 0
  identifier                 = "memora-${var.environment}"
  engine                     = "postgres"
  engine_version             = var.postgres_engine_version
  instance_class             = var.db_instance_class
  allocated_storage          = var.db_allocated_storage
  max_allocated_storage      = var.db_max_allocated_storage
  storage_type               = "gp3"
  storage_encrypted          = true
  kms_key_id                 = local.use_kms ? var.kms_key_arn : null
  db_name                    = "memora"
  username                   = var.db_username
  password                   = var.db_password
  db_subnet_group_name       = aws_db_subnet_group.memora[0].name
  vpc_security_group_ids     = [aws_security_group.postgres[0].id]
  publicly_accessible        = false
  multi_az                   = var.db_multi_az
  backup_retention_period    = 7
  backup_window              = "17:00-18:00"
  maintenance_window         = "sun:18:00-sun:19:00"
  deletion_protection        = true
  skip_final_snapshot        = false
  final_snapshot_identifier  = "memora-${var.environment}-final"
  copy_tags_to_snapshot      = true
  auto_minor_version_upgrade = true
  tags                       = local.tags
  depends_on                 = [terraform_data.draft_guard]
}
