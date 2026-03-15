import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import {
  success,
  created,
  parseBody,
  AppError,
} from '@timetable/shared';
import { AuthService, verifyToken } from './service';

const registerSchema = z.object({
  schoolName: z.string().min(1).max(255),
  adminEmail: z.string().email().max(255),
  password: z.string().min(6).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const authService = new AuthService();

export class AuthController {
  async health(): Promise<APIGatewayProxyResultV2> {
    return success({ status: 'ok', service: 'auth', timestamp: new Date().toISOString() });
  }

  async register(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const body = parseBody(event, registerSchema);
    const result = await authService.register(body);
    return created(result);
  }

  async login(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const body = parseBody(event, loginSchema);
    const result = await authService.login(body);
    return success(result);
  }

  async me(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const schoolId = this.extractSchoolId(event);
    const result = await authService.me(schoolId);
    return success(result);
  }

  /**
   * Extract school_id from Bearer token or mock headers.
   */
  private extractSchoolId(event: APIGatewayProxyEventV2): string {
    // Try Bearer token first
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = verifyToken(token);
      return payload.school_id;
    }

    // Fall back to mock headers
    const schoolId = event.headers?.['x-school-id'];
    if (schoolId) {
      return schoolId;
    }

    throw new AppError('Unauthorized — provide Bearer token or x-school-id header', 401, 'UNAUTHORIZED');
  }
}
