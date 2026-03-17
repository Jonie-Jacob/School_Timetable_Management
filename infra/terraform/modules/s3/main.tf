locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

# ── Frontend Bucket (SPA hosting via CloudFront) ─────────────────────────────

resource "aws_s3_bucket" "frontend" {
  bucket = "${local.name_prefix}-frontend"

  tags = { Name = "${local.name_prefix}-frontend" }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  versioning_configuration {
    status = "Enabled"
  }
}

# ── Export Bucket (timetable exports, 7-day lifecycle) ───────────────────────

resource "aws_s3_bucket" "export" {
  bucket = "${local.name_prefix}-exports"

  tags = { Name = "${local.name_prefix}-exports" }
}

resource "aws_s3_bucket_public_access_block" "export" {
  bucket = aws_s3_bucket.export.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "export" {
  bucket = aws_s3_bucket.export.id

  rule {
    id     = "expire-exports"
    status = "Enabled"

    expiration {
      days = 7
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "export" {
  bucket = aws_s3_bucket.export.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
