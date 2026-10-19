resource "aws_s3_bucket" "memora" {
  bucket     = var.bucket_name
  tags       = local.tags
  depends_on = [terraform_data.draft_guard]

  lifecycle {
    precondition {
      condition     = var.bucket_name == "memora-${var.environment}"
      error_message = "bucket_name 必须等于 memora-加上 environment。"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "memora" {
  bucket                  = aws_s3_bucket.memora.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
  depends_on              = [terraform_data.draft_guard]
}

resource "aws_s3_bucket_ownership_controls" "memora" {
  bucket     = aws_s3_bucket.memora.id
  depends_on = [terraform_data.draft_guard]

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "memora" {
  bucket     = aws_s3_bucket.memora.id
  depends_on = [terraform_data.draft_guard]

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "memora" {
  bucket     = aws_s3_bucket.memora.id
  depends_on = [terraform_data.draft_guard]

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = local.use_kms ? "aws:kms" : "AES256"
      kms_master_key_id = local.use_kms ? var.kms_key_arn : null
    }

    bucket_key_enabled = local.use_kms
  }
}

data "aws_iam_policy_document" "bucket" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.memora.arn,
      "${aws_s3_bucket.memora.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  statement {
    sid    = "DenyAnonymousReads"
    effect = "Deny"

    actions = [
      "s3:GetObject",
      "s3:ListBucket",
    ]

    resources = [
      aws_s3_bucket.memora.arn,
      "${aws_s3_bucket.memora.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:PrincipalType"
      values   = ["Anonymous"]
    }
  }

  dynamic "statement" {
    for_each = local.use_kms ? [1] : []

    content {
      sid       = "DenyUnencryptedPuts"
      effect    = "Deny"
      actions   = ["s3:PutObject"]
      resources = ["${aws_s3_bucket.memora.arn}/*"]

      principals {
        type        = "*"
        identifiers = ["*"]
      }

      condition {
        test     = "StringNotEquals"
        variable = "s3:x-amz-server-side-encryption"
        values   = ["aws:kms"]
      }
    }
  }
}

resource "aws_s3_bucket_policy" "memora" {
  bucket = aws_s3_bucket.memora.id
  policy = data.aws_iam_policy_document.bucket.json
  depends_on = [
    aws_s3_bucket_public_access_block.memora,
    terraform_data.draft_guard,
  ]
}

data "aws_iam_policy_document" "api" {
  statement {
    sid       = "ListOwnPrefixes"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.memora.arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["users/*", "albums/*", "templates/*"]
    }
  }

  statement {
    sid    = "ObjectRwOnKnownPrefixes"
    effect = "Allow"

    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]

    resources = [
      "${aws_s3_bucket.memora.arn}/users/*",
      "${aws_s3_bucket.memora.arn}/albums/*",
      "${aws_s3_bucket.memora.arn}/templates/*",
    ]
  }

  dynamic "statement" {
    for_each = local.use_kms ? [1] : []

    content {
      sid    = "UseConfiguredKmsKey"
      effect = "Allow"

      actions = [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:GenerateDataKey",
        "kms:DescribeKey",
      ]

      resources = [var.kms_key_arn]
    }
  }
}
