import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { AppError } from '@timetable/shared';
import { TimetableController } from './controller';

const controller = new TimetableController();

export async function route(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const rawPath = event.rawPath;
  const path = rawPath.startsWith('/api/') ? rawPath : `/api${rawPath}`;

  // Health check
  if (method === 'GET' && path === '/api/timetables/health') {
    return controller.health();
  }

  // Trigger generation: POST /timetables/generate
  if (method === 'POST' && path === '/api/timetables/generate') {
    return controller.triggerGeneration(event);
  }

  // Get active generation: GET /timetables/generate/active
  if (method === 'GET' && path === '/api/timetables/generate/active') {
    return controller.getActiveGeneration(event);
  }

  // Get generation status: GET /timetables/generate/status/:jobId
  const statusMatch = path.match(/^\/api\/timetables\/generate\/status\/([^/]+)$/);
  if (method === 'GET' && statusMatch) {
    return controller.getGenerationStatus(event, statusMatch[1]);
  }

  // Get division timetable: GET /timetables/divisions/:divisionId
  const divisionMatch = path.match(/^\/api\/timetables\/divisions\/([^/]+)$/);
  if (method === 'GET' && divisionMatch) {
    return controller.getDivisionTimetable(event, divisionMatch[1]);
  }

  // Get teacher timetable: GET /timetables/teacher/:teacherId
  const teacherMatch = path.match(/^\/api\/timetables\/teacher\/([^/]+)$/);
  if (method === 'GET' && teacherMatch) {
    return controller.getTeacherTimetable(event, teacherMatch[1]);
  }

  // Valid swap targets: GET /timetables/slots/:slotId/valid-swaps
  const validSwapsMatch = path.match(/^\/api\/timetables\/slots\/([^/]+)\/valid-swaps$/);
  if (method === 'GET' && validSwapsMatch) {
    event.pathParameters = { ...event.pathParameters, slotId: validSwapsMatch[1] };
    return controller.getValidSwapTargets(event);
  }

  // Swap slots: POST /timetables/slots/swap
  if (method === 'POST' && path === '/api/timetables/slots/swap') {
    return controller.swapSlots(event);
  }

  // Swap elective slots: POST /timetables/slots/swap-elective
  if (method === 'POST' && path === '/api/timetables/slots/swap-elective') {
    return controller.swapElectiveSlots(event);
  }

  // Preview elective swap: POST /timetables/slots/preview-elective-swap
  if (method === 'POST' && path === '/api/timetables/slots/preview-elective-swap') {
    return controller.previewElectiveSwap(event);
  }

  // Valid elective swap targets: GET /timetables/slots/:slotId/valid-elective-swaps
  const validElectiveSwapsMatch = path.match(/^\/api\/timetables\/slots\/([^/]+)\/valid-elective-swaps$/);
  if (method === 'GET' && validElectiveSwapsMatch) {
    event.pathParameters = { ...event.pathParameters, slotId: validElectiveSwapsMatch[1] };
    return controller.getValidElectiveSwapTargets(event);
  }

  // Auto-resolve conflict: POST /timetables/slots/auto-resolve
  if (method === 'POST' && path === '/api/timetables/slots/auto-resolve') {
    return controller.autoResolve(event);
  }

  // Create empty slot: POST /timetables/slots/create-empty
  if (method === 'POST' && path === '/api/timetables/slots/create-empty') {
    return controller.createEmptySlot(event);
  }

  // Override slot: PUT /timetables/slots/:slotId
  const slotMatch = path.match(/^\/api\/timetables\/slots\/([^/]+)$/);
  if (method === 'PUT' && slotMatch) {
    return controller.overrideSlot(event, slotMatch[1]);
  }

  // Get conflicts: GET /timetables/:id/conflicts
  const conflictsMatch = path.match(/^\/api\/timetables\/([^/]+)\/conflicts$/);
  if (method === 'GET' && conflictsMatch) {
    return controller.getConflicts(event, conflictsMatch[1]);
  }

  throw new AppError(`Route not found: ${method} ${path}`, 404, 'ROUTE_NOT_FOUND');
}
