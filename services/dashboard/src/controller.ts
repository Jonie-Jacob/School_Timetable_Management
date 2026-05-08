import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, authMiddleware, academicYearMiddleware } from '@timetable/shared';
import { DashboardService } from './service';

const service = new DashboardService();

export class DashboardController {
  async health(): Promise<APIGatewayProxyResultV2> {
    return success({ status: 'ok', service: 'dashboard', timestamp: new Date().toISOString() });
  }

  async getStats(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const result = await service.getStats(ctx.schoolId, ctx.academicYearId);
    return success(result);
  }

  async getRecentActivity(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const ctx = await academicYearMiddleware(event, auth);
    const result = await service.getRecentActivity(ctx.schoolId, ctx.academicYearId);
    return success(result);
  }

}
