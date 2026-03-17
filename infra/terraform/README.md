# School Timetable Management — Infrastructure

Terraform-managed AWS infrastructure for the School Timetable Management System.

## Architecture

```
CloudFront ──▶ S3 (Frontend SPA)
     │
     ▼
API Gateway (HTTP API) ──▶ Lambda Functions (11 services)
     │                          │
     │                    Lambda Layer (@timetable/shared)
     │                          │
     │                     VPC (Private Subnets)
     │                          │
     ▼                          ▼
Cognito (Auth)              RDS PostgreSQL 16
                                │
WebSocket API ──▶ Lambda    DynamoDB (WS connections)
                    │
                    ▼
               ECS Fargate ──▶ Timetable Generation Engine
```

## Modules

| Module | Resources |
|--------|-----------|
| `vpc` | VPC, 6 subnets, NAT GW, IGW, route tables, security groups |
| `rds` | PostgreSQL 16 instance, subnet group, parameter group |
| `cognito` | User Pool, App Client, custom attributes |
| `s3` | Frontend bucket (OAI), export bucket (7-day lifecycle) |
| `cloudfront` | Distribution, OAI, SPA error responses |
| `dynamodb` | WebSocketConnections table with TTL |
| `ecs` | ECS cluster, Fargate task definition, ECR repository |
| `ssm` | Parameter Store for secrets and config |
| `iam` | Lambda execution roles, Fargate role |
| `monitoring` | CloudWatch dashboards, alarms, SNS topic |

## Usage

```bash
cd infra/terraform
terraform init
terraform plan -var-file="environments/prod.tfvars"
terraform apply -var-file="environments/prod.tfvars"
```

## Region

All resources are deployed to **`ap-south-1` (Mumbai, India)**.

The only exception is the ACM certificate for CloudFront custom domains, which AWS requires to be in `us-east-1`. This is handled by a secondary Terraform provider alias (`aws.us_east_1`) and is transparent to operators.

The region is configured in `variables.tf` (`aws_region` default) and should not be changed without also updating `deploy.sh`, `buildspec.yml`, and all `serverless.yml` files.

## Prerequisites

- AWS CLI v2 configured with appropriate credentials
- Terraform >= 1.5
- S3 bucket for remote state (configured in backend.tf)
