output "lambda_role_arn" {
  value = aws_iam_role.lambda.arn
}

output "lambda_role_name" {
  value = aws_iam_role.lambda.name
}

output "ecs_execution_role_arn" {
  value = aws_iam_role.ecs_execution.arn
}

output "ecs_task_role_arn" {
  value = aws_iam_role.ecs_task.arn
}
