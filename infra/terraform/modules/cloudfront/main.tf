locals {
  name_prefix = "${var.project_name}-${var.environment}"
  has_domain  = var.domain_name != "" && var.acm_certificate_arn != ""
}

resource "aws_cloudfront_origin_access_identity" "main" {
  comment = "${local.name_prefix} frontend OAI"
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  comment             = "${local.name_prefix} frontend"
  price_class         = "PriceClass_200"

  aliases = local.has_domain ? [var.domain_name] : []

  origin {
    domain_name = var.frontend_bucket_rdn
    origin_id   = "s3-frontend"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.main.cloudfront_access_identity_path
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 31536000
  }

  # SPA: serve index.html for 403/404
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  dynamic "viewer_certificate" {
    for_each = local.has_domain ? [1] : []
    content {
      acm_certificate_arn      = var.acm_certificate_arn
      ssl_support_method       = "sni-only"
      minimum_protocol_version = "TLSv1.2_2021"
    }
  }

  dynamic "viewer_certificate" {
    for_each = local.has_domain ? [] : [1]
    content {
      cloudfront_default_certificate = true
    }
  }

  tags = { Name = "${local.name_prefix}-cdn" }
}

# Grant CloudFront OAI read access to the frontend bucket
data "aws_iam_policy_document" "frontend_bucket_policy" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${var.frontend_bucket_arn}/*"]

    principals {
      type        = "AWS"
      identifiers = [aws_cloudfront_origin_access_identity.main.iam_arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = split(":::", var.frontend_bucket_arn)[1]
  policy = data.aws_iam_policy_document.frontend_bucket_policy.json
}
