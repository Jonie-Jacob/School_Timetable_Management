import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ExportController } from './controller';

const controller = new ExportController();

export async function route(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const rawPath = event.rawPath;
  const path = rawPath.startsWith('/api/') ? rawPath : `/api${rawPath}`;

  // Health
  if (method === 'GET' && path === '/api/export/health') {
    return controller.health();
  }

  // Division exports
  if (method === 'POST' && path === '/api/export/division/pdf') {
    return controller.exportDivisionPdf(event);
  }
  if (method === 'POST' && path === '/api/export/division/excel') {
    return controller.exportDivisionExcel(event);
  }

  // Class exports (all divisions in a class)
  if (method === 'POST' && path === '/api/export/class/pdf') {
    return controller.exportClassPdf(event);
  }
  if (method === 'POST' && path === '/api/export/class/excel') {
    return controller.exportClassExcel(event);
  }

  // Teacher exports (single)
  if (method === 'POST' && path === '/api/export/teacher/pdf') {
    return controller.exportTeacherPdf(event);
  }
  if (method === 'POST' && path === '/api/export/teacher/excel') {
    return controller.exportTeacherExcel(event);
  }

  // Multi-class exports
  if (method === 'POST' && path === '/api/export/classes/pdf') {
    return controller.exportClassesPdf(event);
  }
  if (method === 'POST' && path === '/api/export/classes/excel') {
    return controller.exportClassesExcel(event);
  }

  // Multi-teacher exports (selected or all)
  if (method === 'POST' && path === '/api/export/teachers/pdf') {
    return controller.exportTeachersPdf(event);
  }
  if (method === 'POST' && path === '/api/export/teachers/excel') {
    return controller.exportTeachersExcel(event);
  }

  return {
    statusCode: 404,
    body: JSON.stringify({ error: { code: 'NOT_FOUND', message: `Route not found: ${method} ${path}` } }),
  };
}
