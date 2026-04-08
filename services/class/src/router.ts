import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { AppError } from '@timetable/shared';
import { ClassController } from './controller';

const controller = new ClassController();

export async function route(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  // Normalize: ensure path always starts with /api/ (Vite proxy strips it locally)
  const rawPath = event.rawPath;
  const path = rawPath.startsWith('/api/') ? rawPath : `/api${rawPath}`;

  // Health check
  if (method === 'GET' && path === '/api/classes/health') {
    return controller.health();
  }

  // Class teacher analyze: /api/classes/:classId/divisions/:divisionId/class-teacher-analyze
  const classTeacherAnalyzeMatch = path.match(/^\/api\/classes\/([^/]+)\/divisions\/([^/]+)\/class-teacher-analyze$/);
  if (method === 'POST' && classTeacherAnalyzeMatch) {
    return controller.analyzeClassTeacher(event, classTeacherAnalyzeMatch[1], classTeacherAnalyzeMatch[2]);
  }

  // Class teacher swap: /api/classes/:classId/divisions/:divisionId/class-teacher-swap
  const classTeacherSwapMatch = path.match(/^\/api\/classes\/([^/]+)\/divisions\/([^/]+)\/class-teacher-swap$/);
  if (method === 'POST' && classTeacherSwapMatch) {
    return controller.executeClassTeacherSwap(event, classTeacherSwapMatch[1], classTeacherSwapMatch[2]);
  }

  // Class teacher routes: /api/classes/:classId/divisions/:divisionId/class-teacher
  const classTeacherMatch = path.match(/^\/api\/classes\/([^/]+)\/divisions\/([^/]+)\/class-teacher$/);
  if (classTeacherMatch) {
    if (method === 'PUT') return controller.setClassTeacher(event, classTeacherMatch[1], classTeacherMatch[2]);
    if (method === 'DELETE') return controller.removeClassTeacher(event, classTeacherMatch[1], classTeacherMatch[2]);
  }

  // Bulk class teacher: PUT /api/classes/bulk-class-teacher
  if (method === 'PUT' && path === '/api/classes/bulk-class-teacher') {
    return controller.bulkSetClassTeacher(event);
  }

  // Division routes: /api/classes/:classId/divisions/:divisionId
  const divisionIdMatch = path.match(/^\/api\/classes\/([^/]+)\/divisions\/([^/]+)$/);
  if (divisionIdMatch) {
    if (method === 'PUT') return controller.updateDivision(event, divisionIdMatch[1], divisionIdMatch[2]);
    if (method === 'DELETE') return controller.deleteDivision(event, divisionIdMatch[1], divisionIdMatch[2]);
  }

  // Division routes: /api/classes/:id/divisions
  const divisionsMatch = path.match(/^\/api\/classes\/([^/]+)\/divisions$/);
  if (method === 'POST' && divisionsMatch) {
    return controller.addDivision(event, divisionsMatch[1]);
  }

  // Batch update sort order: PUT /api/classes/sort-order
  if (method === 'PUT' && path === '/api/classes/sort-order') {
    return controller.updateSortOrder(event);
  }

  // Class routes: /api/classes/:id
  const idMatch = path.match(/^\/api\/classes\/([^/]+)$/);

  if (method === 'POST' && path === '/api/classes') {
    return controller.create(event);
  }
  if (method === 'GET' && path === '/api/classes') {
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
