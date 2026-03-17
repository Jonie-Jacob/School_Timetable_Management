variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "fargate_sg_id" {
  type = string
}

variable "database_url" {
  type      = string
  sensitive = true
}

variable "ws_endpoint" {
  type    = string
  default = ""
}

variable "execution_role_arn" {
  type = string
}

variable "task_role_arn" {
  type = string
}
