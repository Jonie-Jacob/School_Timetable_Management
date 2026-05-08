# AWS Development Environment Setup

> Status: PLAN COMPLETE — ready for implementation
> Created: May 8, 2026

## Context

Currently there's only a production environment — the `develop` branch deploys directly to production. There's no CI/CD. We need a separate dev environment on the same AWS account so that development changes can be tested before going to production. The `develop` branch will deploy to dev, and a new `production` branch will deploy to prod.

## Architecture

**Shared** (same for both envs): VPC, subnets, security groups, RDS instance, Lambda layer code
**Separate per env**: Cognito pool, S3 buckets, CloudFront distribution, DynamoDB table, Lambda functions, SSM params, database (on same RDS), ECS task definition

**Approach**: Create `infra/terraform-dev/` as a separate Terraform root that reads prod's remote state for shared resources (VPC, subnets, SGs) and creates only the per-env resources. This avoids any risk to the running prod Terraform state.

## Phases

### Phase 1: Git Branch Restructure

1. Create `production` branch from current `develop` (which is what's deployed to prod today)
2. Going forward: `production` → prod deploys, `develop` → dev deploys

### Phase 2: Terraform — Prod Outputs + Dev Infrastructure

**2A. Add missing outputs to prod Terraform** (needed by dev)

Modify `infra/terraform/outputs.tf` — add:
- `lambda_sg_id` → `module.vpc.lambda_sg_id`
- `fargate_sg_id` → `module.vpc.fargate_sg_id`
- `cloudfront_distribution_id` → `module.cloudfront.distribution_id`
- `rds_instance_arn` → (add to RDS module outputs if missing)

Run `terraform apply` on prod to publish these outputs to state (no resource changes, just output additions).

**2B. Create `infra/terraform-dev/`** with:
- `main.tf` — providers, S3 backend with `key = "dev/terraform.tfstate"`, `terraform_remote_state` data source for prod
- `modules.tf` — instantiates Cognito, S3, CloudFront, DynamoDB, IAM, SSM modules (reuses module source from `../terraform/modules/`)
- `variables.tf` — dev-specific variables (db_password, cognito URLs)
- `outputs.tf` — dev resource IDs

Skips VPC and RDS modules entirely — references prod's via remote state.

For **ECS**: Reuse prod cluster (`desired_count = 0` means no cost). Create a separate dev task definition pointing to the dev database. Or simpler: share the prod ECS setup entirely and just use different env vars when launching tasks from the dev timetable service.

For **IAM**: Create a separate `timetable-dev-lambda-role` that has permissions to the dev DynamoDB table, dev S3 buckets, and shared RDS. This keeps permissions cleanly scoped.

**2C. Run `terraform apply`** for dev:
```bash
cd infra/terraform-dev
terraform init
terraform apply -var 'db_password=DevPassword2026!'
```

Creates: dev Cognito pool, dev S3 buckets, dev CloudFront, dev DynamoDB table, dev IAM role, dev SSM parameters.

### Phase 3: Database Setup

1. Connect to RDS (temporarily make public or use existing method)
2. `CREATE DATABASE timetable_dev;`
3. `pg_dump` prod → `pg_restore` into dev
4. Run `prisma migrate deploy` against dev DATABASE_URL
5. Revert RDS to private

### Phase 4: Fix Serverless Config for Multi-Stage

**4A. `plugins/serverless-prod-config.js`** — Currently skips VPC/IAM/Layer when `stage === 'dev'`. Change to skip only for `stage === 'local'`:
```js
if (stage === 'local') {  // was 'dev'
```

**4B. `services/websocket/serverless.yml`** — Parameterize hardcoded DynamoDB ARNs:
```yaml
# Change from:
- arn:aws:dynamodb:...table/timetable-prod-ws-connections
# To:
- arn:aws:dynamodb:...table/timetable-${self:provider.stage}-ws-connections
```
Also parameterize the layer ARN to use `${env:SHARED_LAYER_ARN}`.

**4C. Update local dev `npm run dev:*` scripts** — Change Serverless offline stage from `dev` to `local` (or add `SERVERLESS_LOCAL=true` env var).

### Phase 5: Deploy Backend Services to Dev

Run the existing `scripts/deploy.sh dev` — it already:
- Reads SSM params from `/timetable/dev/*` (created by Terraform in Phase 2)
- Publishes a dev Lambda layer
- Deploys all 12 services with `--stage dev`
- Builds/pushes Docker image to dev ECR
- Runs migrations on dev database

### Phase 6: Configure CloudFront API Behaviors for Dev

The prod CloudFront has `/api/*` behavior rules pointing to specific API Gateway IDs — these were added manually (not in Terraform). For dev:

1. Get the dev API Gateway IDs from `serverless deploy` output
2. Add `/api/*` cache behaviors to the dev CloudFront distribution manually (same pattern as prod)
3. Document the dev API Gateway IDs

### Phase 7: Deploy Frontend to Dev

**7A. Create `apps/frontend/.env.staging`**:
```env
VITE_AUTH_MODE=cognito
VITE_API_BASE_URL=
VITE_WS_URL=wss://<dev-ws-api-id>.execute-api.ap-south-1.amazonaws.com/dev
VITE_COGNITO_USER_POOL_ID=<dev-pool-id>
VITE_COGNITO_CLIENT_ID=<dev-client-id>
```

**7B. Build & deploy**:
```bash
cd apps/frontend
npx vite build --mode staging
aws s3 sync dist/ s3://timetable-dev-frontend --delete
aws cloudfront create-invalidation --distribution-id <DEV_CF_DIST_ID> --paths '/*'
```

### Phase 8: Update Deploy Scripts

**8A. `package.json`** — Add `:dev` and `:prod` suffixed scripts:
```json
"deploy:frontend:prod": "...",
"deploy:frontend:dev": "cd apps/frontend && npx vite build --mode staging && aws s3 sync dist/ s3://timetable-dev-frontend --delete && ...",
"deploy:all:prod": "bash scripts/deploy.sh prod",
"deploy:all:dev": "bash scripts/deploy.sh dev"
```

**8B. Create `scripts/deploy-env-dev.ps1`** and `scripts/deploy-env-prod.ps1` — PowerShell scripts that source the right env vars for manual single-service deploys.

### Phase 9: Verification

1. Health check all 12 dev services via dev CloudFront
2. Register a test user in dev Cognito — verify it doesn't appear in prod
3. Create a test record in dev DB — verify not in prod
4. Test timetable generation on dev
5. Verify WebSocket connectivity on dev

### Phase 10: Documentation

- Update `CLAUDE.md` with dev resource IDs
- Update `Documentaion/Deployment_Operations.md` with dual-env procedures
- Create `Documentaion/Environment_Strategy.md` — branch strategy, shared vs separate resources, refreshing dev from prod

## Files to Create

| File | Purpose |
|------|---------|
| `infra/terraform-dev/main.tf` | Dev Terraform root (remote state ref to prod) |
| `infra/terraform-dev/modules.tf` | Dev module instantiations |
| `infra/terraform-dev/variables.tf` | Dev variables |
| `infra/terraform-dev/outputs.tf` | Dev resource outputs |
| `apps/frontend/.env.staging` | Dev frontend env config |
| `scripts/deploy-env-dev.ps1` | Dev deploy env vars |
| `scripts/deploy-env-prod.ps1` | Prod deploy env vars |
| `Documentaion/Environment_Strategy.md` | Env strategy docs |

## Files to Modify

| File | Change |
|------|--------|
| `infra/terraform/outputs.tf` | Add lambda_sg_id, fargate_sg_id, cloudfront_distribution_id |
| `plugins/serverless-prod-config.js` | Change `'dev'` → `'local'` for skip condition |
| `services/websocket/serverless.yml` | Parameterize hardcoded DynamoDB ARNs + layer ARN |
| `package.json` | Add `:dev`/`:prod` deploy scripts, change local dev stage |
| `CLAUDE.md` | Add dev environment section |
| `Documentaion/Deployment_Operations.md` | Add dev deployment procedures |

## Cost Impact

| Resource | Monthly Cost |
|----------|-------------|
| Cognito (dev pool) | Free |
| S3 (dev buckets) | < $0.10 |
| CloudFront (dev) | < $1 |
| DynamoDB (dev, on-demand) | < $0.10 |
| Lambda functions (dev, low usage) | Free tier |
| Additional DB on same RDS | $0 |
| **Total** | **< $2/month** |
