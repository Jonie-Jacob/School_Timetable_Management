import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { AppError } from '@timetable/shared';
import { DashboardController } from './controller';

const controller = new DashboardController();

export async function route(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  if (method === 'GET' && path === '/dashboard/health') {
    return controller.health();
  }

  if (method === 'GET' && path === '/dashboard/stats') {
    return controller.getStats(event);
  }

  if (method === 'GET' && path === '/dashboard/recent-activity') {
    return controller.getRecentActivity(event);
  }

  throw new AppError(`Route not found: ${method} ${path}`, 404, 'ROUTE_NOT_FOUND');
}
