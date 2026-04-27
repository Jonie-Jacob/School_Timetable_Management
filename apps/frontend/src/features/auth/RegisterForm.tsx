import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '@/app/hooks';
import { loggedIn } from './authSlice';
import { mockRegister } from '@/lib/mock-auth';
import { isCognitoMode, cognitoSignUp, cognitoConfirmSignUp, cognitoSignIn, cognitoResendConfirmation } from '@/lib/cognito-auth';
import { saveSessionData } from '@/app/AuthenticatedLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput, PasswordStrength } from '@/components/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const registerSchema = z
  .object({
    schoolName: z.string().min(2, 'School name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Must include uppercase, lowercase, and a number',
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterValues = z.infer<typeof registerSchema>;

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

export function RegisterForm({ onSwitchToLogin }: RegisterFormProps) {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [confirmCode, setConfirmCode] = useState('');
  const [savedValues, setSavedValues] = useState<RegisterValues | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { schoolName: '', email: '', password: '', confirmPassword: '' },
  });

  const password = watch('password');

  const onSubmit = async (values: RegisterValues) => {
    setServerError(null);
    try {
      if (isCognitoMode()) {
        await cognitoSignUp(values.email, values.password);
        // Cognito requires email verification -- show confirmation code input
        setSavedValues(values);
        setPendingConfirmation(true);
      } else {
        const user = await mockRegister(values.schoolName, values.email, values.password);
        dispatch(loggedIn(user));
        navigate('/', { replace: true });
      }
    } catch (err: any) {
      // If user already exists but not confirmed, allow confirmation
      if (err?.code === 'UsernameExistsException') {
        setServerError('An account with this email already exists. Please login instead.');
      } else {
        setServerError(err?.message || t('register.errors.registrationFailed'));
      }
    }
  };

  const handleConfirm = async () => {
    if (!savedValues || !confirmCode.trim()) return;
    setServerError(null);
    setIsConfirming(true);
    try {
      // 1. Confirm the signup with the verification code
      await cognitoConfirmSignUp(savedValues.email, confirmCode.trim());
      // 2. Sign in to get tokens
      const cognitoResult = await cognitoSignIn(savedValues.email, savedValues.password);
      // 3. Register school in backend
      const resp = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cognitoResult.idToken}`,
        },
        body: JSON.stringify({ schoolName: savedValues.schoolName, adminEmail: savedValues.email, password: savedValues.password }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error?.message || 'Registration failed');
      const schools: Array<{ id: string; name: string }> = data.data?.schools ?? [];
      const defaultSchool = schools[0];
      const schoolId = defaultSchool?.id || data.data?.school?.id || '';
      const schoolName = defaultSchool?.name || data.data?.school?.name || savedValues.schoolName;
      saveSessionData({ email: cognitoResult.email, schoolId, userId: cognitoResult.sub, schoolName, schools, userRole: 'SCHOOL_ADMIN' });
      dispatch(loggedIn({
        token: cognitoResult.idToken,
        email: cognitoResult.email,
        schoolId,
        userId: cognitoResult.sub,
        schoolName,
        schools,
        userRole: 'SCHOOL_ADMIN',
      }));
      navigate('/', { replace: true });
    } catch (err: any) {
      setServerError(err?.message || 'Confirmation failed. Please check the code and try again.');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleResendCode = async () => {
    if (!savedValues) return;
    try {
      await cognitoResendConfirmation(savedValues.email);
      setServerError(null);
    } catch (err: any) {
      setServerError(err?.message || 'Failed to resend code.');
    }
  };

  // Confirmation code step
  if (pendingConfirmation && savedValues) {
    return (
      <Card className="border-0 shadow-none lg:border lg:shadow-sm">
        <CardHeader className="space-y-1 px-0 lg:px-6">
          <CardTitle className="text-2xl font-bold">Verify Your Email</CardTitle>
          <CardDescription>
            We sent a verification code to <strong>{savedValues.email}</strong>. Enter it below to complete registration.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 lg:px-6 space-y-4">
          {serverError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {serverError}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="confirmCode">Verification Code</Label>
            <Input
              id="confirmCode"
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
            {isConfirming ? 'Verifying...' : 'Verify & Continue'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Didn't receive the code?{' '}
            <button type="button" onClick={handleResendCode} className="font-medium text-primary hover:underline">
              Resend Code
            </button>
          </p>

          <p className="text-center text-sm text-muted-foreground">
            <button type="button" onClick={() => { setPendingConfirmation(false); setSavedValues(null); }} className="font-medium text-primary hover:underline">
              Back to Registration
            </button>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-none lg:border lg:shadow-sm">
      <CardHeader className="space-y-1 px-0 lg:px-6">
        <CardTitle className="text-2xl font-bold">{t('register.title')}</CardTitle>
        <CardDescription>{t('register.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="px-0 lg:px-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {serverError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {serverError}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="schoolName">{t('register.schoolName')}</Label>
            <Input
              id="schoolName"
              placeholder={t('register.schoolNamePlaceholder')}
              autoComplete="organization"
              {...register('schoolName')}
            />
            {errors.schoolName && (
              <p className="text-sm text-destructive">{errors.schoolName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-email">{t('register.email')}</Label>
            <Input
              id="reg-email"
              type="email"
              placeholder={t('register.emailPlaceholder')}
              autoComplete="email"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-password">{t('register.password')}</Label>
            <PasswordInput
              id="reg-password"
              placeholder={t('register.passwordPlaceholder')}
              autoComplete="new-password"
              {...register('password')}
            />
            <PasswordStrength password={password} />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-confirm">{t('register.confirmPassword')}</Label>
            <PasswordInput
              id="reg-confirm"
              placeholder={t('register.confirmPasswordPlaceholder')}
              autoComplete="new-password"
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>

          <Button
            type="submit"
            variant="gradient"
            className="w-full"
            loading={isSubmitting}
          >
            {isSubmitting ? t('register.submitting') : t('register.submit')}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {t('register.hasAccount')}{' '}
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="font-medium text-primary hover:underline"
            >
              {t('register.loginLink')}
            </button>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
