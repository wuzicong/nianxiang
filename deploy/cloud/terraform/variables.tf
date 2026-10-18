variable "aws_region" {
  type        = string
  description = "桶所在区域。"
  default     = "ap-southeast-1"
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
  description = "可选。留空则使用 SSE-S3（AES256）。生产建议填独立 CMK 的 ARN。"
  default     = ""

  validation {
    condition     = var.kms_key_arn == "" || can(regex("^arn:aws:kms:[a-z0-9-]+:[0-9]{12}:key/[a-f0-9-]+$", var.kms_key_arn))
    error_message = "kms_key_arn 必须为空，或是 KMS key ARN。"
  }
}
