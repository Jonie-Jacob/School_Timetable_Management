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
    const email = this.extractEmail(event);
    const result = await authService.me(email);
    return success(result);
  }

  async schools(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const email = this.extractEmail(event);
    const schools = await authService.getSchools(email);
    return success(schools);
  }

  /**
   * Extract email from Bearer token (mock JWT or Cognito idToken) or mock headers.
   */
  private extractEmail(event: APIGatewayProxyEventV2): string {
    // Try Cognito authorizer claims first (production)
    const claims = (event.requestContext as unknown as Record<string, unknown>)?.authorizer as
      | Record<string, unknown>
      | undefined;
    if (claims?.jwt) {
      const jwtClaims = (claims.jwt as Record<string, unknown>)?.claims as
        | Record<string, string>
        | undefined;
      if (jwtClaims?.email) return jwtClaims.email;
    }

    // Try Bearer token (mock/local dev JWT)
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = verifyToken(token);
      return payload.email;
    }

    // Fall back to mock headers
    const email = event.headers?.['x-user-email'];
    if (email) return email;

    throw new AppError('Unauthorized -- provide Bearer token or x-user-email header', 401, 'UNAUTHORIZED');
  }
}
