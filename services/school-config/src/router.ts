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
    return controller.assignToDivisions(event, assignMatch[1]);
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

  // --- Working Days (nested under period structures) ---

  // PUT /config/period-structures/:id/working-days
  const workingDaysPutMatch = path.match(/^\/config\/period-structures\/([^/]+)\/working-days$/);
  if (method === 'PUT' && workingDaysPutMatch) {
    return controller.setWorkingDays(event, workingDaysPutMatch[1]);
  }

  // GET /config/period-structures/:id/working-days
  const workingDaysGetMatch = path.match(/^\/config\/period-structures\/([^/]+)\/working-days$/);
  if (method === 'GET' && workingDaysGetMatch) {
    return controller.getWorkingDays(event, workingDaysGetMatch[1]);
  }

  // --- Slots (nested under period structures) ---

  // POST /config/period-structures/:id/days/:dayId/copy-from/:sourceDayId
  const copyDaySlotsMatch = path.match(/^\/config\/period-structures\/([^/]+)\/days\/([^/]+)\/copy-from\/([^/]+)$/);
  if (method === 'POST' && copyDaySlotsMatch) {
    return controller.copyDaySlots(event, copyDaySlotsMatch[1], copyDaySlotsMatch[2], copyDaySlotsMatch[3]);
  }

  // PUT /config/period-structures/:id/days/:dayId/slots/reorder
  const reorderSlotsMatch = path.match(/^\/config\/period-structures\/([^/]+)\/days\/([^/]+)\/slots\/reorder$/);
  if (method === 'PUT' && reorderSlotsMatch) {
    return controller.reorderSlots(event, reorderSlotsMatch[1], reorderSlotsMatch[2]);
  }

  // PUT /config/period-structures/:id/days/:dayId/slots/:slotId
  const updateSlotMatch = path.match(/^\/config\/period-structures\/([^/]+)\/days\/([^/]+)\/slots\/([^/]+)$/);
  if (method === 'PUT' && updateSlotMatch) {
    return controller.updateSlot(event, updateSlotMatch[1], updateSlotMatch[2], updateSlotMatch[3]);
  }

  // DELETE /config/period-structures/:id/days/:dayId/slots/:slotId
  const deleteSlotMatch = path.match(/^\/config\/period-structures\/([^/]+)\/days\/([^/]+)\/slots\/([^/]+)$/);
  if (method === 'DELETE' && deleteSlotMatch) {
    return controller.deleteSlot(event, deleteSlotMatch[1], deleteSlotMatch[2], deleteSlotMatch[3]);
  }

  // POST /config/period-structures/:id/days/:dayId/slots
  const addSlotMatch = path.match(/^\/config\/period-structures\/([^/]+)\/days\/([^/]+)\/slots$/);
  if (method === 'POST' && addSlotMatch) {
    return controller.addSlot(event, addSlotMatch[1], addSlotMatch[2]);
  }

  // POST /config/period-structures/:id/slots/generate
  const generateSlotsMatch = path.match(/^\/config\/period-structures\/([^/]+)\/slots\/generate$/);
  if (method === 'POST' && generateSlotsMatch) {
    return controller.generateSlots(event, generateSlotsMatch[1]);
  }

  // GET /config/period-structures/:id/slots
  const getSlotsMatch = path.match(/^\/config\/period-structures\/([^/]+)\/slots$/);
  if (method === 'GET' && getSlotsMatch) {
    return controller.getSlots(event, getSlotsMatch[1]);
  }

  // POST /config/period-structures/:id/reset
  const resetMatch = path.match(/^\/config\/period-structures\/([^/]+)\/reset$/);
  if (method === 'POST' && resetMatch) {
    return controller.resetToDefault(event, resetMatch[1]);
  }

  throw new AppError(`Route not found: ${method} ${path}`, 404, 'ROUTE_NOT_FOUND');
}
