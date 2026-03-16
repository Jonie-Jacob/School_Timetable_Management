import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { AppError } from '@timetable/shared';
import { AssignmentController } from './controller';

const controller = new AssignmentController();

export async function route(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  // Health check
  if (method === 'GET' && path === '/assignments/health') {
    return controller.health();
  }

  // Elective group subject routes: /elective-groups/:groupId/subjects/:subjectId
  const groupSubjectIdMatch = path.match(/^\/elective-groups\/([^/]+)\/subjects\/([^/]+)$/);
  if (method === 'DELETE' && groupSubjectIdMatch) {
    return controller.removeElectiveSubject(event, groupSubjectIdMatch[1], groupSubjectIdMatch[2]);
  }

  // Elective group subjects: /elective-groups/:id/subjects
  const groupSubjectsMatch = path.match(/^\/elective-groups\/([^/]+)\/subjects$/);
  if (method === 'POST' && groupSubjectsMatch) {
    return controller.addElectiveSubject(event, groupSubjectsMatch[1]);
  }

  // Elective group by id: /elective-groups/:id
  const groupIdMatch = path.match(/^\/elective-groups\/([^/]+)$/);
  if (groupIdMatch) {
    if (method === 'GET') return controller.getElectiveGroup(event, groupIdMatch[1]);
    if (method === 'PUT') return controller.updateElectiveGroup(event, groupIdMatch[1]);
    if (method === 'DELETE') return controller.deleteElectiveGroup(event, groupIdMatch[1]);
  }

  // Elective groups collection: /elective-groups
  if (path === '/elective-groups') {
    if (method === 'POST') return controller.createElectiveGroup(event);
    if (method === 'GET') return controller.listElectiveGroups(event);
  }

  // Elective assignment: /divisions/:divisionId/assignments/elective
  const electiveAssignmentMatch = path.match(/^\/divisions\/([^/]+)\/assignments\/elective$/);
  if (method === 'POST' && electiveAssignmentMatch) {
    return controller.createElectiveAssignment(event, electiveAssignmentMatch[1]);
  }

  // Division assignments: /divisions/:divisionId/assignments
  const divisionAssignmentsMatch = path.match(/^\/divisions\/([^/]+)\/assignments$/);
  if (divisionAssignmentsMatch) {
    if (method === 'GET') return controller.listAssignments(event, divisionAssignmentsMatch[1]);
    if (method === 'POST') return controller.createAssignment(event, divisionAssignmentsMatch[1]);
  }

  // Assignment by id: /assignments/:id
  const assignmentIdMatch = path.match(/^\/assignments\/([^/]+)$/);
  if (assignmentIdMatch) {
    if (method === 'PUT') return controller.updateAssignment(event, assignmentIdMatch[1]);
    if (method === 'DELETE') return controller.deleteAssignment(event, assignmentIdMatch[1]);
  }

  throw new AppError(`Route not found: ${method} ${path}`, 404, 'ROUTE_NOT_FOUND');
}
