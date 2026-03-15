import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  success,
  created,
  noContent,
  paginated,
  parseBody,
  parsePagination,
  authMiddleware,
  createAcademicYearSchema,
  updateAcademicYearSchema,
} from '@timetable/shared';
import { AcademicYearService } from './service';

const service = new AcademicYearService();

export class AcademicYearController {
  async health(): Promise<APIGatewayProxyResultV2> {
    return success({ status: 'ok', service: 'academic-year', timestamp: new Date().toISOString() });
  }

  async create(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const { schoolId } = authMiddleware(event);
    const body = parseBody(event, createAcademicYearSchema);
    const result = await service.create(schoolId!, body);
    return created(result);
  }

  async list(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const { schoolId } = authMiddleware(event);
    const pagination = parsePagination(event);
    const result = await service.list(schoolId!, pagination);
    return paginated(result.data, result.meta);
  }

  async getById(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const { schoolId } = authMiddleware(event);
    const result = await service.getById(schoolId!, id);
    return success(result);
  }

  async update(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const { schoolId } = authMiddleware(event);
    const body = parseBody(event, updateAcademicYearSchema);
    const result = await service.update(schoolId!, id, body);
    return success(result);
  }

  async delete(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const { schoolId } = authMiddleware(event);
    await service.delete(schoolId!, id);
    return noContent();
  }

  async activate(event: APIGatewayProxyEventV2, id: string): Promise<APIGatewayProxyResultV2> {
    const { schoolId } = authMiddleware(event);
    const result = await service.activate(schoolId!, id);
    return success(result);
  }
}
