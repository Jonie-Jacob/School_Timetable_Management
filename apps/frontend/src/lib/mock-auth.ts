export interface MockUser {
  token: string;
  email: string;
  schoolId: string;
  userId: string;
  schoolName: string;
}

const MOCK_USER: MockUser = {
  token: 'mock-jwt-token-local-dev',
  email: 'admin@school.test',
  schoolId: '400d3d09-af01-44ea-a35e-eea095c9efe4',
  userId: 'mock-user-001',
  schoolName: 'Demo School',
};

const STORAGE_KEY = 'mock-auth';

export function mockLogin(_email: string, _password: string): Promise<MockUser> {
  const user = { ...MOCK_USER };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  return Promise.resolve(user);
}

export function mockRegister(
  _schoolName: string,
  _email: string,
  _password: string,
): Promise<MockUser> {
  const user = { ...MOCK_USER };
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
