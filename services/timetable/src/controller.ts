import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  success, accepted,
  parseBody, authMiddleware, academicYearMiddleware,
  triggerGenerationSchema, overrideSlotSchema,
} from '@timetable/shared';
import { TimetableService } from './service';

const service = new TimetableService();

export class TimetableController {
  async health(): Promise<APIGatewayProxyResultV2> {
    return success({ status: 'ok', service: 'timetable', timestamp: new Date().toISOString() });
  }

  async triggerGeneration(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const body = parseBody(event, triggerGenerationSchema);
    const result = await service.triggerGeneration(ctx.schoolId, ctx.academicYearId, body);
    return accepted(result);
  }

  async getGenerationStatus(event: APIGatewayProxyEventV2, jobId: string): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const result = await service.getGenerationStatus(auth.schoolId!, jobId);
    return success(result);
  }

  async getDivisionTimetable(event: APIGatewayProxyEventV2, divisionId: string): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const result = await service.getDivisionTimetable(ctx.schoolId, ctx.academicYearId, divisionId);
    return success(result);
  }

  async overrideSlot(event: APIGatewayProxyEventV2, slotId: string): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const body = parseBody(event, overrideSlotSchema);
    const result = await service.overrideSlot(auth.schoolId!, slotId, body);
    return success(result);
  }

  async publishTimetable(event: APIGatewayProxyEventV2, timetableId: string): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const result = await service.publishTimetable(auth.schoolId!, timetableId);
    return success(result);
  }

  async getConflicts(event: APIGatewayProxyEventV2, timetableId: string): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const result = await service.getConflicts(auth.schoolId!, timetableId);
    return success(result);
  }

  async getTeacherTimetable(event: APIGatewayProxyEventV2, teacherId: string): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const result = await service.getTeacherTimetable(ctx.schoolId, ctx.academicYearId, teacherId);
    return success(result);
  }
}
