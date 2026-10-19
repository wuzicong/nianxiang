locals {
  use_kms = var.kms_key_arn != ""
  tags = {
    Project     = "memora"
    Environment = var.environment
    ManagedBy   = "terraform-draft"
  }
}

# 草稿锁。allow_apply 默认 false 时，plan / apply 在这里失败，不会创建资源。
# 有人用 -target 跳过这个资源时，下面的资源仍然 depends_on 它。
resource "terraform_data" "draft_guard" {
  input = "memora-cloud-draft"

  lifecycle {
    precondition {
      condition     = var.allow_apply
      error_message = "这是云部署草稿。禁止 terraform apply。默认 allow_apply=false，计划阶段就会停住，不会创建资源。等主人自己的云账号就绪后，再在未提交的 tfvars 里打开，并阅读 deploy/cloud/README.md。"
    }
  }
}
