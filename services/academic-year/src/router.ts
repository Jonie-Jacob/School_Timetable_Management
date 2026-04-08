import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { AppError } from '@timetable/shared';
import { AcademicYearController } from './controller';

const controller = new AcademicYearController();

export async function route(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const rawPath = event.rawPath;
  const path = rawPath.startsWith('/api/') ? rawPath : `/api${rawPath}`;

  if (method === 'GET' && path === '/api/academic-years/health') {
    return controller.health();
  }

  // Match /academic-years/:id/activate
  const activateMatch = path.match(/^\/api\/academic-years\/([^/]+)\/activate$/);
  if (method === 'PATCH' && activateMatch) {
    return controller.activate(event, activateMatch[1]);
  }

  // Match /academic-years/:id
  const idMatch = path.match(/^\/api\/academic-years\/([^/]+)$/);

  if (method === 'POST' && path === '/api/academic-years') {
    return controller.create(event);
  }

  if (method === 'GET' && path === '/api/academic-years') {
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
