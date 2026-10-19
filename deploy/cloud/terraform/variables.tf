variable "allow_apply" {
  type        = bool
  description = "草稿锁。默认 false，plan 和 apply 都会失败，不会创建资源。"
  default     = false
}

variable "aws_region" {
  type        = string
  description = "资源所在区域。"
  default     = "ap-southeast-1"
}

variable "environment" {
  type        = string
  description = "和 MEMORA_ENV 相同：local、dev、staging、prod。"
  default     = "prod"

  validation {
    condition     = contains(["local", "dev", "staging", "prod"], var.environment)
    error_message = "environment 必须是 local、dev、staging 或 prod。"
  }
}

variable "bucket_name" {
  type        = string
  description = "必须是 memora-加上 MEMORA_ENV（local、dev、staging、prod）。"

  validation {
    condition     = can(regex("^memora-(local|dev|staging|prod)$", var.bucket_name))
    error_message = "bucket_name 必须匹配 memora-local、memora-dev、memora-staging 或 memora-prod。"
  }
}

variable "kms_key_arn" {
  type        = string
  description = "可选。留空则对象存储使用 SSE-S3（AES256），数据库使用 AWS 托管的 RDS 密钥。生产建议填独立 CMK 的 ARN。"
  default     = ""

  validation {
    condition     = var.kms_key_arn == "" || can(regex("^arn:aws:kms:[a-z0-9-]+:[0-9]{12}:key/[a-f0-9-]+$", var.kms_key_arn))
    error_message = "kms_key_arn 必须为空，或是 KMS key ARN。"
  }
}

variable "enable_managed_postgres" {
  type        = bool
  description = "是否把托管 Postgres 写进计划。默认 false。自管库用 compose.prod.yml。"
  default     = false
}

variable "enable_managed_redis" {
  type        = bool
  description = "是否把托管 Redis 写进计划。默认 false。"
  default     = false
}

variable "enable_https_ingress" {
  type        = bool
  description = "是否把 HTTPS 负载均衡和证书写进计划。默认 false。"
  default     = false
}

variable "vpc_id" {
  type        = string
  description = "已有 VPC。本草稿不创建 VPC。"
  default     = ""
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "数据库和 Redis 使用的私有子网，至少两个。"
  default     = []
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "HTTPS 入口使用的公有子网，至少两个。"
  default     = []
}

variable "app_security_group_ids" {
  type        = list(string)
  description = "允许访问 Postgres 和 Redis 的应用安全组。不要对 0.0.0.0/0 开放 5432 或 6379。"
  default     = []
}

variable "db_username" {
  type        = string
  description = "托管 Postgres 主用户名。不是口令。"
  default     = "memora"
}

variable "db_password" {
  type        = string
  description = "托管 Postgres 主用户口令。用 TF_VAR_db_password 或未提交的 tfvars 传入。"
  sensitive   = true
  default     = ""
}

variable "db_instance_class" {
  type        = string
  description = "RDS 实例规格。上线前按容量再改。"
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  type        = number
  description = "RDS 初始容量（GiB）。"
  default     = 20
}

variable "db_max_allocated_storage" {
  type        = number
  description = "RDS 自动扩展上限（GiB）。"
  default     = 100
}

variable "db_multi_az" {
  type        = bool
  description = "生产建议 true。默认 false，避免草稿被误打开时直接按多可用区计费。"
  default     = false
}

variable "postgres_engine_version" {
  type        = string
  description = "RDS Postgres 版本。apply 前对照该区域当时可创建的 16.x，并确认提供 pgvector。"
  default     = "16.8"
}

variable "redis_node_type" {
  type        = string
  description = "ElastiCache 节点规格。"
  default     = "cache.t4g.micro"
}

variable "redis_engine_version" {
  type        = string
  description = "ElastiCache Redis 版本。apply 前对照该区域可用版本。"
  default     = "7.1"
}

variable "redis_auth_token" {
  type        = string
  description = "Redis AUTH。用 TF_VAR_redis_auth_token 或未提交的 tfvars 传入。应用侧写成 rediss://。"
  sensitive   = true
  default     = ""
}

variable "public_domain" {
  type        = string
  description = "对外域名，例如 photos.example.com。只在开启 HTTPS 入口时使用。"
  default     = ""
}

variable "https_ingress_cidrs" {
  type        = list(string)
  description = "允许访问 80/443 的来源。收紧到办公网或前置 CDN 时再改。"
  default     = ["0.0.0.0/0"]
}
