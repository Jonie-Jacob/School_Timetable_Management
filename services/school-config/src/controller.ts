import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  success,
  created,
  noContent,
  parseBody,
  authMiddleware,
  academicYearMiddleware,
  AppError,
  createPeriodStructureSchema,
  updatePeriodStructureSchema,
  assignPeriodStructureSchema,
  setWorkingDaysSchema,
} from '@timetable/shared';
import { SchoolConfigService } from './service';

const service = new SchoolConfigService();

export class SchoolConfigController {
  async health(): Promise<APIGatewayProxyResultV2> {
    return success({ status: 'ok', service: 'school-config', timestamp: new Date().toISOString() });
  }

  // --- Period Structures ---

  async createPeriodStructure(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, createPeriodStructureSchema);
    const result = await service.createPeriodStructure(ctx.schoolId, ctx.academicYearId, body);
    return created(result);
  }

  async listPeriodStructures(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const result = await service.listPeriodStructures(ctx.schoolId, ctx.academicYearId);
    return success(result);
  }

  async getPeriodStructure(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const result = await service.getPeriodStructure(ctx.schoolId, ctx.academicYearId, id);
    return success(result);
  }

  async updatePeriodStructure(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, updatePeriodStructureSchema);
    const result = await service.updatePeriodStructure(ctx.schoolId, ctx.academicYearId, id, body);
    return success(result);
  }

  async deletePeriodStructure(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    await service.deletePeriodStructure(ctx.schoolId, ctx.academicYearId, id);
    return noContent();
  }

  async assignToClasses(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, assignPeriodStructureSchema);
    const result = await service.assignToClasses(ctx.schoolId, ctx.academicYearId, id, body);
    return success(result);
  }

  // --- Working Days ---

  async setWorkingDays(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const periodStructureId = event.queryStringParameters?.periodStructureId;
    if (!periodStructureId) {
      throw new AppError('periodStructureId query parameter is required', 400, 'VALIDATION_ERROR');
    }
    const body = parseBody(event, setWorkingDaysSchema);
    const result = await service.setWorkingDays(ctx.schoolId, ctx.academicYearId, periodStructureId, body);
    return success(result);
  }

  async getWorkingDays(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const periodStructureId = event.queryStringParameters?.periodStructureId;
    if (!periodStructureId) {
      throw new AppError('periodStructureId query parameter is required', 400, 'VALIDATION_ERROR');
    }
    const result = await service.getWorkingDays(ctx.schoolId, periodStructureId);
    return success(result);
  }

  // --- Slots ---

  async generateSlots(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const periodStructureId = event.queryStringParameters?.periodStructureId;
    if (!periodStructureId) {
      throw new AppError('periodStructureId query parameter is required', 400, 'VALIDATION_ERROR');
    }
    const result = await service.generateSlots(ctx.schoolId, periodStructureId);
    return created(result);
  }

  async getSlots(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const periodStructureId = event.queryStringParameters?.periodStructureId;
    if (!periodStructureId) {
      throw new AppError('periodStructureId query parameter is required', 400, 'VALIDATION_ERROR');
    }
    const result = await service.getSlots(ctx.schoolId, periodStructureId);
    return success(result);
  }
}
