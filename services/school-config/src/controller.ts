import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  success,
  created,
  noContent,
  parseBody,
  authMiddleware,
  academicYearMiddleware,
  createPeriodStructureSchema,
  updatePeriodStructureSchema,
  assignPeriodStructureSchema,
  setWorkingDaysSchema,
  addSlotSchema,
  updateSlotSchema,
  reorderSlotsSchema,
} from '@timetable/shared';
import { SchoolConfigService } from './service';

const service = new SchoolConfigService();

export class SchoolConfigController {
  async health(): Promise<APIGatewayProxyResultV2> {
    return success({ status: 'ok', service: 'school-config', timestamp: new Date().toISOString() });
  }

  // --- Period Structures ---

  async createPeriodStructure(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, createPeriodStructureSchema);
    const result = await service.createPeriodStructure(ctx.schoolId, ctx.academicYearId, body);
    return created(result);
  }

  async listPeriodStructures(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const result = await service.listPeriodStructures(ctx.schoolId, ctx.academicYearId);
    return success(result);
  }

  async getPeriodStructure(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const result = await service.getPeriodStructure(ctx.schoolId, ctx.academicYearId, id);
    return success(result);
  }

  async updatePeriodStructure(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, updatePeriodStructureSchema);
    const result = await service.updatePeriodStructure(ctx.schoolId, ctx.academicYearId, id, body);
    return success(result);
  }

  async deletePeriodStructure(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    await service.deletePeriodStructure(ctx.schoolId, ctx.academicYearId, id);
    return noContent();
  }

  async assignToDivisions(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, assignPeriodStructureSchema);
    const result = await service.assignToDivisions(ctx.schoolId, ctx.academicYearId, id, body);
    return success(result);
  }

  // --- Working Days ---

  async setWorkingDays(event: APIGatewayProxyEventV2, periodStructureId: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, setWorkingDaysSchema);
    const result = await service.setWorkingDays(ctx.schoolId, ctx.academicYearId, periodStructureId, body);
    return success(result);
  }

  async getWorkingDays(event: APIGatewayProxyEventV2, periodStructureId: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const result = await service.getWorkingDays(ctx.schoolId, periodStructureId);
    return success(result);
  }

  // --- Slots ---

  async generateSlots(event: APIGatewayProxyEventV2, periodStructureId: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const result = await service.generateSlots(ctx.schoolId, periodStructureId);
    return created(result);
  }

  async getSlots(event: APIGatewayProxyEventV2, periodStructureId: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const result = await service.getSlots(ctx.schoolId, periodStructureId);
    return success(result);
  }

  async resetToDefault(event: APIGatewayProxyEventV2, periodStructureId: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const result = await service.resetToDefault(ctx.schoolId, ctx.academicYearId, periodStructureId);
    return success(result);
  }

  async addSlot(event: APIGatewayProxyEventV2, periodStructureId: string, dayId: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, addSlotSchema);
    const result = await service.addSlot(ctx.schoolId, periodStructureId, dayId, body);
    return created(result);
  }

  async updateSlot(event: APIGatewayProxyEventV2, periodStructureId: string, dayId: string, slotId: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, updateSlotSchema);
    const result = await service.updateSlot(ctx.schoolId, periodStructureId, dayId, slotId, body);
    return success(result);
  }

  async deleteSlot(event: APIGatewayProxyEventV2, periodStructureId: string, dayId: string, slotId: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const confirm = event.queryStringParameters?.confirm === 'true';
    await service.deleteSlot(ctx.schoolId, periodStructureId, dayId, slotId, confirm);
    return noContent();
  }

  async reorderSlots(event: APIGatewayProxyEventV2, periodStructureId: string, dayId: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, reorderSlotsSchema);
    const result = await service.reorderSlots(ctx.schoolId, periodStructureId, dayId, body);
    return success(result);
  }

  async copyDaySlots(event: APIGatewayProxyEventV2, periodStructureId: string, targetDayId: string, sourceDayId: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const result = await service.copyDaySlots(ctx.schoolId, periodStructureId, targetDayId, sourceDayId);
    return created(result);
  }
}
