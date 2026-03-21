import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { AuthLayout } from './AuthLayout';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { ResetPasswordForm } from './ResetPasswordForm';

type AuthView = 'login' | 'register' | 'forgot' | 'reset';

export function Component() {
  const [view, setView] = useState<AuthView>('login');
  const [resetEmail, setResetEmail] = useState('');
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <AuthLayout>
      {view === 'login' && (
        <LoginForm
          onSwitchToRegister={() => setView('register')}
          onSwitchToForgot={() => setView('forgot')}
        />
      )}
      {view === 'register' && (
        <RegisterForm onSwitchToLogin={() => setView('login')} />
      )}
      {view === 'forgot' && (
        <ForgotPasswordForm
          onSwitchToLogin={() => setView('login')}
          onSwitchToReset={(email) => {
            setResetEmail(email);
            setView('reset');
          }}
        />
      )}
      {view === 'reset' && (
        <ResetPasswordForm
          email={resetEmail}
          onSwitchToLogin={() => setView('login')}
        />
      )}
    </AuthLayout>
  );
}
