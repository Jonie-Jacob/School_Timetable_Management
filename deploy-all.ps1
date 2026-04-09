$env:LAMBDA_SG_ID = 'sg-023ec7ce6f103470a'
$env:PRIVATE_SUBNET_IDS = 'subnet-00a02f0f32ba8fc7b,subnet-0bad413134e1811e2'
$env:LAMBDA_ROLE_ARN = 'arn:aws:iam::648485682362:role/timetable-prod-lambda-role'
$env:SHARED_LAYER_ARN = 'arn:aws:lambda:ap-south-1:648485682362:layer:timetable-shared:10'
$env:DATABASE_URL = 'postgresql://timetable_admin:Zyphr2026Prod!@timetable-prod-postgres.c186gu8203df.ap-south-1.rds.amazonaws.com:5432/timetable_prod'
$env:COGNITO_USER_POOL_ID = 'ap-south-1_rlYNHNPRZ'
$env:COGNITO_CLIENT_ID = '42r2ih2m9c3l26lb4u1mrrl5sb'
$env:COGNITO_ISSUER_URL = 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_rlYNHNPRZ'
$env:DYNAMODB_TABLE_NAME = 'timetable-prod-ws-connections'
$env:JWT_SECRET = 'zyphr-prod-jwt-secret-2026'

$services = @('auth', 'academic-year', 'school-config', 'subject', 'teacher', 'class', 'division-assignment', 'timetable', 'dashboard', 'export', 'notification')

$results = @{}
foreach ($svc in $services) {
  Write-Host "============================================" -ForegroundColor Cyan
  Write-Host "Deploying $svc..." -ForegroundColor Cyan
  Write-Host "============================================" -ForegroundColor Cyan
  Push-Location "services/$svc"
  npx serverless deploy --stage prod
  if ($LASTEXITCODE -eq 0) {
    Write-Host "OK: $svc" -ForegroundColor Green
    $results[$svc] = "OK"
  } else {
    Write-Host "FAILED: $svc" -ForegroundColor Red
    $results[$svc] = "FAILED"
  }
  Pop-Location
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Yellow
Write-Host "Deployment Summary" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Yellow
foreach ($svc in $services) {
  $status = $results[$svc]
  $color = if ($status -eq "OK") { "Green" } else { "Red" }
  Write-Host "  $svc : $status" -ForegroundColor $color
}
