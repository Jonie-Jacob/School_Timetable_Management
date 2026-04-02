import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  success, created, noContent,
  parseBody, authMiddleware, academicYearMiddleware,
  createClassSchema, updateClassSchema,
  createDivisionSchema, updateDivisionSchema,
  updateSortOrderSchema,
} from '@timetable/shared';
import { ClassService } from './service';

const service = new ClassService();

export class ClassController {
  async health(): Promise<APIGatewayProxyResultV2> {
    return success({ status: 'ok', service: 'class', timestamp: new Date().toISOString() });
  }

  async create(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, createClassSchema);
    const result = await service.create(ctx.schoolId, ctx.academicYearId, body);
    return created(result);
  }

  async list(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const result = await service.list(ctx.schoolId, ctx.academicYearId);
    return success(result);
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
    const body = parseBody(event, updateClassSchema);
    const result = await service.update(ctx.schoolId, ctx.academicYearId, id, body);
    return success(result);
  }

  async delete(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    await service.delete(ctx.schoolId, ctx.academicYearId, id);
    return noContent();
  }

  async updateSortOrder(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, updateSortOrderSchema);
    const result = await service.updateSortOrder(ctx.schoolId, ctx.academicYearId, body);
    return success(result);
  }

  async addDivision(event: APIGatewayProxyEventV2, classId: string): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, createDivisionSchema);
    const result = await service.addDivision(ctx.schoolId, ctx.academicYearId, classId, body);
    return created(result);
  }

  async updateDivision(event: APIGatewayProxyEventV2, classId: string, divisionId: string): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, updateDivisionSchema);
    const result = await service.updateDivision(ctx.schoolId, ctx.academicYearId, classId, divisionId, body);
    return success(result);
  }

  async deleteDivision(event: APIGatewayProxyEventV2, classId: string, divisionId: string): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    await service.deleteDivision(ctx.schoolId, ctx.academicYearId, classId, divisionId);
    return noContent();
  }
}
