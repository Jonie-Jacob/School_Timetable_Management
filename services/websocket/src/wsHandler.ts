/**
 * API Gateway WebSocket protocol handler.
 *
 * Handles $connect, $disconnect, and $default routes from the API Gateway
 * WebSocket API. Browser clients connect via wss:// and this handler
 * manages the connection lifecycle in DynamoDB.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { WebSocketService } from './service';

const service = new WebSocketService();

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const routeKey = event.requestContext.routeKey;
  const connectionId = event.requestContext.connectionId;

  if (!connectionId) {
    return { statusCode: 400, body: 'Missing connectionId' };
  }

  try {
    switch (routeKey) {
      case '$connect': {
        // Extract schoolId and token from query params
        const schoolId = event.queryStringParameters?.schoolId ?? '';
        const token = event.queryStringParameters?.token ?? '';

        if (!schoolId) {
          console.warn(`[WS $connect] Missing schoolId, connectionId=${connectionId}`);
          return { statusCode: 400, body: 'Missing schoolId query parameter' };
        }

        // Extract userId from JWT token (simple decode, not full validation —
        // API Gateway authorizer handles real auth if configured)
        let userId = 'unknown';
        if (token) {
          try {
            const payload = JSON.parse(
              Buffer.from(token.split('.')[1] ?? '', 'base64').toString(),
            );
            userId = payload.email ?? payload.sub ?? 'unknown';
          } catch {
            // Token decode failed — still allow connection
          }
        }

        await service.connect(connectionId, schoolId, userId);
        console.log(`[WS $connect] connectionId=${connectionId} schoolId=${schoolId} userId=${userId}`);
        return { statusCode: 200, body: 'Connected' };
      }

      case '$disconnect': {
        await service.disconnect(connectionId);
        console.log(`[WS $disconnect] connectionId=${connectionId}`);
        return { statusCode: 200, body: 'Disconnected' };
      }

      case '$default': {
        // Client-to-server messages — not used for generation progress
        // but could be extended for future features
        console.log(`[WS $default] connectionId=${connectionId} body=${event.body}`);
        return { statusCode: 200, body: 'OK' };
      }

      default: {
        console.warn(`[WS] Unknown route: ${routeKey}`);
        return { statusCode: 400, body: `Unknown route: ${routeKey}` };
      }
    }
  } catch (err) {
    console.error(`[WS ${routeKey}] Error:`, err);
    return { statusCode: 500, body: 'Internal error' };
  }
}
