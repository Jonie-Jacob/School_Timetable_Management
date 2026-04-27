import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
  type CognitoUserSession,
} from 'amazon-cognito-identity-js';

const POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID || '';
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || '';

const userPool = POOL_ID && CLIENT_ID
  ? new CognitoUserPool({ UserPoolId: POOL_ID, ClientId: CLIENT_ID })
  : null;

export interface CognitoAuthResult {
  idToken: string;
  accessToken: string;
  email: string;
  sub: string;
}

export function cognitoSignUp(email: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!userPool) return reject(new Error('Cognito not configured'));

    const attributes = [
      new CognitoUserAttribute({ Name: 'email', Value: email }),
    ];

    userPool.signUp(email, password, attributes, [], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function cognitoConfirmSignUp(email: string, code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!userPool) return reject(new Error('Cognito not configured'));

    const user = new CognitoUser({ Username: email, Pool: userPool });
    user.confirmRegistration(code, true, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function cognitoResendConfirmation(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!userPool) return reject(new Error('Cognito not configured'));

    const user = new CognitoUser({ Username: email, Pool: userPool });
    user.resendConfirmationCode((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function cognitoSignIn(email: string, password: string): Promise<CognitoAuthResult> {
  return new Promise((resolve, reject) => {
    if (!userPool) return reject(new Error('Cognito not configured'));

    const user = new CognitoUser({ Username: email, Pool: userPool });
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });

    user.authenticateUser(authDetails, {
      onSuccess: (session: CognitoUserSession) => {
        resolve({
          idToken: session.getIdToken().getJwtToken(),
          accessToken: session.getAccessToken().getJwtToken(),
          email: session.getIdToken().payload.email || email,
          sub: session.getIdToken().payload.sub,
        });
      },
      onFailure: (err) => reject(err),
      newPasswordRequired: () => {
        reject(new Error('New password required -- please contact admin.'));
      },
    });
  });
}

export function cognitoGetSession(): Promise<CognitoAuthResult> {
  return new Promise((resolve, reject) => {
    if (!userPool) return reject(new Error('Cognito not configured'));

    const user = userPool.getCurrentUser();
    if (!user) return reject(new Error('No current user'));

    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) {
        return reject(err || new Error('Invalid session'));
      }
      resolve({
        idToken: session.getIdToken().getJwtToken(),
        accessToken: session.getAccessToken().getJwtToken(),
        email: session.getIdToken().payload.email || '',
        sub: session.getIdToken().payload.sub,
      });
    });
  });
}

export function cognitoSignOut(): void {
  if (!userPool) return;
  const user = userPool.getCurrentUser();
  if (user) user.signOut();
}

export function cognitoForgotPassword(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!userPool) return reject(new Error('Cognito not configured'));

    const user = new CognitoUser({ Username: email, Pool: userPool });
    user.forgotPassword({
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
    });
  });
}

export function cognitoConfirmPassword(email: string, code: string, newPassword: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!userPool) return reject(new Error('Cognito not configured'));

    const user = new CognitoUser({ Username: email, Pool: userPool });
    user.confirmPassword(code, newPassword, {
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
    });
  });
}

export function isCognitoMode(): boolean {
  return import.meta.env.VITE_AUTH_MODE === 'cognito' && !!userPool;
}
