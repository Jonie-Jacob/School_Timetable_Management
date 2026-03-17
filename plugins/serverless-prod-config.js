'use strict';

/**
 * Serverless plugin that conditionally adds VPC, IAM role, and Lambda Layer
 * configuration when deploying to production (non-dev stages).
 * 
 * For local dev (stage=dev), these are omitted to avoid validation errors
 * when AWS-specific env vars are not set.
 * 
 * Required env vars for prod deployment:
 *   LAMBDA_SG_ID, PRIVATE_SUBNET_IDS, LAMBDA_ROLE_ARN, SHARED_LAYER_ARN
 */
class ServerlessProdConfig {
  constructor(serverless) {
    this.serverless = serverless;
    this.hooks = {
      'before:package:initialize': () => this.applyProdConfig(),
      'before:offline:start': () => this.logSkip(),
      'before:offline:start:init': () => this.logSkip(),
    };
  }

  logSkip() {
    this.serverless.cli.log('[prod-config] Local dev mode — skipping VPC/IAM/Layer config');
  }

  applyProdConfig() {
    const stage = this.serverless.service.provider.stage;
    if (stage === 'dev') {
      this.serverless.cli.log('[prod-config] Stage is dev — skipping VPC/IAM/Layer config');
      return;
    }

    const sgId = process.env.LAMBDA_SG_ID;
    const subnetIds = process.env.PRIVATE_SUBNET_IDS;
    const roleArn = process.env.LAMBDA_ROLE_ARN;
    const layerArn = process.env.SHARED_LAYER_ARN;

    // Apply VPC config
    if (sgId && subnetIds) {
      this.serverless.service.provider.vpc = {
        securityGroupIds: [sgId],
        subnetIds: subnetIds.split(','),
      };
      this.serverless.cli.log(`[prod-config] VPC configured with SG ${sgId}`);
    }

    // Apply IAM role
    if (roleArn) {
      if (!this.serverless.service.provider.iam) {
        this.serverless.service.provider.iam = {};
      }
      this.serverless.service.provider.iam.role = roleArn;
      this.serverless.cli.log(`[prod-config] IAM role set to ${roleArn}`);
    }

    // Apply Lambda Layer to all functions
    if (layerArn) {
      const functions = this.serverless.service.functions;
      for (const [name, func] of Object.entries(functions)) {
        if (!func.layers) {
          func.layers = [];
        }
        func.layers.push(layerArn);
        this.serverless.cli.log(`[prod-config] Layer added to function ${name}`);
      }
    }
  }
}

module.exports = ServerlessProdConfig;
