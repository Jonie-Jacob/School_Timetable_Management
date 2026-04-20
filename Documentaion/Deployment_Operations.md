# Deployment Operations Guide

How to deploy changes to the production environment after modifying frontend or backend code.

**Shell**: Windows PowerShell
**Region**: ap-south-1 (Mumbai)
**CloudFront URL**: `https://d25i05v9hwcs8q.cloudfront.net`

---

## Prerequisites (one-time setup)

Ensure these are installed and configured:

```powershell
aws --version        # AWS CLI v2
terraform --version  # >= 1.5
serverless --version # v4
node --version       # 22.x
```

AWS CLI must be configured with `timetable-admin` credentials:
```powershell
aws sts get-caller-identity  # Should show account 648485682362
```

---

## Environment Variables for Backend Deployment

Before deploying any backend service, set these environment variables in your PowerShell session:

```powershell
$env:LAMBDA_SG_ID = "sg-023ec7ce6f103470a"
$env:PRIVATE_SUBNET_IDS = "subnet-00a02f0f32ba8fc7b,subnet-0bad413134e1811e2"
$env:LAMBDA_ROLE_ARN = "arn:aws:iam::648485682362:role/timetable-prod-lambda-role"
$env:SHARED_LAYER_ARN = "arn:aws:lambda:ap-south-1:648485682362:layer:timetable-shared:8"
$env:DATABASE_URL = "postgresql://timetable_admin:Zyphr2026Prod!@timetable-prod-postgres.c186gu8203df.ap-south-1.rds.amazonaws.com:5432/timetable_prod"
$env:COGNITO_USER_POOL_ID = "ap-south-1_rlYNHNPRZ"
$env:COGNITO_CLIENT_ID = "42r2ih2m9c3l26lb4u1mrrl5sb"
$env:COGNITO_ISSUER_URL = "https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_rlYNHNPRZ"
$env:DYNAMODB_TABLE_NAME = "timetable-prod-ws-connections"
$env:JWT_SECRET = "zyphr-prod-jwt-secret-2026"
```

> **Tip**: Save these to a `deploy-env.ps1` file and dot-source it: `. .\deploy-env.ps1`

---

## 1. Deploy Frontend Changes

**When**: You've modified files in `apps/frontend/`

```powershell
# 1. Build
cd apps\frontend
npm run build

# 2. Upload to S3
aws s3 sync dist/ s3://timetable-prod-frontend --delete

# 3. Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id EUWIXJK2BNYEF --paths "/*"
```

Changes are live in **3-5 minutes** (CloudFront edge propagation).

---

## 2. Deploy a Single Backend Service

**When**: You've modified files in `services/<service-name>/`

```powershell
# Set environment variables (see above)

# Deploy one service
Push-Location services\teacher    # Replace with your service name
npx serverless deploy --stage prod
Pop-Location
```

### Service Directory Map

| Service | Directory | API Paths |
|---------|-----------|-----------|
| auth | `services/auth` | `/auth/*` |
| academic-year | `services/academic-year` | `/academic-years/*` |
| school-config | `services/school-config` | `/config/*` |
| subject | `services/subject` | `/subjects/*` |
| teacher | `services/teacher` | `/teachers/*` |
| class | `services/class` | `/classes/*` |
| division-assignment | `services/division-assignment` | `/assignments/*`, `/divisions/*`, `/elective-groups/*` |
| timetable | `services/timetable` | `/timetables/*` |
| dashboard | `services/dashboard` | `/dashboard/*` |
| export | `services/export` | `/export/*` |
| notification | `services/notification` | `/notifications/*` |
| websocket | `services/websocket` | WebSocket connections |

---

## 3. Deploy All Backend Services

**When**: You've modified the shared package or multiple services

```powershell
# Set environment variables (see above)

# Deploy all services
$services = @(
  "auth", "academic-year", "school-config", "subject", "teacher",
  "class", "division-assignment", "timetable", "dashboard",
  "export", "notification", "websocket"
)

foreach ($svc in $services) {
  Write-Host "Deploying $svc..." -ForegroundColor Cyan
  Push-Location "services\$svc"
  npx serverless deploy --stage prod
  Pop-Location
}
```

