import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ExportController } from './controller';

const controller = new ExportController();

export async function route(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  // Health
  if (method === 'GET' && path === '/export/health') {
    return controller.health();
  }

  // Division exports
  if (method === 'POST' && path === '/export/division/pdf') {
    return controller.exportDivisionPdf(event);
  }
  if (method === 'POST' && path === '/export/division/excel') {
    return controller.exportDivisionExcel(event);
  }

  // Teacher exports
  if (method === 'POST' && path === '/export/teacher/pdf') {
    return controller.exportTeacherPdf(event);
  }
  if (method === 'POST' && path === '/export/teacher/excel') {
    return controller.exportTeacherExcel(event);
  }

  return {
    statusCode: 404,
    body: JSON.stringify({ error: { code: 'NOT_FOUND', message: `Route not found: ${method} ${path}` } }),
  };
}
