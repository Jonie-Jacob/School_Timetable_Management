export interface MockUser {
  token: string;
  email: string;
  schoolId: string;
  userId: string;
  schoolName: string;
  schools?: Array<{ id: string; name: string }>;
  userRole?: 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'VIEWER';
}

const MOCK_USER: MockUser = {
  token: 'mock-jwt-token-local-dev',
  email: 'admin@school.test',
  schoolId: '400d3d09-af01-44ea-a35e-eea095c9efe4',
  userId: 'mock-user-001',
  schoolName: 'Demo School',
  schools: [{ id: '400d3d09-af01-44ea-a35e-eea095c9efe4', name: 'Demo School' }],
  userRole: 'SCHOOL_ADMIN',
};

const STORAGE_KEY = 'mock-auth';

export function mockLogin(email: string, _password: string): Promise<MockUser> {
  // Check if there's a previously registered school
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) {
    const prev = JSON.parse(existing) as MockUser;
    const user: MockUser = {
      ...MOCK_USER,
      email,
      schoolName: prev.schoolName || MOCK_USER.schoolName,
      schoolId: prev.schoolId,
      schools: prev.schools ?? [{ id: prev.schoolId, name: prev.schoolName || MOCK_USER.schoolName }],
      userRole: prev.userRole ?? 'SCHOOL_ADMIN',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    return Promise.resolve(user);
  }
  const user = { ...MOCK_USER, email };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  return Promise.resolve(user);
}

export function mockRegister(
  schoolName: string,
  email: string,
  _password: string,
): Promise<MockUser> {
  const schoolId = crypto.randomUUID();
  const user: MockUser = {
    token: 'mock-jwt-token-' + Date.now(),
    email,
    schoolId,
    userId: 'user-' + Date.now(),
    schoolName,
    schools: [{ id: schoolId, name: schoolName }],
    userRole: 'SCHOOL_ADMIN',
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  return Promise.resolve(user);
}

export function mockGetSession(): Promise<MockUser> {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    return Promise.resolve(JSON.parse(stored) as MockUser);
  }
  return Promise.reject(new Error('No session'));
}

export function mockLogout(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function mockForgotPassword(_email: string): Promise<void> {
  return Promise.resolve();
}

export function mockConfirmResetPassword(
  _email: string,
  _code: string,
  _newPassword: string,
): Promise<void> {
  return Promise.resolve();
}
