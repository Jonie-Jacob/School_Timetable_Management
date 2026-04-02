import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { AppError } from '@timetable/shared';
import { ClassController } from './controller';

const controller = new ClassController();

export async function route(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  // Health check
  if (method === 'GET' && path === '/classes/health') {
    return controller.health();
  }

  // Division routes: /classes/:classId/divisions/:divisionId
  const divisionIdMatch = path.match(/^\/classes\/([^/]+)\/divisions\/([^/]+)$/);
  if (divisionIdMatch) {
    if (method === 'PUT') return controller.updateDivision(event, divisionIdMatch[1], divisionIdMatch[2]);
    if (method === 'DELETE') return controller.deleteDivision(event, divisionIdMatch[1], divisionIdMatch[2]);
  }

  // Division routes: /classes/:id/divisions
  const divisionsMatch = path.match(/^\/classes\/([^/]+)\/divisions$/);
  if (method === 'POST' && divisionsMatch) {
    return controller.addDivision(event, divisionsMatch[1]);
  }

  // Batch update sort order: PUT /classes/sort-order
  if (method === 'PUT' && path === '/classes/sort-order') {
    return controller.updateSortOrder(event);
  }

  // Class routes: /classes/:id
  const idMatch = path.match(/^\/classes\/([^/]+)$/);

  if (method === 'POST' && path === '/classes') {
    return controller.create(event);
  }
  if (method === 'GET' && path === '/classes') {
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
