output "ecr_repository_arn" {
  value = aws_ecr_repository.engine.arn
}

output "ecr_repository_url" {
  value = aws_ecr_repository.engine.repository_url
}

output "cluster_arn" {
  value = aws_ecs_cluster.main.arn
}

output "cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "task_definition_arn" {
  value = aws_ecs_task_definition.engine.arn
}

output "service_name" {
  value = aws_ecs_service.engine.name
}
