# ──────────────────────────────────────────────────────────────────────────────
# Dev Environment Terraform Configuration
#
# Creates dev-specific resources while sharing VPC, subnets, SGs, and RDS
# from the production Terraform state.
# ──────────────────────────────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "zyphr-timetable-terraform-state"
    key    = "dev/terraform.tfstate"
    region = "ap-south-1"
  }
}

provider "aws" {
  region = "ap-south-1"

  default_tags {
    tags = {
      Project     = "SchoolTimetableManagement"
      Environment = "dev"
      ManagedBy   = "Terraform"
    }
  }
}

# Secondary provider for CloudFront (ACM certs must be in us-east-1)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "SchoolTimetableManagement"
      Environment = "dev"
      ManagedBy   = "Terraform"
    }
  }
}

# ── Read shared resources from production state ──────────────────────────────

data "terraform_remote_state" "prod" {
  backend = "s3"
  config = {
    bucket = "zyphr-timetable-terraform-state"
    key    = "prod/terraform.tfstate"
    region = "ap-south-1"
  }
}

locals {
  environment  = "dev"
  project_name = "timetable"
  aws_region   = "ap-south-1"

  # Shared from prod
  vpc_id             = data.terraform_remote_state.prod.outputs.vpc_id
  private_subnet_ids = data.terraform_remote_state.prod.outputs.private_subnet_ids
  rds_endpoint       = data.terraform_remote_state.prod.outputs.rds_endpoint
  rds_instance_arn   = data.terraform_remote_state.prod.outputs.rds_instance_arn
  lambda_sg_id       = data.terraform_remote_state.prod.outputs.lambda_sg_id
  fargate_sg_id      = data.terraform_remote_state.prod.outputs.fargate_sg_id

  # Dev database URL (same RDS instance, different database)
  database_url = "postgresql://${var.db_username}:${var.db_password}@${local.rds_endpoint}/${var.db_name}"
}
