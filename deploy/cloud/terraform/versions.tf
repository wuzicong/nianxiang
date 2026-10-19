# 草稿。禁止 terraform apply / destroy。用同目录的 terraform.sh。
# validate 不需要云凭证。plan 会被 allow_apply=false 拦住，因此也不会创建资源。

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }
}

provider "aws" {
  region = var.aws_region
  # 凭证来自运行环境（角色、环境变量或本地配置）。不要写进本目录。
}
