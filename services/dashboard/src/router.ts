import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { AppError } from '@timetable/shared';
import { DashboardController } from './controller';

const controller = new DashboardController();

export async function route(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const rawPath = event.rawPath;
  const path = rawPath.startsWith('/api/') ? rawPath : `/api${rawPath}`;

  if (method === 'GET' && path === '/api/dashboard/health') {
    return controller.health();
  }

  if (method === 'GET' && path === '/api/dashboard/stats') {
    return controller.getStats(event);
  }

  if (method === 'GET' && path === '/api/dashboard/recent-activity') {
    return controller.getRecentActivity(event);
  }

  if (method === 'GET' && path === '/api/dashboard/setup-wizard') {
    return controller.getSetupWizard(event);
  }

  if (method === 'PUT' && path === '/api/dashboard/setup-wizard/dismiss') {
    return controller.dismissSetupWizard(event);
  }

  throw new AppError(`Route not found: ${method} ${path}`, 404, 'ROUTE_NOT_FOUND');
}
