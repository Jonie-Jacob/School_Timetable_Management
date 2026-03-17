terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state — uncomment and configure for production
  # backend "s3" {
  #   bucket         = "timetable-terraform-state"
  #   key            = "prod/terraform.tfstate"
  #   region         = "ap-south-1"
  #   dynamodb_table = "terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "SchoolTimetableManagement"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# Secondary provider for CloudFront (must be us-east-1 for ACM certs)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "SchoolTimetableManagement"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}
