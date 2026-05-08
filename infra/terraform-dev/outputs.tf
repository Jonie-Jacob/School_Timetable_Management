# ── Dev environment outputs ───────────────────────────────────────────────────

output "cognito_user_pool_id" {
  value = module.cognito.user_pool_id
}

output "cognito_app_client_id" {
  value = module.cognito.app_client_id
}

output "frontend_bucket" {
  value = module.s3.frontend_bucket_name
}

output "export_bucket" {
  value = module.s3.export_bucket_name
}

output "cloudfront_domain" {
  value = module.cloudfront.distribution_domain_name
}

output "cloudfront_distribution_id" {
  value = module.cloudfront.distribution_id
}

output "dynamodb_table_name" {
  value = module.dynamodb.table_name
}

output "ecr_repository_url" {
  value = module.ecs.ecr_repository_url
}

output "ecs_cluster_name" {
  value = module.ecs.cluster_name
}

output "lambda_role_arn" {
  value = module.iam.lambda_role_arn
}

# Shared from prod (echoed for convenience)
output "vpc_id" {
  value = local.vpc_id
}

output "private_subnet_ids" {
  value = local.private_subnet_ids
}

output "lambda_sg_id" {
  value = local.lambda_sg_id
}

output "rds_endpoint" {
  value = local.rds_endpoint
}
