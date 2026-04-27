import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  success, accepted,
  parseBody, authMiddleware, academicYearMiddleware,
  triggerGenerationSchema, overrideSlotSchema, swapSlotsSchema, autoResolveSchema, createEmptySlotSchema,
  swapElectiveSlotsSchema, previewElectiveSwapSchema,
} from '@timetable/shared';
import { TimetableService } from './service';

const service = new TimetableService();

export class TimetableController {
  async health(): Promise<APIGatewayProxyResultV2> {
    return success({ status: 'ok', service: 'timetable', timestamp: new Date().toISOString() });
  }

  async triggerGeneration(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, triggerGenerationSchema);
    const result = await service.triggerGeneration(ctx.schoolId, ctx.academicYearId, body);
    return accepted(result);
  }

  async getActiveGeneration(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const result = await service.getActiveGeneration(ctx.schoolId, ctx.academicYearId);
    return success(result);
  }

  async getGenerationStatus(event: APIGatewayProxyEventV2, jobId: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const result = await service.getGenerationStatus(auth.schoolId!, jobId);
    return success(result);
  }

  async getDivisionTimetable(event: APIGatewayProxyEventV2, divisionId: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const result = await service.getDivisionTimetable(ctx.schoolId, ctx.academicYearId, divisionId);
    return success(result);
  }

  async overrideSlot(event: APIGatewayProxyEventV2, slotId: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const body = parseBody(event, overrideSlotSchema);
    const result = await service.overrideSlot(auth.schoolId!, slotId, body);
    return success(result);
  }

  async swapSlots(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const body = parseBody(event, swapSlotsSchema);
    const result = await service.swapSlots(auth.schoolId!, body);
    return success(result);
  }

  async getValidSwapTargets(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const slotId = event.pathParameters?.slotId;
    if (!slotId) return success({ validSlotIds: [], invalidSlotIds: [] });
    const result = await service.getValidSwapTargets(auth.schoolId!, slotId);
    return success(result);
  }

  async autoResolve(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const body = parseBody(event, autoResolveSchema);
    const result = await service.autoResolveConflict(auth.schoolId!, body);
    return success(result);
  }

  async createEmptySlot(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const body = parseBody(event, createEmptySlotSchema);
    const result = await service.createEmptySlot(auth.schoolId!, body);
    return success(result);
  }

  async getConflicts(event: APIGatewayProxyEventV2, timetableId: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const result = await service.getConflicts(auth.schoolId!, timetableId);
    return success(result);
  }

  async getTeacherTimetable(event: APIGatewayProxyEventV2, teacherId: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const result = await service.getTeacherTimetable(ctx.schoolId, ctx.academicYearId, teacherId);
    return success(result);
  }

  async swapElectiveSlots(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const body = parseBody(event, swapElectiveSlotsSchema);
    const result = await service.swapElectiveSlots(auth.schoolId!, body);
    return success(result);
  }

  async previewElectiveSwap(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const body = parseBody(event, previewElectiveSwapSchema);
    const result = await service.previewElectiveSwap(auth.schoolId!, body);
    return success(result);
  }

  async getValidElectiveSwapTargets(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const slotId = event.pathParameters?.slotId;
    if (!slotId) return success({ validCoordinates: [], invalidCoordinates: [] });
    const result = await service.getValidElectiveSwapTargets(auth.schoolId!, slotId);
    return success(result);
  }
}
