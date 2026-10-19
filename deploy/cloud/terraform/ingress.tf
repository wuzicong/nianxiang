# 可选的 HTTPS 入口。默认不进计划。
# 只描述负载均衡和证书，不注册目标，也不创建 ECS / 虚拟机。
# 不打开访问日志：路径里有分享令牌。要开日志，先按自托管说明打码。

resource "aws_security_group" "ingress" {
  count       = var.enable_https_ingress ? 1 : 0
  name        = "memora-${var.environment}-https"
  description = "Public HTTP redirect and HTTPS"
  vpc_id      = var.vpc_id
  tags        = local.tags
  depends_on  = [terraform_data.draft_guard]

  lifecycle {
    precondition {
      condition     = var.vpc_id != "" && length(var.public_subnet_ids) >= 2 && var.public_domain != ""
      error_message = "开启 HTTPS 入口时需要 vpc_id、至少两个公有子网，以及 public_domain。"
    }
  }

  dynamic "ingress" {
    for_each = {
      http  = 80
      https = 443
    }
    content {
      description = ingress.key
      from_port   = ingress.value
      to_port     = ingress.value
      protocol    = "tcp"
      cidr_blocks = var.https_ingress_cidrs
    }
  }
}

resource "aws_lb" "memora" {
  count                      = var.enable_https_ingress ? 1 : 0
  name                       = "memora-${var.environment}"
  load_balancer_type         = "application"
  internal                   = false
  security_groups            = [aws_security_group.ingress[0].id]
  subnets                    = var.public_subnet_ids
  drop_invalid_header_fields = true
  enable_deletion_protection = true
  tags                       = local.tags
  depends_on                 = [terraform_data.draft_guard]
}

resource "aws_lb_target_group" "web" {
  count       = var.enable_https_ingress ? 1 : 0
  name        = "memora-${var.environment}-web"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"
  tags        = local.tags
  depends_on  = [terraform_data.draft_guard]

  health_check {
    path    = "/login"
    matcher = "200"
  }
}

resource "aws_lb_target_group" "api" {
  count       = var.enable_https_ingress ? 1 : 0
  name        = "memora-${var.environment}-api"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"
  tags        = local.tags
  depends_on  = [terraform_data.draft_guard]

  health_check {
    path    = "/health"
    matcher = "200"
  }
}

resource "aws_acm_certificate" "memora" {
  count             = var.enable_https_ingress ? 1 : 0
  domain_name       = var.public_domain
  validation_method = "DNS"
  tags              = local.tags
  depends_on        = [terraform_data.draft_guard]

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_lb_listener" "http" {
  count             = var.enable_https_ingress ? 1 : 0
  load_balancer_arn = aws_lb.memora[0].arn
  port              = 80
  protocol          = "HTTP"
  tags              = local.tags
  depends_on        = [terraform_data.draft_guard]

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  count             = var.enable_https_ingress ? 1 : 0
  load_balancer_arn = aws_lb.memora[0].arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.memora[0].arn
  tags              = local.tags
  depends_on        = [terraform_data.draft_guard]

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web[0].arn
  }
}

resource "aws_lb_listener_rule" "api" {
  count        = var.enable_https_ingress ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 10
  tags         = local.tags
  depends_on   = [terraform_data.draft_guard]

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api[0].arn
  }

  condition {
    path_pattern {
      values = ["/api/*", "/health"]
    }
  }
}
