import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { AppError } from '@timetable/shared';
import { SchoolConfigController } from './controller';

const controller = new SchoolConfigController();

export async function route(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  // Health check
  if (method === 'GET' && path === '/config/health') {
    return controller.health();
  }

  // --- Period Structures ---

  // POST /config/period-structures/:id/assign
  const assignMatch = path.match(/^\/config\/period-structures\/([^/]+)\/assign$/);
  if (method === 'POST' && assignMatch) {
    return controller.assignToClasses(event, assignMatch[1]);
  }

  // Match /config/period-structures/:id
  const psIdMatch = path.match(/^\/config\/period-structures\/([^/]+)$/);

  if (method === 'POST' && path === '/config/period-structures') {
    return controller.createPeriodStructure(event);
  }

  if (method === 'GET' && path === '/config/period-structures') {
    return controller.listPeriodStructures(event);
  }

  if (method === 'GET' && psIdMatch) {
    return controller.getPeriodStructure(event, psIdMatch[1]);
  }

  if (method === 'PUT' && psIdMatch) {
    return controller.updatePeriodStructure(event, psIdMatch[1]);
  }

  if (method === 'DELETE' && psIdMatch) {
    return controller.deletePeriodStructure(event, psIdMatch[1]);
  }

  // --- Working Days ---

  if (method === 'PUT' && path === '/config/working-days') {
    return controller.setWorkingDays(event);
  }

  if (method === 'GET' && path === '/config/working-days') {
    return controller.getWorkingDays(event);
  }

  // --- Slots ---

  if (method === 'POST' && path === '/config/slots/generate') {
    return controller.generateSlots(event);
  }

  if (method === 'GET' && path === '/config/slots') {
    return controller.getSlots(event);
  }

  throw new AppError(`Route not found: ${method} ${path}`, 404, 'ROUTE_NOT_FOUND');
}
