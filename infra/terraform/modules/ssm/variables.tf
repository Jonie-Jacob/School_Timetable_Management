variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "database_url" {
  type      = string
  sensitive = true
}

variable "cognito_user_pool_id" {
  type = string
}

variable "cognito_client_id" {
  type = string
}

variable "dynamodb_table_name" {
  type = string
}

variable "export_bucket_name" {
  type = string
}

variable "frontend_bucket_name" {
  type = string
}

variable "cloudfront_dist_id" {
  type = string
}

variable "ecr_repository_url" {
  type = string
}

variable "ecs_cluster_arn" {
  type = string
}

variable "ecs_task_def_arn" {
  type = string
}

variable "lambda_sg_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "lambda_role_arn" {
  type = string
}
