import jwt from 'jsonwebtoken';
import { prisma, AppError, ConflictError } from '@timetable/shared';

const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret-key-change-in-prod';
const JWT_EXPIRES_IN = '24h';

export interface RegisterInput {
  schoolName: string;
  adminEmail: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

interface TokenPayload {
  sub: string;
  school_id: string;
  email: string;
}

function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    throw new AppError('Invalid or expired token', 401, 'INVALID_TOKEN');
  }
}

export class AuthService {
  /**
   * Mock registration: creates a School record and returns a JWT.
   * In production, Cognito handles user creation and the Post-Confirmation
   * trigger creates the School row. Here we do it all inline.
   */
  async register(input: RegisterInput) {
    const existing = await prisma.school.findUnique({
      where: { adminEmail: input.adminEmail },
    });
    if (existing) {
      throw new ConflictError('School with this email already exists');
    }

    // cognitoUserId is a mock UUID for local dev
    const school = await prisma.school.create({
      data: {
        name: input.schoolName,
        adminEmail: input.adminEmail,
        cognitoUserId: `local-user-${Date.now()}`,
      },
    });

    const token = signToken({
      sub: school.cognitoUserId,
      school_id: school.id,
      email: school.adminEmail,
    });

    return {
      token,
      school: {
        id: school.id,
        name: school.name,
        adminEmail: school.adminEmail,
      },
    };
  }

  /**
   * Mock login: looks up school by email and returns a JWT.
   * No real password verification — this is a dev-only mock.
   */
  async login(input: LoginInput) {
    const school = await prisma.school.findUnique({
      where: { adminEmail: input.email },
    });
    if (!school) {
      throw new AppError('No account found with this email', 404, 'NOT_FOUND');
    }

    const token = signToken({
      sub: school.cognitoUserId,
      school_id: school.id,
      email: school.adminEmail,
    });

    return {
      token,
      school: {
        id: school.id,
        name: school.name,
        adminEmail: school.adminEmail,
      },
    };
  }

  /**
   * Return the current user/school profile.
   */
  async me(schoolId: string) {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        id: true,
        name: true,
        adminEmail: true,
        createdAt: true,
      },
    });
    if (!school) {
      throw new AppError('School not found', 404, 'NOT_FOUND');
    }
    return school;
  }
}
