import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, created, authMiddleware, parseBody } from '@timetable/shared';
import { WebSocketService } from './service';
import { z } from 'zod';

const connectSchema = z.object({
  connectionId: z.string().min(1).optional(),
});

const disconnectSchema = z.object({
  connectionId: z.string().min(1),
});

const broadcastSchema = z.object({
  schoolId: z.string().uuid().optional(),
  type: z.string().min(1),
  payload: z.record(z.unknown()),
});

const service = new WebSocketService();

export class WebSocketController {

  async health(): Promise<APIGatewayProxyResultV2> {
    return success({ status: 'ok', service: 'websocket' });
  }

  /**
   * Simulate WebSocket $connect.
   * In production, this is handled by API Gateway WebSocket $connect route.
   * Here we accept an HTTP POST with auth headers and register a connection.
   */
  async connect(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const body = parseBody(event, connectSchema);
    // Generate a mock connectionId if not provided
    const connectionId = body.connectionId || `conn-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const result = await service.connect(connectionId, auth.schoolId!, auth.userId!);
    return created(result);
  }

  /**
   * Simulate WebSocket $disconnect.
   * In production, this is handled by API Gateway WebSocket $disconnect route.
   */
  async disconnect(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const body = parseBody(event, disconnectSchema);
    await service.disconnect(body.connectionId);
    return success({ message: 'Disconnected', connectionId: body.connectionId });
  }

  /**
   * Broadcast a message to all connections for a school.
   * If schoolId is provided in body, uses that; otherwise uses the auth school.
   */
  async broadcast(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const body = parseBody(event, broadcastSchema);
    const schoolId = body.schoolId || auth.schoolId!;
    const result = await service.broadcastToSchool(schoolId, {
      type: body.type,
      payload: body.payload,
    });
    return success(result);
  }

  /**
   * List active connections (debug/admin endpoint).
   */
  async listConnections(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const connections = await service.getSchoolConnections(auth.schoolId!);
    return success({ connections, count: connections.length });
  }
}
