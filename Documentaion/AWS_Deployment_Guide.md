# AWS Deployment Guide (Windows / PowerShell)

**Project**: School Timetable Management System
**Region**: ap-south-1 (Mumbai)
**Shell**: Windows PowerShell
**Date**: April 2026

> **All commands in this guide are for Windows PowerShell.** Multi-line commands use backtick (`` ` ``) for line continuation. Variable assignment uses `$var = ...` syntax.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| AWS CLI v2 | 2.x | [Download MSI](https://aws.amazon.com/cli/) — restart terminal after install |
| Terraform | >= 1.5 | [Download ZIP](https://developer.hashicorp.com/terraform/downloads) — add to PATH |
| Serverless Framework | v4 | `npm install -g serverless` |
| Node.js | 22.x | [Download](https://nodejs.org) |
| Docker Desktop | Latest | [Download](https://www.docker.com/products/docker-desktop/) |

After installing, verify all tools in a **new** PowerShell window:

```powershell
aws --version
terraform --version
serverless --version
node --version
docker --version
```

> If `aws` is not recognized, add `C:\Program Files\Amazon\AWSCLIV2` to your system PATH (System Properties > Environment Variables > Path > New).

---

## Step 1: Create IAM Admin User

> **Never use the root account for deployments.** Create a dedicated admin user.

1. Sign in to [AWS Console](https://console.aws.amazon.com) with root account (`jonie@zyphr.co.in`)
2. Go to **IAM** > **Users** > **Create user**
3. Username: `timetable-admin`
4. Check **"Provide user access to the AWS Management Console"**
5. Set a custom password
6. On Permissions page: select **"Attach policies directly"** > check `AdministratorAccess`
7. Create user > save the console sign-in URL
8. Click on the new user > **Security credentials** tab > **Create access key**
9. Select **"Command Line Interface (CLI)"** as use case
10. Download the CSV or copy the **Access Key ID** and **Secret Access Key**

---

## Step 2: Configure AWS CLI

```powershell
aws configure
```

Enter:
- **AWS Access Key ID**: (from Step 1)
- **AWS Secret Access Key**: (from Step 1)
- **Default region name**: `ap-south-1`
- **Default output format**: `json`

Verify:

```powershell
aws sts get-caller-identity
```

---

## Step 3: Create Terraform State Bucket

Terraform needs a remote backend to store infrastructure state.

```powershell
# Create S3 bucket for Terraform state
aws s3 mb s3://zyphr-timetable-terraform-state --region ap-south-1

# Enable versioning
aws s3api put-bucket-versioning `
  --bucket zyphr-timetable-terraform-state `
  --versioning-configuration Status=Enabled
```

Then update `infra/terraform/main.tf` — uncomment or add the backend block:

```hcl
terraform {
  required_version = ">= 1.5"

  backend "s3" {
    bucket = "zyphr-timetable-terraform-state"
    key    = "prod/terraform.tfstate"
    region = "ap-south-1"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
```

---

## Step 4: Deploy Infrastructure with Terraform

This creates: VPC, RDS PostgreSQL, Cognito, S3 buckets, CloudFront, DynamoDB, ECS cluster, IAM roles, SSM parameters, CloudWatch monitoring.

```powershell
cd infra\terraform

# Set database credentials as environment variables
$env:TF_VAR_db_username = "timetable_admin"
$env:TF_VAR_db_password = "YourStrongPassword123!"

# Initialize Terraform (downloads providers, sets up backend)
terraform init

# Preview what will be created
terraform plan -var-file environments/prod.tfvars

# Deploy infrastructure (~10-15 minutes)
terraform apply -var-file environments/prod.tfvars
```

Type `yes` when prompted.

**Save the outputs** — you'll need them for subsequent steps:

```powershell
terraform output
```

Key outputs to note:
- `rds_endpoint` — database connection host
- `cognito_user_pool_id` — for frontend auth config
- `cognito_client_id` — for frontend auth config
- `cloudfront_domain_name` — your app URL
- `frontend_bucket_name` — S3 bucket for SPA
- `ecr_repository_url` — Docker registry for timetable engine

---

## Step 5: Run Database Migrations

```powershell
# Get the database URL from SSM Parameter Store
$DB_URL = aws ssm get-parameter `
  --name "/timetable/prod/database-url" `
  --with-decryption `
  --query "Parameter.Value" `
  --output text

# Generate Prisma client
$env:DATABASE_URL = $DB_URL
npx prisma generate --schema packages/shared/prisma/schema.prisma

# Run migrations
npx prisma migrate deploy --schema packages/shared/prisma/schema.prisma
```

---

## Step 6: Build and Deploy Lambda Layer

The shared layer contains the Prisma client, error classes, middleware, and Zod schemas used by all 11 Lambda services.

```powershell
# From project root
cd D:\Zyphr\School_Timetable_Management

# Build the shared package
npm run build:shared

# Build the Lambda layer ZIP (using Git Bash for the shell script)
& "C:\Program Files\Git\bin\bash.exe" scripts/build-layer.sh

# Publish layer to AWS Lambda
$LAYER_ARN = aws lambda publish-layer-version `
  --layer-name timetable-shared `
  --zip-file fileb://layers/shared/shared-layer.zip `
  --compatible-runtimes nodejs22.x `
  --region ap-south-1 `
  --query "LayerVersionArn" `
  --output text

Write-Host "Layer ARN: $LAYER_ARN"

# Store layer ARN in SSM for services to reference
aws ssm put-parameter `
  --name "/timetable/prod/shared-layer-arn" `
  --value $LAYER_ARN `
  --type String `
  --overwrite
```

---

## Step 7: Deploy Backend Services (11 Lambda Functions)

### Option A: Deploy all at once (using deploy script via Git Bash)

```powershell
& "C:\Program Files\Git\bin\bash.exe" scripts/deploy.sh prod
```

### Option B: Deploy individually from PowerShell

```powershell
$services = @(
  "auth", "academic-year", "school-config", "subject", "teacher",
  "class", "division-assignment", "timetable", "dashboard", "export", "websocket"
)

foreach ($svc in $services) {
  Write-Host "Deploying $svc..." -ForegroundColor Cyan
  Push-Location "services\$svc"
  npx serverless deploy --stage prod
  Pop-Location
}
```

After deployment, note the **API Gateway endpoint URL** from the output (e.g., `https://abc123.execute-api.ap-south-1.amazonaws.com`).

---

## Step 8: Build and Deploy Frontend

```powershell
cd apps\frontend

# Create production .env file
@"
VITE_AUTH_MODE=cognito
VITE_API_BASE_URL=https://YOUR-API-GATEWAY-ID.execute-api.ap-south-1.amazonaws.com
VITE_COGNITO_USER_POOL_ID=ap-south-1_XXXXXXX
VITE_COGNITO_CLIENT_ID=your-cognito-client-id
VITE_WS_URL=wss://YOUR-WEBSOCKET-API-ID.execute-api.ap-south-1.amazonaws.com/prod
"@ | Out-File -Encoding utf8 .env.production
```

> Replace the placeholder values with actual values from `terraform output` and Serverless deploy outputs.

```powershell
# Build for production
npm run build

# Get bucket name
$BUCKET = aws ssm get-parameter `
  --name "/timetable/prod/frontend-bucket-name" `
  --query "Parameter.Value" `
  --output text

# Upload to S3
aws s3 sync dist/ "s3://$BUCKET" --delete

# Invalidate CloudFront cache
$CF_ID = aws ssm get-parameter `
  --name "/timetable/prod/cloudfront-distribution-id" `
  --query "Parameter.Value" `
  --output text

aws cloudfront create-invalidation `
  --distribution-id $CF_ID `
  --paths "/*"
```

---

## Step 9: Build and Push Timetable Engine (Docker)

```powershell
# Get ECR repository URL
$ECR_URL = aws ssm get-parameter `
  --name "/timetable/prod/ecr-repository-url" `
  --query "Parameter.Value" `
  --output text

# Login to ECR
aws ecr get-login-password --region ap-south-1 | `
  docker login --username AWS --password-stdin $ECR_URL

# Build Docker image
cd engine\timetable-generator
docker build -t timetable-engine .

# Tag and push
docker tag timetable-engine:latest "${ECR_URL}:latest"
docker push "${ECR_URL}:latest"
```

---

## Step 10: Seed Production Data (Optional)

```powershell
$DB_URL = aws ssm get-parameter `
  --name "/timetable/prod/database-url" `
  --with-decryption `
  --query "Parameter.Value" `
  --output text

$env:DATABASE_URL = $DB_URL
npm run db:seed
```

---

## Step 11: Verify Deployment

```powershell
# Get CloudFront URL
cd infra\terraform
terraform output cloudfront_domain_name
```

### Test API health endpoints:

```powershell
$API_URL = "https://YOUR-API-GATEWAY-ID.execute-api.ap-south-1.amazonaws.com"

@("auth","academic-years","config","subjects","teachers","classes",
  "assignments","timetables","dashboard","export","notifications") | ForEach-Object {
  Write-Host "Testing $_..." -NoNewline
  $response = Invoke-RestMethod "$API_URL/$_/health" -ErrorAction SilentlyContinue
  if ($response.data.status -eq "ok") { Write-Host " OK" -ForegroundColor Green }
  else { Write-Host " FAIL" -ForegroundColor Red }
}
```

### Test the frontend:

Open `https://YOUR-CLOUDFRONT-DOMAIN.cloudfront.net` in a browser.

---

## Optional: Custom Domain Setup

To use `timetable.zyphr.co.in` instead of the CloudFront URL:

### A. Setup Route 53 Hosted Zone

```powershell
# Create hosted zone (if not already exists)
aws route53 create-hosted-zone `
  --name zyphr.co.in `
  --caller-reference "$(Get-Date -Format 'yyyyMMddHHmmss')"
```

Note the **4 NS records** from the output and update your domain registrar (where you bought `zyphr.co.in`) to point to these nameservers.

### B. Request ACM Certificate

> **IMPORTANT**: CloudFront requires certificates in **us-east-1** (N. Virginia).

```powershell
aws acm request-certificate `
  --domain-name timetable.zyphr.co.in `
  --validation-method DNS `
  --region us-east-1
```

Follow the DNS validation instructions — add the CNAME record to Route 53.

### C. Update Terraform Variables

Edit `infra\terraform\environments\prod.tfvars`:

```hcl
domain_name     = "timetable.zyphr.co.in"
certificate_arn = "arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERT-UUID"
```

### D. Apply Changes

```powershell
cd infra\terraform
terraform apply -var-file environments/prod.tfvars
```

Your app will be live at `https://timetable.zyphr.co.in`.

---

## Estimated Monthly AWS Costs

| Service | Specification | Est. Cost |
|---------|--------------|-----------|
| RDS PostgreSQL | db.t4g.micro, 20GB | ~$15 |
| NAT Gateway | Single AZ | ~$35 |
| Lambda | 11 functions, low traffic | ~$1 |
| API Gateway | HTTP API | ~$1 |
| S3 | Frontend + Exports | ~$1 |
| CloudFront | CDN | ~$1 |
| DynamoDB | On-demand, WebSocket | ~$1 |
| Cognito | Free tier (50K MAU) | $0 |
| ECS Fargate | On-demand (timetable gen) | ~$2 |
| CloudWatch | Logs + Alarms | ~$3 |
| **Total** | | **~$60/month** |

> **Cost optimization tip**: The NAT Gateway (~$35/mo) is the largest cost. For dev/staging environments, consider removing it and using VPC endpoints for S3 and DynamoDB instead.

---

## Updating After Deployment

### Deploy a backend service update:

```powershell
Push-Location services\teacher  # or any service
npx serverless deploy --stage prod
Pop-Location
```

### Deploy frontend updates:

```powershell
cd apps\frontend
npm run build

$BUCKET = aws ssm get-parameter --name "/timetable/prod/frontend-bucket-name" --query "Parameter.Value" --output text
aws s3 sync dist/ "s3://$BUCKET" --delete

$CF_ID = aws ssm get-parameter --name "/timetable/prod/cloudfront-distribution-id" --query "Parameter.Value" --output text
aws cloudfront create-invalidation --distribution-id $CF_ID --paths "/*"
```

### Run database migrations:

```powershell
$DB_URL = aws ssm get-parameter --name "/timetable/prod/database-url" --with-decryption --query "Parameter.Value" --output text
$env:DATABASE_URL = $DB_URL
npx prisma migrate deploy --schema packages/shared/prisma/schema.prisma
```

### Update infrastructure:

```powershell
cd infra\terraform
terraform plan -var-file environments/prod.tfvars
terraform apply -var-file environments/prod.tfvars
```

---

## Troubleshooting

### `aws` not recognized

Add `C:\Program Files\Amazon\AWSCLIV2` to your system PATH, then restart PowerShell.

### `terraform` not recognized

Download the `.zip` from HashiCorp, extract `terraform.exe`, and either:
- Move it to a folder already in PATH (e.g., `C:\Windows\System32`)
- Or add its folder to PATH in System Environment Variables

### Lambda function errors

```powershell
aws logs tail /aws/lambda/timetable-prod-auth --follow --region ap-south-1
```

### Database connection issues

```powershell
# Check RDS status
aws rds describe-db-instances --query "DBInstances[0].DBInstanceStatus" --output text
```

### CloudFront not updating

```powershell
aws cloudfront create-invalidation --distribution-id $CF_ID --paths "/*"
aws cloudfront list-invalidations --distribution-id $CF_ID
```

### Serverless deployment fails

```powershell
npx serverless --version
npx serverless deploy --stage prod --verbose
```

### Terraform `-var-file` error on PowerShell

Use **space** instead of `=`:
```powershell
# WRONG (fails on PowerShell):
terraform plan -var-file=environments/prod.tfvars

# CORRECT:
terraform plan -var-file environments/prod.tfvars
```

---

## Architecture Diagram

```
                    +-----------------+
                    |   CloudFront    |
                    |   (CDN + SPA)   |
                    +--------+--------+
                             |
                    +--------+--------+
                    |   S3 Bucket     |
                    |   (Frontend)    |
                    +-----------------+

Users --> API Gateway (HTTP) --> Lambda Functions (11 services)
                |                        |
                |                  +-----+-----+
                |                  |  Lambda    |
                |                  |  Layer     |
                |                  | (Prisma)   |
                |                  +-----+-----+
                |                        |
          +-----+-----+          +------+------+
          | WebSocket  |          |    RDS      |
          | API GW     |          | PostgreSQL  |
          +-----+------+          +------+------+
                |                        |
          +-----+------+         (Private Subnets)
          |  DynamoDB   |
          | (Connections)|
          +-------------+

          +-------------------+
          |   ECS Fargate     |
          | (Timetable Engine)|
          |  Python GA        |
          +-------------------+
```

---

*End of AWS Deployment Guide (PowerShell Edition).*
