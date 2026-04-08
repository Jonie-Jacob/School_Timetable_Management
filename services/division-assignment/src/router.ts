import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { AppError } from '@timetable/shared';
import { AssignmentController } from './controller';

const controller = new AssignmentController();

export async function route(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  // Normalize: ensure path always starts with /api/ (Vite proxy strips it locally)
  const rawPath = event.rawPath;
  const path = rawPath.startsWith('/api/') ? rawPath : `/api${rawPath}`;

  // Health check
  if (method === 'GET' && path === '/api/assignments/health') {
    return controller.health();
  }

  // Unassigned teacher subjects
  if (method === 'GET' && path === '/api/assignments/unassigned') {
    return controller.getUnassigned(event);
  }

  // Quick assign
  if (method === 'POST' && path === '/api/assignments/quick-assign') {
    return controller.quickAssign(event);
  }

  // Elective group subject routes: /api/elective-groups/:groupId/subjects/:subjectId
  const groupSubjectIdMatch = path.match(/^\/api\/elective-groups\/([^/]+)\/subjects\/([^/]+)$/);
  if (method === 'DELETE' && groupSubjectIdMatch) {
    return controller.removeElectiveSubject(event, groupSubjectIdMatch[1], groupSubjectIdMatch[2]);
  }

  // Elective group subjects: /api/elective-groups/:id/subjects
  const groupSubjectsMatch = path.match(/^\/api\/elective-groups\/([^/]+)\/subjects$/);
  if (method === 'POST' && groupSubjectsMatch) {
    return controller.addElectiveSubject(event, groupSubjectsMatch[1]);
  }

  // Elective group by id: /api/elective-groups/:id
  const groupIdMatch = path.match(/^\/api\/elective-groups\/([^/]+)$/);
  if (groupIdMatch) {
    if (method === 'GET') return controller.getElectiveGroup(event, groupIdMatch[1]);
    if (method === 'PUT') return controller.updateElectiveGroup(event, groupIdMatch[1]);
    if (method === 'DELETE') return controller.deleteElectiveGroup(event, groupIdMatch[1]);
  }

  // Elective groups collection: /api/elective-groups
  if (path === '/api/elective-groups') {
    if (method === 'POST') return controller.createElectiveGroup(event);
    if (method === 'GET') return controller.listElectiveGroups(event);
  }

  // Elective assignment: /api/divisions/:divisionId/assignments/elective
  const electiveAssignmentMatch = path.match(/^\/api\/divisions\/([^/]+)\/assignments\/elective$/);
  if (method === 'POST' && electiveAssignmentMatch) {
    return controller.createElectiveAssignment(event, electiveAssignmentMatch[1]);
  }

  // Division assignments: /api/divisions/:divisionId/assignments
  const divisionAssignmentsMatch = path.match(/^\/api\/divisions\/([^/]+)\/assignments$/);
  if (divisionAssignmentsMatch) {
    if (method === 'GET') return controller.listAssignments(event, divisionAssignmentsMatch[1]);
    if (method === 'POST') return controller.createAssignment(event, divisionAssignmentsMatch[1]);
  }

  // Assignment by id: /api/assignments/:id
  const assignmentIdMatch = path.match(/^\/api\/assignments\/([^/]+)$/);
  if (assignmentIdMatch) {
    if (method === 'PUT') return controller.updateAssignment(event, assignmentIdMatch[1]);
    if (method === 'DELETE') return controller.deleteAssignment(event, assignmentIdMatch[1]);
  }

  throw new AppError(`Route not found: ${method} ${path}`, 404, 'ROUTE_NOT_FOUND');
}
