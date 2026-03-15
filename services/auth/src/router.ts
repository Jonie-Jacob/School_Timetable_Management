import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { AppError } from '@timetable/shared';
import { AuthController } from './controller';

const controller = new AuthController();

export async function route(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  if (method === 'GET' && path === '/auth/health') {
    return controller.health();
  }

  if (method === 'POST' && path === '/auth/register') {
    return controller.register(event);
  }

  if (method === 'POST' && path === '/auth/login') {
    return controller.login(event);
  }

  if (method === 'GET' && path === '/auth/me') {
    return controller.me(event);
  }

  throw new AppError(`Route not found: ${method} ${path}`, 404, 'ROUTE_NOT_FOUND');
}
