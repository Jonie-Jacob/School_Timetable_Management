#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# deploy.sh — Deploy all services to AWS
#
# Usage:
#   ./scripts/deploy.sh [stage]    # default: prod
#
# Prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - Serverless Framework v4 installed
#   - Terraform already applied (infrastructure provisioned)
#   - scripts/build-layer.sh already run
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Prevent MSYS/Git Bash from converting /path to C:/Program Files/Git/path
export MSYS_NO_PATHCONV=1

STAGE="${1:-prod}"
REGION="ap-south-1"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Deploying to stage: $STAGE (region: $REGION)"

# ── 1. Build shared package ─────────────────────────────────────────────────
echo ""
echo "==> Step 1/5: Build shared package"
cd "$PROJECT_ROOT"
npm run build -w packages/shared

# ── 2. Build and publish Lambda Layer ────────────────────────────────────────
echo ""
echo "==> Step 2/5: Build and publish Lambda Layer"
bash scripts/build-layer.sh

# Upload layer zip to S3 (too large for direct upload)
LAYER_S3_KEY="layers/${STAGE}/shared-layer.zip"
aws s3 cp layers/shared/shared-layer.zip "s3://zyphr-timetable-terraform-state/${LAYER_S3_KEY}" --region "$REGION"

LAYER_ARN=$(aws lambda publish-layer-version \
  --layer-name "timetable-${STAGE}-shared-deps" \
  --content "S3Bucket=zyphr-timetable-terraform-state,S3Key=${LAYER_S3_KEY}" \
  --compatible-runtimes nodejs22.x \
  --region "$REGION" \
  --query 'LayerVersionArn' \
  --output text)

echo "  Layer ARN: $LAYER_ARN"

aws ssm put-parameter \
  --name "/timetable/${STAGE}/shared-layer-arn" \
  --value "$LAYER_ARN" \
  --type String \
  --overwrite \
  --region "$REGION"

# ── 3. Deploy all Lambda services ───────────────────────────────────────────
echo ""
echo "==> Step 3/5: Deploy Lambda services"

# Read SSM parameters into env vars for Serverless deployment
export LAMBDA_SG_ID=$(aws ssm get-parameter --name "/timetable/${STAGE}/lambda-sg-id" --query 'Parameter.Value' --output text --region "$REGION")
export PRIVATE_SUBNET_IDS=$(aws ssm get-parameter --name "/timetable/${STAGE}/private-subnet-ids" --query 'Parameter.Value' --output text --region "$REGION")
export LAMBDA_ROLE_ARN=$(aws ssm get-parameter --name "/timetable/${STAGE}/lambda-role-arn" --query 'Parameter.Value' --output text --region "$REGION")
export COGNITO_USER_POOL_ID=$(aws ssm get-parameter --name "/timetable/${STAGE}/cognito-user-pool-id" --query 'Parameter.Value' --output text --region "$REGION")
export COGNITO_CLIENT_ID=$(aws ssm get-parameter --name "/timetable/${STAGE}/cognito-client-id" --query 'Parameter.Value' --output text --region "$REGION")
export COGNITO_ISSUER_URL="https://cognito-idp.${REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}"
export DATABASE_URL=$(aws ssm get-parameter --name "/timetable/${STAGE}/database-url" --with-decryption --query 'Parameter.Value' --output text --region "$REGION")
export SHARED_LAYER_ARN="$LAYER_ARN"
export EXPORT_BUCKET=$(aws ssm get-parameter --name "/timetable/${STAGE}/export-bucket-name" --query 'Parameter.Value' --output text --region "$REGION")
export CONNECTIONS_TABLE=$(aws ssm get-parameter --name "/timetable/${STAGE}/dynamodb-table-name" --query 'Parameter.Value' --output text --region "$REGION")
export ECS_CLUSTER_ARN=$(aws ssm get-parameter --name "/timetable/${STAGE}/ecs-cluster-arn" --query 'Parameter.Value' --output text --region "$REGION")
export ECS_TASK_DEF_ARN=$(aws ssm get-parameter --name "/timetable/${STAGE}/ecs-task-definition-arn" --query 'Parameter.Value' --output text --region "$REGION")
export ECS_SUBNET_IDS="$PRIVATE_SUBNET_IDS"
export ECS_SECURITY_GROUP_ID="$LAMBDA_SG_ID"

echo "  Environment variables loaded from SSM"

SERVICES=(
  auth
  academic-year
  school-config
  subject
  teacher
  class
  division-assignment
  timetable
  dashboard
  export
  websocket
)

for svc in "${SERVICES[@]}"; do
  echo "  Deploying $svc..."
  cd "$PROJECT_ROOT/services/$svc"
  npx serverless deploy --stage "$STAGE" --region "$REGION"
done

# ── 4. Build and push Docker image ──────────────────────────────────────────
echo ""
echo "==> Step 4/5: Build and push timetable engine Docker image"

ECR_URL=$(aws ssm get-parameter \
  --name "/timetable/${STAGE}/ecr-repository-url" \
  --query 'Parameter.Value' \
  --output text \
  --region "$REGION")

aws ecr get-login-password --region "$REGION" | \
  docker login --username AWS --password-stdin "$ECR_URL"

cd "$PROJECT_ROOT/engine/timetable-generator"
docker build -t timetable-engine .
docker tag timetable-engine:latest "${ECR_URL}:latest"
docker push "${ECR_URL}:latest"

# ── 5. Run migrations ───────────────────────────────────────────────────────
echo ""
echo "==> Step 5/5: Run database migrations"
cd "$PROJECT_ROOT/packages/shared"
npx prisma migrate deploy

echo ""
echo "==> Deployment complete! All services deployed to $STAGE."
