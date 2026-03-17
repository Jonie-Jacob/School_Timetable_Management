output "parameter_arns" {
  value = [
    aws_ssm_parameter.database_url.arn,
    aws_ssm_parameter.cognito_user_pool_id.arn,
    aws_ssm_parameter.cognito_client_id.arn,
    aws_ssm_parameter.dynamodb_table_name.arn,
    aws_ssm_parameter.export_bucket.arn,
    aws_ssm_parameter.frontend_bucket.arn,
    aws_ssm_parameter.cloudfront_dist_id.arn,
    aws_ssm_parameter.ecr_repository_url.arn,
    aws_ssm_parameter.ecs_cluster_arn.arn,
    aws_ssm_parameter.ecs_task_def_arn.arn,
    aws_ssm_parameter.lambda_sg_id.arn,
    aws_ssm_parameter.private_subnet_ids.arn,
    aws_ssm_parameter.lambda_role_arn.arn,
  ]
}