---

## 4. Deploy Shared Package Changes

**When**: You've modified files in `packages/shared/`

The shared package is deployed as a Lambda Layer. All services reference this layer.

```powershell
# 1. Build shared package
npm run build:shared

# 2. Build layer ZIP (using Git Bash for the shell script)
& "C:\Program Files\Git\bin\bash.exe" scripts/build-layer.sh

# 3. Create ZIP manually if build-layer.sh fails on Windows
cd layers\shared
powershell -Command "Compress-Archive -Path '.build\nodejs' -DestinationPath 'shared-layer.zip' -Force"

# 4. Upload to S3 (layer is too large for direct upload)
aws s3 cp "layers\shared\shared-layer.zip" "s3://zyphr-timetable-terraform-state/layers/shared-layer.zip"

# 5. Publish new layer version
$LAYER_ARN = aws lambda publish-layer-version `
  --layer-name timetable-shared `
  --content S3Bucket=zyphr-timetable-terraform-state,S3Key=layers/shared-layer.zip `
  --compatible-runtimes nodejs22.x `
  --region ap-south-1 `
  --query "LayerVersionArn" `
  --output text

Write-Host "New Layer ARN: $LAYER_ARN"

# 6. Update SSM parameter
aws ssm put-parameter `
  --name "/timetable/prod/shared-layer-arn" `
  --value $LAYER_ARN `
  --type String `
  --overwrite

# 7. Update env var and redeploy all services
$env:SHARED_LAYER_ARN = $LAYER_ARN
# Then run "Deploy All Backend Services" (section 3)
```

---

## 5. Run Database Migrations

**When**: You've added or modified Prisma migrations in `packages/shared/prisma/migrations/`

The RDS database is in a private subnet. To run migrations from your local machine:

```powershell
# Option A: Temporarily make RDS public (quick, for one-off migrations)
# See AWS_Deployment_Guide.md Step 5 for full instructions

# Option B: Use the DATABASE_URL directly if you have VPN/bastion access
$env:DATABASE_URL = "postgresql://timetable_admin:Zyphr2026Prod!@timetable-prod-postgres.c186gu8203df.ap-south-1.rds.amazonaws.com:5432/timetable_prod"
npx prisma migrate deploy --schema packages/shared/prisma/schema.prisma
```

---

## 6. Update Infrastructure (Terraform)

**When**: You've modified files in `infra/terraform/`

```powershell
cd infra\terraform

$env:TF_VAR_db_password = "Zyphr2026Prod!"

terraform plan -var-file environments/prod.tfvars
terraform apply -var-file environments/prod.tfvars
```

---

## 7. Deploy Timetable Engine (Docker/ECS)

**When**: Engine algorithm changes (greedy.py, data_loader.py, output_writer.py, etc.)

```powershell
# Build image
cd engine\timetable-generator
docker build -t timetable-engine .

# Login to ECR
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 648485682362.dkr.ecr.ap-south-1.amazonaws.com

# Tag and push
docker tag timetable-engine:latest 648485682362.dkr.ecr.ap-south-1.amazonaws.com/timetable-prod-timetable-engine:latest
docker push 648485682362.dkr.ecr.ap-south-1.amazonaws.com/timetable-prod-timetable-engine:latest
```

The engine runs as on-demand Fargate tasks (not a persistent service). The new image is used automatically on the next generation run.

---

## 8. Full Stack Deployment (Everything)

**When**: Major release or first-time setup

```powershell
# 1. Infrastructure
cd infra\terraform
terraform apply -var-file environments/prod.tfvars

# 2. Database migrations
# (see section 5)

# 3. Shared layer
# (see section 4)

# 4. All backend services
# (see section 3)

# 5. Frontend
# (see section 1)
```

---

## Verification

### Check service health

