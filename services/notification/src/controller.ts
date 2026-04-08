import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  success,
  noContent,
  paginated,
  parsePagination,
  authMiddleware,
  academicYearMiddleware,
} from '@timetable/shared';
import { NotificationService } from './service';

const service = new NotificationService();

export class NotificationController {
  async health(): Promise<APIGatewayProxyResultV2> {
    return success({ status: 'ok', service: 'notification', timestamp: new Date().toISOString() });
  }

  async list(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const pagination = parsePagination(event);
    const result = await service.list(ctx.schoolId, ctx.academicYearId, pagination);
    return paginated(result.data, result.meta);
  }

  async count(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const result = await service.count(ctx.schoolId, ctx.academicYearId);
    return success(result);
  }

  async dismiss(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    await service.dismiss(ctx.schoolId, id);
    return noContent();
  }

  async dismissAll(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    await service.dismissAll(ctx.schoolId, ctx.academicYearId);
    return noContent();
  }
}
