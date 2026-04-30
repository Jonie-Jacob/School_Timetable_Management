import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const STAGE = process.env.STAGE ?? 'dev';
const DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT;
const AUDIT_TABLE_NAME = process.env.AUDIT_TABLE_NAME ?? `timetable-audit-logs-${STAGE}`;
const AWS_REGION = process.env.AWS_REGION ?? 'ap-south-1';

let docClient: DynamoDBDocumentClient | null = null;

function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    const ddbClient = new DynamoDBClient({
      region: AWS_REGION,
      ...(DYNAMODB_ENDPOINT ? { endpoint: DYNAMODB_ENDPOINT } : {}),
    });
    docClient = DynamoDBDocumentClient.from(ddbClient, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return docClient;
}

/**
 * Audit log entry written to DynamoDB.
 */
export interface AuditLogEntry {
  schoolId: string;
  entityType: string;
  entityId: string;
  action: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  userId: string;
  userEmail: string;
  userRole: string;
  ipAddress: string;
  timestamp: string;
  academicYearId: string;
  divisionId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Write an audit log entry to DynamoDB. Fire-and-forget -- catches errors
 * silently and logs to CloudWatch. Never blocks the calling API response.
 *
 * DynamoDB table: timetable-audit-logs-{stage}
 * PK: schoolId
 * SK: timestamp#entityType#entityId
 * GSI1: entityType (PK), timestamp (SK)
 * GSI2: userId (PK), timestamp (SK)
 * GSI3: divisionId (PK), timestamp (SK)
 *
 * Called from every service's CRUD methods after data changes.
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const client = getDocClient();
    const timestamp = entry.timestamp || new Date().toISOString();
    const sk = `${timestamp}#${entry.entityType}#${entry.entityId}`;

    await client.send(new PutCommand({
      TableName: AUDIT_TABLE_NAME,
      Item: {
        schoolId: entry.schoolId,
        sk,
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        changes: entry.changes,
        userId: entry.userId,
        userEmail: entry.userEmail,
        userRole: entry.userRole,
        ipAddress: entry.ipAddress,
        timestamp,
        academicYearId: entry.academicYearId,
        divisionId: entry.divisionId,
        metadata: entry.metadata,
        // TTL: keep audit logs for 2 years
        ttl: Math.floor(Date.now() / 1000) + 63072000,
      },
    }));
  } catch (err) {
    // Fire-and-forget: log error but don't throw
    console.error('[audit-log] Failed to write audit log:', err);
  }
}

/**
 * Compute a diff between old and new objects for the `changes` field.
 * Only includes fields that actually changed.
 * Returns undefined if nothing changed (useful for skipping empty audits).
 */
export function computeChanges(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  fields: string[],
): Record<string, { old: unknown; new: unknown }> | undefined {
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  let hasChanges = false;

  for (const field of fields) {
    const oldVal = oldObj[field];
    const newVal = newObj[field];
    if (newVal !== undefined && JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[field] = { old: oldVal, new: newVal };
      hasChanges = true;
    }
  }

  return hasChanges ? changes : undefined;
}
