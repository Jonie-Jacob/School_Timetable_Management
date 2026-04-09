import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '@/app/hooks';
import { loggedIn } from './authSlice';
import { mockLogin } from '@/lib/mock-auth';
import { isCognitoMode, cognitoSignIn, cognitoConfirmSignUp, cognitoResendConfirmation } from '@/lib/cognito-auth';
import { saveSessionData } from '@/app/AuthenticatedLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { PasswordInput } from '@/components/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

type LoginValues = z.infer<typeof loginSchema>;

interface LoginFormProps {
  onSwitchToRegister: () => void;
  onSwitchToForgot: () => void;
}

export function LoginForm({ onSwitchToRegister, onSwitchToForgot }: LoginFormProps) {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [serverError, setServerError] = useState<string | null>(null);

  // Confirmation state for unconfirmed users
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [confirmCode, setConfirmCode] = useState('');
  const [savedCredentials, setSavedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: false },
  });

  const rememberMe = watch('rememberMe');

  const completeLogin = async (email: string, password: string) => {
    const cognitoResult = await cognitoSignIn(email, password);
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cognitoResult.idToken}`,
      },
      body: JSON.stringify({ email, password }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message || 'Login failed');

    const schools: Array<{ id: string; name: string }> = data.data?.schools ?? [];
    const userRole = data.data?.user?.role ?? 'SCHOOL_ADMIN';
    const defaultSchool = schools[0];
    const schoolId = defaultSchool?.id || '';
    const schoolName = defaultSchool?.name || email;

    saveSessionData({ email: cognitoResult.email, schoolId, userId: cognitoResult.sub, schoolName, schools, userRole });
    dispatch(loggedIn({
      token: cognitoResult.idToken,
      email: cognitoResult.email,
      schoolId,
      userId: cognitoResult.sub,
      schoolName,
      schools,
      userRole,
    }));
    navigate('/', { replace: true });
  };

  const onSubmit = async (values: LoginValues) => {
    setServerError(null);
    try {
      if (isCognitoMode()) {
        await completeLogin(values.email, values.password);
      } else {
        const user = await mockLogin(values.email, values.password);
        dispatch(loggedIn(user));
        navigate('/', { replace: true });
      }
    } catch (err: any) {
      if (err?.code === 'UserNotConfirmedException' || err?.name === 'UserNotConfirmedException') {
        // User exists but email not verified — show confirmation screen
        setSavedCredentials({ email: values.email, password: values.password });
        setNeedsConfirmation(true);
        // Resend the confirmation code automatically
        try { await cognitoResendConfirmation(values.email); } catch { /* ignore */ }
      } else {
        setServerError(err?.message || t('login.errors.invalidCredentials'));
      }
    }
  };

  const handleConfirm = async () => {
    if (!savedCredentials || !confirmCode.trim()) return;
    setServerError(null);
    setIsConfirming(true);
    try {
      await cognitoConfirmSignUp(savedCredentials.email, confirmCode.trim());
      await completeLogin(savedCredentials.email, savedCredentials.password);
    } catch (err: any) {
      setServerError(err?.message || 'Confirmation failed. Please check the code and try again.');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleResendCode = async () => {
    if (!savedCredentials) return;
    try {
      await cognitoResendConfirmation(savedCredentials.email);
      setServerError(null);
    } catch (err: any) {
      setServerError(err?.message || 'Failed to resend code.');
    }
  };

  // Confirmation screen
  if (needsConfirmation && savedCredentials) {
    return (
      <Card className="border-0 shadow-none lg:border lg:shadow-sm">
        <CardHeader className="space-y-1 px-0 lg:px-6">
          <CardTitle className="text-2xl font-bold">Verify Your Email</CardTitle>
          <CardDescription>
            Your account needs email verification. We sent a code to <strong>{savedCredentials.email}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 lg:px-6 space-y-4">
          {serverError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {serverError}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="loginConfirmCode">Verification Code</Label>
            <Input
              id="loginConfirmCode"
              placeholder="Enter 6-digit code"
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              autoFocus
              maxLength={6}
            />
          </div>

          <Button
            variant="gradient"
            className="w-full"
            onClick={handleConfirm}
            loading={isConfirming}
            disabled={!confirmCode.trim()}
          >
            {isConfirming ? 'Verifying...' : 'Verify & Login'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Didn't receive the code?{' '}
            <button type="button" onClick={handleResendCode} className="font-medium text-primary hover:underline">
              Resend Code
            </button>
          </p>

          <p className="text-center text-sm text-muted-foreground">
            <button type="button" onClick={() => { setNeedsConfirmation(false); setSavedCredentials(null); setConfirmCode(''); }} className="font-medium text-primary hover:underline">
              Back to Login
            </button>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-none lg:border lg:shadow-sm">
      <CardHeader className="space-y-1 px-0 lg:px-6">
        <CardTitle className="text-2xl font-bold">{t('login.title')}</CardTitle>
        <CardDescription>{t('login.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="px-0 lg:px-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {serverError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {serverError}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">{t('login.email')}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t('login.emailPlaceholder')}
              autoComplete="email"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t('login.password')}</Label>
            <PasswordInput
              id="password"
              placeholder={t('login.passwordPlaceholder')}
              autoComplete="current-password"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                id="rememberMe"
                checked={rememberMe}
                onCheckedChange={(checked) =>
                  setValue('rememberMe', checked === true)
                }
              />
              <Label htmlFor="rememberMe" className="text-sm font-normal cursor-pointer">
                {t('login.rememberMe')}
              </Label>
            </div>
            <button
              type="button"
              onClick={onSwitchToForgot}
              className="text-sm font-medium text-primary hover:underline"
            >
              {t('login.forgotPassword')}
            </button>
          </div>

          <Button
            type="submit"
            variant="gradient"
            className="w-full"
            loading={isSubmitting}
          >
            {isSubmitting ? t('login.submitting') : t('login.submit')}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {t('login.noAccount')}{' '}
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="font-medium text-primary hover:underline"
            >
              {t('login.registerLink')}
            </button>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
