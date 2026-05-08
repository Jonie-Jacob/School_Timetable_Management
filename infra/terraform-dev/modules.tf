# ── Dev-specific module instantiations ────────────────────────────────────────
# Reuses module source code from ../terraform/modules/
# VPC and RDS are shared from prod (referenced via remote state in main.tf)

module "cognito" {
  source = "../terraform/modules/cognito"

  project_name  = local.project_name
  environment   = local.environment
  callback_urls = var.cognito_callback_urls
  logout_urls   = var.cognito_logout_urls
}

module "s3" {
  source = "../terraform/modules/s3"

  project_name = local.project_name
  environment  = local.environment
}

module "cloudfront" {
  source = "../terraform/modules/cloudfront"

  project_name        = local.project_name
  environment         = local.environment
  frontend_bucket_arn = module.s3.frontend_bucket_arn
  frontend_bucket_rdn = module.s3.frontend_bucket_regional_domain_name
  domain_name         = var.domain_name
  acm_certificate_arn = var.acm_certificate_arn
}

module "dynamodb" {
  source = "../terraform/modules/dynamodb"

  project_name = local.project_name
  environment  = local.environment
}

module "ecs" {
  source = "../terraform/modules/ecs"

  project_name       = local.project_name
  environment        = local.environment
  vpc_id             = local.vpc_id
  private_subnet_ids = local.private_subnet_ids
  fargate_sg_id      = local.fargate_sg_id
  database_url       = local.database_url
  ws_endpoint        = "" # Set after API Gateway deployment
  execution_role_arn = module.iam.ecs_execution_role_arn
  task_role_arn      = module.iam.ecs_task_role_arn
}

module "iam" {
  source = "../terraform/modules/iam"

  project_name          = local.project_name
  environment           = local.environment
  aws_region            = local.aws_region
  rds_arn               = local.rds_instance_arn
  dynamodb_table_arn    = module.dynamodb.table_arn
  export_bucket_arn     = module.s3.export_bucket_arn
  cognito_user_pool_arn = module.cognito.user_pool_arn
  ecr_repository_arn    = module.ecs.ecr_repository_arn
}

module "ssm" {
  source = "../terraform/modules/ssm"

  project_name         = local.project_name
  environment          = local.environment
  database_url         = local.database_url
  cognito_user_pool_id = module.cognito.user_pool_id
  cognito_client_id    = module.cognito.app_client_id
  dynamodb_table_name  = module.dynamodb.table_name
  export_bucket_name   = module.s3.export_bucket_name
  frontend_bucket_name = module.s3.frontend_bucket_name
  cloudfront_dist_id   = module.cloudfront.distribution_id
  ecr_repository_url   = module.ecs.ecr_repository_url
  ecs_cluster_arn      = module.ecs.cluster_arn
  ecs_task_def_arn     = module.ecs.task_definition_arn
  lambda_sg_id         = local.lambda_sg_id
  private_subnet_ids   = local.private_subnet_ids
  lambda_role_arn      = module.iam.lambda_role_arn
}

module "monitoring" {
  source = "../terraform/modules/monitoring"

  project_name    = local.project_name
  environment     = local.environment
  alarm_email     = var.alarm_email
  rds_instance_id = "timetable-prod-postgres" # Shared RDS instance
  ecs_cluster     = module.ecs.cluster_name
  ecs_service     = module.ecs.service_name
}
