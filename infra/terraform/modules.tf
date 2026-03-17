# ── Module Instantiations ────────────────────────────────────────────────────

module "vpc" {
  source = "./modules/vpc"

  project_name       = var.project_name
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
}

module "rds" {
  source = "./modules/rds"

  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  db_subnet_ids      = module.vpc.db_subnet_ids
  lambda_sg_id       = module.vpc.lambda_sg_id
  db_instance_class  = var.db_instance_class
  db_name            = var.db_name
  db_username        = var.db_username
  db_password        = var.db_password
}

module "cognito" {
  source = "./modules/cognito"

  project_name       = var.project_name
  environment        = var.environment
  callback_urls      = var.cognito_callback_urls
  logout_urls        = var.cognito_logout_urls
}

module "s3" {
  source = "./modules/s3"

  project_name = var.project_name
  environment  = var.environment
}

module "cloudfront" {
  source = "./modules/cloudfront"

  project_name        = var.project_name
  environment         = var.environment
  frontend_bucket_arn = module.s3.frontend_bucket_arn
  frontend_bucket_rdn = module.s3.frontend_bucket_regional_domain_name
  domain_name         = var.domain_name
  acm_certificate_arn = var.acm_certificate_arn
}

module "dynamodb" {
  source = "./modules/dynamodb"

  project_name = var.project_name
  environment  = var.environment
}

module "ecs" {
  source = "./modules/ecs"

  project_name        = var.project_name
  environment         = var.environment
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnet_ids
  fargate_sg_id       = module.vpc.fargate_sg_id
  database_url        = module.rds.connection_string
  ws_endpoint         = "" # Set after API Gateway deployment
  execution_role_arn  = module.iam.ecs_execution_role_arn
  task_role_arn       = module.iam.ecs_task_role_arn
}

module "iam" {
  source = "./modules/iam"

  project_name             = var.project_name
  environment              = var.environment
  aws_region               = var.aws_region
  rds_arn                  = module.rds.db_instance_arn
  dynamodb_table_arn       = module.dynamodb.table_arn
  export_bucket_arn        = module.s3.export_bucket_arn
  cognito_user_pool_arn    = module.cognito.user_pool_arn
  ecr_repository_arn       = module.ecs.ecr_repository_arn
}

module "ssm" {
  source = "./modules/ssm"

  project_name          = var.project_name
  environment           = var.environment
  database_url          = module.rds.connection_string
  cognito_user_pool_id  = module.cognito.user_pool_id
  cognito_client_id     = module.cognito.app_client_id
  dynamodb_table_name   = module.dynamodb.table_name
  export_bucket_name    = module.s3.export_bucket_name
  frontend_bucket_name  = module.s3.frontend_bucket_name
  cloudfront_dist_id    = module.cloudfront.distribution_id
  ecr_repository_url    = module.ecs.ecr_repository_url
  ecs_cluster_arn       = module.ecs.cluster_arn
  ecs_task_def_arn      = module.ecs.task_definition_arn
  lambda_sg_id          = module.vpc.lambda_sg_id
  private_subnet_ids    = module.vpc.private_subnet_ids
  lambda_role_arn       = module.iam.lambda_role_arn
}

module "monitoring" {
  source = "./modules/monitoring"

  project_name    = var.project_name
  environment     = var.environment
  alarm_email     = var.alarm_email
  rds_instance_id = module.rds.db_instance_id
  ecs_cluster     = module.ecs.cluster_name
  ecs_service     = module.ecs.service_name
}
