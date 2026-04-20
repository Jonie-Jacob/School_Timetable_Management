import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { AppError } from '@timetable/shared';
import { TeacherController } from './controller';

const controller = new TeacherController();

export async function route(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const rawPath = event.rawPath;
  const path = rawPath.startsWith('/api/') ? rawPath : `/api${rawPath}`;

  if (method === 'GET' && path === '/api/teachers/health') {
    return controller.health();
  }

  // Aggregate endpoints that must come BEFORE the /teachers/:id match so
  // "load" and "conflicts" aren't swallowed by the :id wildcard.
  if (method === 'GET' && path === '/api/teachers/load') {
    return controller.listLoad(event);
  }
  if (method === 'GET' && path === '/api/teachers/conflicts') {
    return controller.getSlotConflicts(event);
  }

  // Nested routes: /teachers/:id/subjects, /teachers/:id/availability
  const subjectsMatch = path.match(/^\/api\/teachers\/([^/]+)\/subjects$/);
  if (method === 'PUT' && subjectsMatch) {
    return controller.setSubjects(event, subjectsMatch[1]);
  }

  const availabilityMatch = path.match(/^\/api\/teachers\/([^/]+)\/availability$/);
  if (method === 'PUT' && availabilityMatch) {
    return controller.setAvailability(event, availabilityMatch[1]);
  }

  const breakdownMatch = path.match(/^\/api\/teachers\/([^/]+)\/breakdown$/);
  if (method === 'GET' && breakdownMatch) {
    event.pathParameters = { ...event.pathParameters, id: breakdownMatch[1] };
    return controller.getBreakdown(event);
  }

  // Base routes: /teachers, /teachers/:id
  const idMatch = path.match(/^\/api\/teachers\/([^/]+)$/);

  if (method === 'POST' && path === '/api/teachers') {
    return controller.create(event);
  }
  if (method === 'GET' && path === '/api/teachers') {
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
