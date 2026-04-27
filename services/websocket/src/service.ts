/**
 * WebSocket Connection Management Service.
 *
 * In PRODUCTION (STAGE !== 'dev'): Uses DynamoDB for connection storage and
 * API Gateway Management API to push messages to connected browsers.
 *
 * In LOCAL DEV (STAGE === 'dev'): Uses an in-memory Map. Broadcasts are
 * logged to console.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';

export interface ConnectionRecord {
  connectionId: string;
  schoolId: string;
  userId: string;
  connectedAt: string;
  ttl: number;
}

export interface BroadcastMessage {
  type: string;
  payload: Record<string, unknown>;
}

const STAGE = process.env.STAGE ?? 'dev';
const IS_PROD = STAGE !== 'dev';
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE ?? 'WebSocketConnections';
const API_GATEWAY_ENDPOINT = process.env.API_GATEWAY_ENDPOINT ?? '';

// In-memory connection store for local development
const localConnections = new Map<string, ConnectionRecord>();

const TTL_HOURS = 24;

// AWS clients (initialized lazily for prod)
let dynamoClient: DynamoDBDocumentClient | null = null;
let apigwClient: ApiGatewayManagementApiClient | null = null;

function getDynamo(): DynamoDBDocumentClient {
  if (!dynamoClient) {
    const client = new DynamoDBClient({ region: 'ap-south-1' });
    dynamoClient = DynamoDBDocumentClient.from(client);
  }
  return dynamoClient;
}

function getApigw(): ApiGatewayManagementApiClient | null {
  if (!API_GATEWAY_ENDPOINT) return null;
  if (!apigwClient) {
    apigwClient = new ApiGatewayManagementApiClient({
      region: 'ap-south-1',
      endpoint: API_GATEWAY_ENDPOINT,
    });
  }
  return apigwClient;
}

export class WebSocketService {

  async connect(connectionId: string, schoolId: string, userId: string): Promise<ConnectionRecord> {
    const now = new Date();
    const ttl = Math.floor(now.getTime() / 1000) + TTL_HOURS * 3600;

    const record: ConnectionRecord = {
      connectionId,
      schoolId,
      userId,
      connectedAt: now.toISOString(),
      ttl,
    };

    if (IS_PROD) {
      await getDynamo().send(new PutCommand({
        TableName: CONNECTIONS_TABLE,
        Item: record,
      }));
    } else {
      localConnections.set(connectionId, record);
    }

    return record;
  }

  async disconnect(connectionId: string): Promise<void> {
    if (IS_PROD) {
      await getDynamo().send(new DeleteCommand({
        TableName: CONNECTIONS_TABLE,
        Key: { connectionId },
      }));
    } else {
      localConnections.delete(connectionId);
    }
  }

  async getSchoolConnections(schoolId: string): Promise<ConnectionRecord[]> {
    if (IS_PROD) {
      const result = await getDynamo().send(new QueryCommand({
        TableName: CONNECTIONS_TABLE,
        IndexName: 'schoolId-index',
        KeyConditionExpression: 'schoolId = :sid',
        ExpressionAttributeValues: { ':sid': schoolId },
      }));
      return (result.Items ?? []) as ConnectionRecord[];
    }

    // Local dev: filter in-memory
    const result: ConnectionRecord[] = [];
    const now = Math.floor(Date.now() / 1000);
    for (const [id, record] of localConnections) {
      if (record.ttl < now) {
        localConnections.delete(id);
        continue;
      }
      if (record.schoolId === schoolId) {
        result.push(record);
      }
    }
    return result;
  }

  async broadcastToSchool(schoolId: string, message: BroadcastMessage): Promise<{
    schoolId: string;
    message: BroadcastMessage;
    connectionCount: number;
    connections: string[];
    delivered: string[];
    failed: string[];
  }> {
    const schoolConns = await this.getSchoolConnections(schoolId);

    const delivered: string[] = [];
    const failed: string[] = [];
    const messageStr = JSON.stringify(message);

    const client = IS_PROD ? getApigw() : null;

    for (const conn of schoolConns) {
      try {
        if (IS_PROD && client) {
          await client.send(new PostToConnectionCommand({
            ConnectionId: conn.connectionId,
            Data: Buffer.from(messageStr),
          }));
        } else {
          console.log(
            `[WS] Broadcasting to ${conn.connectionId} (school: ${schoolId}):`,
            messageStr.substring(0, 200),
          );
        }
        delivered.push(conn.connectionId);
      } catch (err: unknown) {
        const statusCode = (err as { $metadata?: { httpStatusCode?: number } })
          ?.$metadata?.httpStatusCode;
        if (statusCode === 410) {
          // Stale connection -- remove from DynamoDB
          await this.disconnect(conn.connectionId);
        }
        failed.push(conn.connectionId);
      }
    }

    return {
      schoolId,
      message,
      connectionCount: schoolConns.length,
      connections: schoolConns.map(c => c.connectionId),
      delivered,
      failed,
    };
  }
}
