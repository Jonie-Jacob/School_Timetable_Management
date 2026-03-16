import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { AppError } from '@timetable/shared';
import { TeacherController } from './controller';

const controller = new TeacherController();

export async function route(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  if (method === 'GET' && path === '/teachers/health') {
    return controller.health();
  }

  // Nested routes: /teachers/:id/subjects, /teachers/:id/availability
  const subjectsMatch = path.match(/^\/teachers\/([^/]+)\/subjects$/);
  if (method === 'PUT' && subjectsMatch) {
    return controller.setSubjects(event, subjectsMatch[1]);
  }

  const availabilityMatch = path.match(/^\/teachers\/([^/]+)\/availability$/);
  if (method === 'PUT' && availabilityMatch) {
    return controller.setAvailability(event, availabilityMatch[1]);
  }

  // Base routes: /teachers, /teachers/:id
  const idMatch = path.match(/^\/teachers\/([^/]+)$/);

  if (method === 'POST' && path === '/teachers') {
    return controller.create(event);
  }
  if (method === 'GET' && path === '/teachers') {
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
