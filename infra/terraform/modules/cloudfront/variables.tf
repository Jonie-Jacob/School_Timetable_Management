variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "frontend_bucket_arn" {
  type = string
}

variable "frontend_bucket_rdn" {
  type        = string
  description = "Regional domain name of the frontend S3 bucket"
}

variable "domain_name" {
  type    = string
  default = ""
}

variable "acm_certificate_arn" {
  type    = string
  default = ""
}
