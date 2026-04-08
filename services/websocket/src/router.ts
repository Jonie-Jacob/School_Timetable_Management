import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { WebSocketController } from './controller';

const controller = new WebSocketController();

export async function route(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  if (method === 'GET' && path === '/api/ws/health') {
    return controller.health();
  }

  // Simulate WebSocket $connect
  if (method === 'POST' && path === '/api/ws/connect') {
    return controller.connect(event);
  }

  // Simulate WebSocket $disconnect
  if (method === 'POST' && path === '/api/ws/disconnect') {
    return controller.disconnect(event);
  }

  // Broadcast message to all connections for a school
  if (method === 'POST' && path === '/api/ws/broadcast') {
    return controller.broadcast(event);
  }

  // List active connections (debug/admin)
  if (method === 'GET' && path === '/api/ws/connections') {
    return controller.listConnections(event);
  }

  return {
    statusCode: 404,
    body: JSON.stringify({ error: { code: 'NOT_FOUND', message: `Route not found: ${method} ${path}` } }),
  };
}
