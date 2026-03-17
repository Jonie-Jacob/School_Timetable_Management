locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

# ── ECR Repository ───────────────────────────────────────────────────────────

resource "aws_ecr_repository" "engine" {
  name                 = "${local.name_prefix}-timetable-engine"
  image_tag_mutability = "MUTABLE"
  force_delete         = var.environment != "prod"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = { Name = "${local.name_prefix}-timetable-engine" }
}

resource "aws_ecr_lifecycle_policy" "engine" {
  repository = aws_ecr_repository.engine.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

# ── ECS Cluster ──────────────────────────────────────────────────────────────

resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = { Name = "${local.name_prefix}-cluster" }
}

# ── CloudWatch Log Group ────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "engine" {
  name              = "/ecs/${local.name_prefix}-timetable-engine"
  retention_in_days = 30

  tags = { Name = "${local.name_prefix}-engine-logs" }
}

# ── Task Definition ──────────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "engine" {
  family                   = "${local.name_prefix}-timetable-engine"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([{
    name      = "timetable-engine"
    image     = "${aws_ecr_repository.engine.repository_url}:latest"
    essential = true

    environment = [
      { name = "DATABASE_URL", value = var.database_url },
      { name = "WS_ENDPOINT", value = var.ws_endpoint },
      { name = "ENVIRONMENT", value = var.environment },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.engine.name
        "awslogs-region"        = data.aws_region.current.name
        "awslogs-stream-prefix" = "engine"
      }
    }
  }])

  tags = { Name = "${local.name_prefix}-timetable-engine" }
}

data "aws_region" "current" {}

# ── ECS Service (DAEMON-like: desired 0 — launched per-job by Lambda) ───────

resource "aws_ecs_service" "engine" {
  name            = "${local.name_prefix}-timetable-engine"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.engine.arn
  desired_count   = 0
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [var.fargate_sg_id]
  }

  # Don't force new deployment when desired_count is 0
  lifecycle {
    ignore_changes = [desired_count]
  }

  tags = { Name = "${local.name_prefix}-timetable-engine" }
}
