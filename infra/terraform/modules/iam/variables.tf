variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "rds_arn" {
  type = string
}

variable "dynamodb_table_arn" {
  type = string
}

variable "export_bucket_arn" {
  type = string
}

variable "cognito_user_pool_arn" {
  type = string
}

variable "ecr_repository_arn" {
  type = string
}
