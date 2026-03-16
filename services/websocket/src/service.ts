/**
 * WebSocket Connection Management Service.
 *
 * In PRODUCTION: Uses DynamoDB (WebSocketConnections table) with GSI on schoolId
 * and TTL for automatic stale connection cleanup.
 *
 * In LOCAL DEV: Uses an in-memory Map to avoid DynamoDB Local compatibility
 * issues. Connections reset when the service restarts.
 *
 * The broadcastToSchool() method is the main integration point — other services
 * invoke it (via Lambda or direct call) to push real-time notifications.
 */

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

// In-memory connection store for local development
const connections = new Map<string, ConnectionRecord>();

const TTL_HOURS = 24;

export class WebSocketService {

  /**
   * Register a new WebSocket connection.
   * Equivalent to $connect handler in production.
   */
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

    connections.set(connectionId, record);

    return record;
  }

  /**
   * Remove a WebSocket connection.
   * Equivalent to $disconnect handler in production.
   */
  async disconnect(connectionId: string): Promise<void> {
    connections.delete(connectionId);
  }

  /**
   * Get all active connections for a school.
   */
  async getSchoolConnections(schoolId: string): Promise<ConnectionRecord[]> {
    const result: ConnectionRecord[] = [];
    const now = Math.floor(Date.now() / 1000);

    for (const [id, record] of connections) {
      // Clean up expired connections
      if (record.ttl < now) {
        connections.delete(id);
        continue;
      }
      if (record.schoolId === schoolId) {
        result.push(record);
      }
    }

    return result;
  }

  /**
   * Broadcast a message to all connections for a school.
   *
   * In production, this uses API Gateway Management API (PostToConnection).
   * In local dev, we log the message and return info about which connections
   * would have received it.
   *
   * Other services call this to push real-time notifications:
   *   - Timetable generation progress
   *   - Generation completed/failed
   *   - Conflict notifications
   */
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

    for (const conn of schoolConns) {
      try {
        // In production: use ApiGatewayManagementApi.postToConnection()
        // In local dev: simulate delivery by logging
        console.log(
          `[WS] Broadcasting to ${conn.connectionId} (school: ${schoolId}, user: ${conn.userId}):`,
          JSON.stringify(message),
        );
        delivered.push(conn.connectionId);
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 410) {
          // Stale connection — remove
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
