import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  success, created, noContent,
  parseBody, authMiddleware, academicYearMiddleware,
  createAssignmentSchema, updateAssignmentSchema,
  createElectiveGroupSchema, updateElectiveGroupSchema,
  addElectiveSubjectSchema, updateElectiveSubjectSchema,
} from '@timetable/shared';
import { AssignmentService } from './service';

const service = new AssignmentService();

export class AssignmentController {
  async health(): Promise<APIGatewayProxyResultV2> {
    return success({ status: 'ok', service: 'division-assignment', timestamp: new Date().toISOString() });
  }

  // ── Division Assignments ──

  async listAssignments(event: APIGatewayProxyEventV2, divisionId: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const result = await service.listAssignments(ctx.schoolId, ctx.academicYearId, divisionId);
    return success(result);
  }

  async createAssignment(event: APIGatewayProxyEventV2, divisionId: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, createAssignmentSchema);
    const result = await service.createAssignment(ctx.schoolId, ctx.academicYearId, divisionId, body);
    return created(result);
  }

  async updateAssignment(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, updateAssignmentSchema);
    const result = await service.updateAssignment(ctx.schoolId, ctx.academicYearId, id, body);
    return success(result);
  }

  async deleteAssignment(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    await service.deleteAssignment(ctx.schoolId, ctx.academicYearId, id);
    return noContent();
  }

  async createElectiveAssignment(event: APIGatewayProxyEventV2, divisionId: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, createAssignmentSchema);
    const result = await service.createElectiveAssignment(ctx.schoolId, ctx.academicYearId, divisionId, body);
    return created(result);
  }

  // ── Unassigned Teacher Subjects ──

  async getUnassigned(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const qs = event.queryStringParameters ?? {};
    const result = await service.getUnassignedTeacherSubjects(ctx.schoolId, ctx.academicYearId, {
      classId: qs.classId,
      subjectId: qs.subjectId,
      teacherId: qs.teacherId,
    });
    return success(result);
  }

  async quickAssign(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = JSON.parse(event.body || '{}');
    const result = await service.quickAssign(ctx.schoolId, ctx.academicYearId, {
      teacherId: body.teacherId,
      subjectId: body.subjectId,
      divisionId: body.divisionId,
      weightage: body.weightage,
    });
    return created(result);
  }

  // ── Elective Groups ──

  async createElectiveGroup(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, createElectiveGroupSchema);
    const result = await service.createElectiveGroup(ctx.schoolId, ctx.academicYearId, body);
    return created(result);
  }

  async listElectiveGroups(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const result = await service.listElectiveGroups(ctx.schoolId, ctx.academicYearId);
    return success(result);
  }

  async getElectiveGroup(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const result = await service.getElectiveGroup(ctx.schoolId, ctx.academicYearId, id);
    return success(result);
  }

  async updateElectiveGroup(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, updateElectiveGroupSchema);
    const result = await service.updateElectiveGroup(ctx.schoolId, ctx.academicYearId, id, body);
    return success(result);
  }

  async deleteElectiveGroup(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    await service.deleteElectiveGroup(ctx.schoolId, ctx.academicYearId, id);
    return noContent();
  }

  async addElectiveSubject(event: APIGatewayProxyEventV2, groupId: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, addElectiveSubjectSchema);
    const result = await service.addElectiveSubject(ctx.schoolId, ctx.academicYearId, groupId, body);
    return created(result);
  }

  async updateElectiveSubject(event: APIGatewayProxyEventV2, groupId: string, subjectId: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, updateElectiveSubjectSchema);
    const result = await service.updateElectiveSubject(ctx.schoolId, ctx.academicYearId, groupId, subjectId, body);
    return success(result);
  }

  async removeElectiveSubject(event: APIGatewayProxyEventV2, groupId: string, subjectId: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    await service.removeElectiveSubject(ctx.schoolId, ctx.academicYearId, groupId, subjectId);
    return noContent();
  }
}
