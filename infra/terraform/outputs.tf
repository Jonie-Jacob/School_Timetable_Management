# ── VPC ──────────────────────────────────────────────────────────────────────

output "vpc_id" {
  value = module.vpc.vpc_id
}

output "private_subnet_ids" {
  value = module.vpc.private_subnet_ids
}

# ── RDS ──────────────────────────────────────────────────────────────────────

output "rds_endpoint" {
  value = module.rds.endpoint
}

# ── Cognito ──────────────────────────────────────────────────────────────────

output "cognito_user_pool_id" {
  value = module.cognito.user_pool_id
}

output "cognito_app_client_id" {
  value = module.cognito.app_client_id
}

# ── S3 ───────────────────────────────────────────────────────────────────────

output "frontend_bucket" {
  value = module.s3.frontend_bucket_name
}

output "export_bucket" {
  value = module.s3.export_bucket_name
}

# ── CloudFront ───────────────────────────────────────────────────────────────

output "cloudfront_domain" {
  value = module.cloudfront.distribution_domain_name
}

# ── ECS ──────────────────────────────────────────────────────────────────────

output "ecr_repository_url" {
  value = module.ecs.ecr_repository_url
}

output "ecs_cluster_name" {
  value = module.ecs.cluster_name
}

# ── DynamoDB ─────────────────────────────────────────────────────────────────

output "dynamodb_table_name" {
  value = module.dynamodb.table_name
}