```powershell
$base = "https://d25i05v9hwcs8q.cloudfront.net"

@("auth","dashboard","teachers","subjects","classes","notifications",
  "academic-years","config") | ForEach-Object {
  $resp = Invoke-RestMethod "$base/$_/health" -ErrorAction SilentlyContinue
  Write-Host "$_`: $($resp.data.status)" -ForegroundColor $(if($resp.data.status -eq "ok"){"Green"}else{"Red"})
}
```

### Check CloudFront status

```powershell
aws cloudfront get-distribution --id EUWIXJK2BNYEF `
  --query "Distribution.Status" --output text
# Should return: Deployed
```

### View Lambda logs

```powershell
# Real-time logs for a specific service
aws logs tail "/aws/lambda/timetable-auth-prod-auth" --follow --region ap-south-1

# Recent errors only
aws logs filter-log-events `
  --log-group-name "/aws/lambda/timetable-teacher-prod-teacher" `
  --filter-pattern "ERROR" `
  --start-time ([DateTimeOffset]::UtcNow.AddHours(-1).ToUnixTimeMilliseconds()) `
  --region ap-south-1
```

---

## Common Issues

### "COGNITO_ISSUER_URL" error during deployment

The default issuer URL is `local` which fails in production. Set it before deploying:
```powershell
$env:COGNITO_ISSUER_URL = "https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_rlYNHNPRZ"
```

### Lambda layer too large for direct upload

Upload via S3 instead of `fileb://`:
```powershell
aws s3 cp layers\shared\shared-layer.zip s3://zyphr-timetable-terraform-state/layers/shared-layer.zip
aws lambda publish-layer-version --content S3Bucket=zyphr-timetable-terraform-state,S3Key=layers/shared-layer.zip ...
```

### CloudFront returns HTML instead of API response

API path patterns use `*` glob: `/teachers*` matches both `/teachers` and `/teachers/123`. If you're getting HTML for an API call, check:
1. The CloudFront behavior exists for that path
2. The request has `Content-Type: application/json` header

### TypeScript build errors

Fix unused imports/variables before building:
```powershell
cd apps\frontend
npx tsc --noEmit  # Check for errors without building
npm run build     # Build for production
```

### MSYS path conversion issue (Git Bash)

When using AWS CLI from Git Bash, paths starting with `/` get converted to Windows paths. Fix with:
```bash
MSYS_NO_PATHCONV=1 aws ssm get-parameters --names "/timetable/prod/database-url" ...
```

---

## Key AWS Resource IDs

| Resource | ID/ARN |
|----------|--------|
| AWS Account | `648485682362` |
| CloudFront Distribution | `EUWIXJK2BNYEF` |
| CloudFront Domain | `d25i05v9hwcs8q.cloudfront.net` |
| Cognito User Pool | `ap-south-1_rlYNHNPRZ` |
| Cognito Client ID | `42r2ih2m9c3l26lb4u1mrrl5sb` |
| RDS Instance | `timetable-prod-postgres` |
| RDS Endpoint | `timetable-prod-postgres.c186gu8203df.ap-south-1.rds.amazonaws.com:5432` |
| Frontend S3 Bucket | `timetable-prod-frontend` |
| Export S3 Bucket | `timetable-prod-exports` |
| Lambda Layer | `arn:aws:lambda:ap-south-1:648485682362:layer:timetable-shared:8` |
| Lambda Role | `arn:aws:iam::648485682362:role/timetable-prod-lambda-role` |
| Lambda Security Group | `sg-023ec7ce6f103470a` |
| VPC | `vpc-0f42582a0c0dd1f6e` |
| Private Subnets | `subnet-00a02f0f32ba8fc7b`, `subnet-0bad413134e1811e2` |
| DynamoDB Table | `timetable-prod-ws-connections` |
| Terraform State Bucket | `zyphr-timetable-terraform-state` |
| ECR Repository | `648485682362.dkr.ecr.ap-south-1.amazonaws.com/timetable-prod-timetable-engine` |

---

*Last updated: April 2026*
