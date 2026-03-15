import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { AppError } from '@timetable/shared';
import { SubjectController } from './controller';

const controller = new SubjectController();

export async function route(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  if (method === 'GET' && path === '/subjects/health') {
    return controller.health();
  }

  const idMatch = path.match(/^\/subjects\/([^/]+)$/);

  if (method === 'POST' && path === '/subjects') {
    return controller.create(event);
  }
  if (method === 'GET' && path === '/subjects') {
    return controller.list(event);
  }
  if (method === 'GET' && idMatch) {
    return controller.getById(event, idMatch[1]);
  }
  if (method === 'PUT' && idMatch) {
    return controller.update(event, idMatch[1]);
  }
  if (method === 'DELETE' && idMatch) {
    return controller.delete(event, idMatch[1]);
  }

  throw new AppError(`Route not found: ${method} ${path}`, 404, 'ROUTE_NOT_FOUND');
}
