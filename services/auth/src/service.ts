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
  email: string;
  school_id?: string; // kept for backward compat, school context now via X-School-Id header
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

const schoolUserModel = () => (prisma as any).schoolUser;

export class AuthService {
  /**
   * Register: creates a School + SchoolUser(SCHOOL_ADMIN) and returns JWT.
   * In production, Cognito handles user creation; this also works for mock dev.
   */
  async register(input: RegisterInput) {
    const existing = await prisma.school.findUnique({
      where: { adminEmail: input.adminEmail },
    });
    if (existing) {
      throw new ConflictError('School with this email already exists');
    }

    const school = await prisma.school.create({
      data: {
        name: input.schoolName,
        adminEmail: input.adminEmail,
        cognitoUserId: `local-user-${Date.now()}`,
      },
    });

    // Create SchoolUser record
    await schoolUserModel().create({
      data: {
        email: input.adminEmail,
        schoolId: school.id,
        role: 'SCHOOL_ADMIN',
      },
    });

    const token = signToken({
      sub: school.cognitoUserId,
      email: school.adminEmail,
    });

    return {
      token,
      user: { email: school.adminEmail, role: 'SCHOOL_ADMIN' },
      schools: [{ id: school.id, name: school.name }],
    };
  }

  /**
   * Login: looks up SchoolUser records for the email.
   * Returns list of accessible schools. For SUPER_ADMIN, returns all schools.
   */
  async login(input: LoginInput) {
    const schoolUsers = await schoolUserModel().findMany({
      where: { email: input.email },
      include: { school: { select: { id: true, name: true } } },
    });

    // Fall back to legacy School.adminEmail lookup
    if (schoolUsers.length === 0) {
      const school = await prisma.school.findUnique({
        where: { adminEmail: input.email },
      });
      if (!school) {
        throw new AppError('No account found with this email', 404, 'NOT_FOUND');
      }
      const token = signToken({
        sub: school.cognitoUserId,
        email: school.adminEmail,
      });
      return {
        token,
        user: { email: school.adminEmail, role: 'SCHOOL_ADMIN' },
        schools: [{ id: school.id, name: school.name }],
      };
    }

    const isSuperAdmin = schoolUsers.some((su: any) => su.role === 'SUPER_ADMIN');
    const role = isSuperAdmin ? 'SUPER_ADMIN' : schoolUsers[0].role;

    let schools: Array<{ id: string; name: string }>;
    if (isSuperAdmin) {
      // SUPER_ADMIN gets all schools
      schools = await prisma.school.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
    } else {
      schools = schoolUsers
        .filter((su: any) => su.school)
        .map((su: any) => ({ id: su.school.id, name: su.school.name }));
    }

    if (schools.length === 0) {
      throw new AppError('No schools found for this account', 404, 'NOT_FOUND');
    }

    const token = signToken({
      sub: input.email, // use email as sub for mock; Cognito uses its own sub
      email: input.email,
    });

    return {
      token,
      user: { email: input.email, role },
      schools,
    };
  }

  /**
   * Return the current user profile + accessible schools.
   */
  async me(email: string) {
    const schoolUsers = await schoolUserModel().findMany({
      where: { email },
      include: { school: { select: { id: true, name: true } } },
    });

    const isSuperAdmin = schoolUsers.some((su: any) => su.role === 'SUPER_ADMIN');
    const role = isSuperAdmin ? 'SUPER_ADMIN' : (schoolUsers[0]?.role ?? 'SCHOOL_ADMIN');

    let schools: Array<{ id: string; name: string }>;
    if (isSuperAdmin) {
      schools = await prisma.school.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
    } else {
      schools = schoolUsers
        .filter((su: any) => su.school)
        .map((su: any) => ({ id: su.school.id, name: su.school.name }));
    }

    return {
      email,
      role,
      schools,
    };
  }

  /**
   * Return the list of schools accessible to a user.
   */
  async getSchools(email: string) {
    const schoolUsers = await schoolUserModel().findMany({
      where: { email },
      include: { school: { select: { id: true, name: true } } },
    });

    const isSuperAdmin = schoolUsers.some((su: any) => su.role === 'SUPER_ADMIN');

    if (isSuperAdmin) {
      return prisma.school.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
    }

    return schoolUsers
      .filter((su: any) => su.school)
      .map((su: any) => ({ id: su.school.id, name: su.school.name }));
  }
}
