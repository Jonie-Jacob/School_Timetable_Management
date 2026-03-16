import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  success,
  created,
  noContent,
  paginated,
  parseBody,
  parsePagination,
  authMiddleware,
  academicYearMiddleware,
  createTeacherSchema,
  updateTeacherSchema,
  setTeacherSubjectsSchema,
  setTeacherAvailabilitySchema,
} from '@timetable/shared';
import { TeacherService } from './service';

const service = new TeacherService();

export class TeacherController {
  async health(): Promise<APIGatewayProxyResultV2> {
    return success({ status: 'ok', service: 'teacher', timestamp: new Date().toISOString() });
  }

  async create(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, createTeacherSchema);
    const result = await service.create(ctx.schoolId, ctx.academicYearId, body);
    return created(result);
  }

  async list(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const pagination = parsePagination(event);
    const result = await service.list(ctx.schoolId, ctx.academicYearId, pagination);
    return paginated(result.data, result.meta);
  }

  async getById(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const result = await service.getById(ctx.schoolId, ctx.academicYearId, id);
    return success(result);
  }

  async update(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, updateTeacherSchema);
    const result = await service.update(ctx.schoolId, ctx.academicYearId, id, body);
    return success(result);
  }

  async delete(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    await service.delete(ctx.schoolId, ctx.academicYearId, id);
    return noContent();
  }

  async setSubjects(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, setTeacherSubjectsSchema);
    const result = await service.setSubjects(ctx.schoolId, ctx.academicYearId, id, body);
    return success(result);
  }

  async setAvailability(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, setTeacherAvailabilitySchema);
    const result = await service.setAvailability(ctx.schoolId, ctx.academicYearId, id, body);
    return success(result);
  }
}
