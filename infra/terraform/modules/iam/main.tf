locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

data "aws_caller_identity" "current" {}

# ═══════════════════════════════════════════════════════════════════════════════
# Lambda Execution Role (shared across all Lambda services)
# ═══════════════════════════════════════════════════════════════════════════════

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${local.name_prefix}-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = { Name = "${local.name_prefix}-lambda-role" }
}

# Attach basic Lambda execution (CloudWatch Logs)
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# VPC access for Lambda
resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# Lambda custom policy: DynamoDB, S3, ECS, Cognito, API Gateway management
data "aws_iam_policy_document" "lambda_custom" {
  # DynamoDB — WebSocket connections table
  statement {
    sid = "DynamoDB"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
    ]
    resources = [
      var.dynamodb_table_arn,
      "${var.dynamodb_table_arn}/index/*",
    ]
  }

  # S3 — Export bucket read/write
  statement {
    sid = "S3Exports"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = ["${var.export_bucket_arn}/*"]
  }

  # ECS — Run Fargate tasks (timetable generation)
  statement {
    sid = "ECSRunTask"
    actions = [
      "ecs:RunTask",
      "ecs:DescribeTasks",
      "ecs:StopTask",
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestedRegion"
      values   = [var.aws_region]
    }
  }

  # IAM PassRole — allow Lambda to pass ECS roles
  statement {
    sid       = "PassRole"
    actions   = ["iam:PassRole"]
    resources = [
      aws_iam_role.ecs_execution.arn,
      aws_iam_role.ecs_task.arn,
    ]
  }

  # API Gateway — manage WebSocket connections (postToConnection)
  statement {
    sid     = "APIGatewayManageConnections"
    actions = ["execute-api:ManageConnections"]
    resources = [
      "arn:aws:execute-api:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*/@connections/*"
    ]
  }

  # SSM — read parameters
  statement {
    sid     = "SSMRead"
    actions = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
    resources = [
      "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${var.project_name}/${var.environment}/*"
    ]
  }
}

resource "aws_iam_role_policy" "lambda_custom" {
  name   = "${local.name_prefix}-lambda-custom"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_custom.json
}

# ═══════════════════════════════════════════════════════════════════════════════
# ECS Execution Role (pulls images, writes logs)
# ═══════════════════════════════════════════════════════════════════════════════

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_execution" {
  name               = "${local.name_prefix}-ecs-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = { Name = "${local.name_prefix}-ecs-execution-role" }
}

resource "aws_iam_role_policy_attachment" "ecs_execution_basic" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ECR pull access
data "aws_iam_policy_document" "ecs_execution_ecr" {
  statement {
    actions = [
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:GetAuthorizationToken",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "ecs_execution_ecr" {
  name   = "${local.name_prefix}-ecs-execution-ecr"
  role   = aws_iam_role.ecs_execution.id
  policy = data.aws_iam_policy_document.ecs_execution_ecr.json
}

# ═══════════════════════════════════════════════════════════════════════════════
# ECS Task Role (app-level permissions for timetable engine)
# ═══════════════════════════════════════════════════════════════════════════════

resource "aws_iam_role" "ecs_task" {
  name               = "${local.name_prefix}-ecs-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = { Name = "${local.name_prefix}-ecs-task-role" }
}

data "aws_iam_policy_document" "ecs_task" {
  # Write to RDS via network (no IAM policy needed for regular RDS)
  # But engine needs: API Gateway (WebSocket push), CloudWatch Logs

  statement {
    sid     = "APIGatewayManageConnections"
    actions = ["execute-api:ManageConnections"]
    resources = [
      "arn:aws:execute-api:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*/@connections/*"
    ]
  }

  statement {
    sid = "CloudWatchLogs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["*"]
  }

  # DynamoDB — query connections to broadcast progress
  statement {
    sid = "DynamoDB"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:Query",
    ]
    resources = [
      var.dynamodb_table_arn,
      "${var.dynamodb_table_arn}/index/*",
    ]
  }
}

resource "aws_iam_role_policy" "ecs_task" {
  name   = "${local.name_prefix}-ecs-task"
  role   = aws_iam_role.ecs_task.id
  policy = data.aws_iam_policy_document.ecs_task.json
}
