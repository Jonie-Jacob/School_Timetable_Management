locals {
  prefix = "/${var.project_name}/${var.environment}"
}

# ── Database ─────────────────────────────────────────────────────────────────

resource "aws_ssm_parameter" "database_url" {
  name  = "${local.prefix}/database-url"
  type  = "SecureString"
  value = var.database_url

  tags = { Service = "all" }
}

# ── Cognito ──────────────────────────────────────────────────────────────────

resource "aws_ssm_parameter" "cognito_user_pool_id" {
  name  = "${local.prefix}/cognito-user-pool-id"
  type  = "String"
  value = var.cognito_user_pool_id

  tags = { Service = "auth" }
}

resource "aws_ssm_parameter" "cognito_client_id" {
  name  = "${local.prefix}/cognito-client-id"
  type  = "String"
  value = var.cognito_client_id

  tags = { Service = "auth" }
}

# ── DynamoDB ─────────────────────────────────────────────────────────────────

resource "aws_ssm_parameter" "dynamodb_table_name" {
  name  = "${local.prefix}/dynamodb-table-name"
  type  = "String"
  value = var.dynamodb_table_name

  tags = { Service = "websocket" }
}

# ── S3 ───────────────────────────────────────────────────────────────────────

resource "aws_ssm_parameter" "export_bucket" {
  name  = "${local.prefix}/export-bucket-name"
  type  = "String"
  value = var.export_bucket_name

  tags = { Service = "export" }
}

resource "aws_ssm_parameter" "frontend_bucket" {
  name  = "${local.prefix}/frontend-bucket-name"
  type  = "String"
  value = var.frontend_bucket_name

  tags = { Service = "frontend" }
}

# ── CloudFront ───────────────────────────────────────────────────────────────

resource "aws_ssm_parameter" "cloudfront_dist_id" {
  name  = "${local.prefix}/cloudfront-distribution-id"
  type  = "String"
  value = var.cloudfront_dist_id

  tags = { Service = "frontend" }
}

# ── ECS / ECR ────────────────────────────────────────────────────────────────

resource "aws_ssm_parameter" "ecr_repository_url" {
  name  = "${local.prefix}/ecr-repository-url"
  type  = "String"
  value = var.ecr_repository_url

  tags = { Service = "timetable" }
}

resource "aws_ssm_parameter" "ecs_cluster_arn" {
  name  = "${local.prefix}/ecs-cluster-arn"
  type  = "String"
  value = var.ecs_cluster_arn

  tags = { Service = "timetable" }
}

resource "aws_ssm_parameter" "ecs_task_def_arn" {
  name  = "${local.prefix}/ecs-task-definition-arn"
  type  = "String"
  value = var.ecs_task_def_arn

  tags = { Service = "timetable" }
}

# ── VPC / Networking ─────────────────────────────────────────────────────────

resource "aws_ssm_parameter" "lambda_sg_id" {
  name  = "${local.prefix}/lambda-sg-id"
  type  = "String"
  value = var.lambda_sg_id

  tags = { Service = "all" }
}

resource "aws_ssm_parameter" "private_subnet_ids" {
  name  = "${local.prefix}/private-subnet-ids"
  type  = "StringList"
  value = join(",", var.private_subnet_ids)

  tags = { Service = "all" }
}

# ── IAM ──────────────────────────────────────────────────────────────────────

resource "aws_ssm_parameter" "lambda_role_arn" {
  name  = "${local.prefix}/lambda-role-arn"
  type  = "String"
  value = var.lambda_role_arn

  tags = { Service = "all" }
}
