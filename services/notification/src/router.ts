import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { AppError } from '@timetable/shared';
import { NotificationController } from './controller';

const controller = new NotificationController();

export async function route(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  if (method === 'GET' && path === '/notifications/health') {
    return controller.health();
  }

  if (method === 'GET' && path === '/notifications/count') {
    return controller.count(event);
  }

  if (method === 'PUT' && path === '/notifications/dismiss-all') {
    return controller.dismissAll(event);
  }

  const idDismissMatch = path.match(/^\/notifications\/([^/]+)\/dismiss$/);

  if (method === 'PUT' && idDismissMatch) {
    return controller.dismiss(event, idDismissMatch[1]);
  }

  if (method === 'GET' && path === '/notifications') {
    return controller.list(event);
  }

  throw new AppError(`Route not found: ${method} ${path}`, 404, 'ROUTE_NOT_FOUND');
}
