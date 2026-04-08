# ──────────────────────────────────────────────────────────────────────────────
# deploy-env.ps1 — Set environment variables for production deployment
#
# Usage: . .\scripts\deploy-env.ps1
# (Dot-source to set vars in current session)
# ──────────────────────────────────────────────────────────────────────────────

Write-Host "Setting deployment environment variables..." -ForegroundColor Cyan

$env:LAMBDA_SG_ID = "sg-023ec7ce6f103470a"
$env:PRIVATE_SUBNET_IDS = "subnet-00a02f0f32ba8fc7b,subnet-0bad413134e1811e2"
$env:LAMBDA_ROLE_ARN = "arn:aws:iam::648485682362:role/timetable-prod-lambda-role"
$env:SHARED_LAYER_ARN = "arn:aws:lambda:ap-south-1:648485682362:layer:timetable-shared:6"
$env:DATABASE_URL = "postgresql://timetable_admin:Zyphr2026Prod!@timetable-prod-postgres.c186gu8203df.ap-south-1.rds.amazonaws.com:5432/timetable_prod"
$env:COGNITO_USER_POOL_ID = "ap-south-1_rlYNHNPRZ"
$env:COGNITO_CLIENT_ID = "42r2ih2m9c3l26lb4u1mrrl5sb"
$env:COGNITO_ISSUER_URL = "https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_rlYNHNPRZ"
$env:DYNAMODB_TABLE_NAME = "timetable-prod-ws-connections"
$env:JWT_SECRET = "zyphr-prod-jwt-secret-2026"

Write-Host "Environment variables set:" -ForegroundColor Green
Write-Host "  LAMBDA_SG_ID       = $env:LAMBDA_SG_ID"
Write-Host "  PRIVATE_SUBNET_IDS = $env:PRIVATE_SUBNET_IDS"
Write-Host "  LAMBDA_ROLE_ARN    = $env:LAMBDA_ROLE_ARN"
Write-Host "  SHARED_LAYER_ARN   = $env:SHARED_LAYER_ARN"
Write-Host "  DATABASE_URL       = postgresql://...@timetable-prod-postgres.../timetable_prod"
Write-Host "  COGNITO_USER_POOL_ID = $env:COGNITO_USER_POOL_ID"
Write-Host "  COGNITO_CLIENT_ID  = $env:COGNITO_CLIENT_ID"
Write-Host "  COGNITO_ISSUER_URL = $env:COGNITO_ISSUER_URL"
Write-Host ""
Write-Host "Ready to deploy. Available commands:" -ForegroundColor Yellow
Write-Host "  npm run deploy:frontend        # Build + S3 sync + CloudFront invalidation"
Write-Host "  npm run deploy:class           # Deploy class service"
Write-Host "  npm run deploy:assignment      # Deploy division-assignment service"
Write-Host "  npm run deploy:export-svc      # Deploy export service"
Write-Host "  npm run deploy:layer           # Build Lambda layer"
Write-Host "  npm run deploy:migrate         # Run DB migrations on prod"
Write-Host "  npm run deploy:all-services    # Deploy all services (full)"
Write-Host "  npm run health:check           # Check all service health endpoints"
