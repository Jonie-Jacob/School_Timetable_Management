# Production environment configuration
# Usage: terraform apply -var-file=environments/prod.tfvars

aws_region     = "ap-south-1"
environment    = "prod"
project_name   = "timetable"

# VPC
vpc_cidr           = "10.0.0.0/16"
availability_zones = ["ap-south-1a", "ap-south-1b"]

# RDS
db_instance_class = "db.t4g.micro"
db_name           = "timetable_prod"
# db_username and db_password should be passed via TF_VAR_ env vars or -var flags

# Cognito
cognito_callback_urls = ["https://timetable.example.com/auth/callback"]
cognito_logout_urls   = ["https://timetable.example.com/auth/logout"]

# Domain (optional — leave empty to use CloudFront default domain)
# domain_name         = "timetable.example.com"
# acm_certificate_arn = "arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERT_ID"

# Monitoring
alarm_email = ""
