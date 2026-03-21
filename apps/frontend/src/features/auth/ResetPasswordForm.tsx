import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { mockConfirmResetPassword } from '@/lib/mock-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2 } from 'lucide-react';
import { PasswordInput, PasswordStrength } from '@/components/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const resetSchema = z
  .object({
    code: z.string().min(1, 'Verification code is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Must include uppercase, lowercase, and a number',
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ResetValues = z.infer<typeof resetSchema>;

interface ResetPasswordFormProps {
  email: string;
  onSwitchToLogin: () => void;
}

export function ResetPasswordForm({ email, onSwitchToLogin }: ResetPasswordFormProps) {
  const { t } = useTranslation('auth');
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { code: '', newPassword: '', confirmPassword: '' },
  });

  const newPassword = watch('newPassword');

  const onSubmit = async (values: ResetValues) => {
    setServerError(null);
    try {
      await mockConfirmResetPassword(email, values.code, values.newPassword);
      setSuccess(true);
    } catch {
      setServerError(t('resetPassword.errors.resetFailed'));
    }
  };

  if (success) {
    return (
      <Card className="border-0 shadow-none lg:border lg:shadow-sm">
        <CardHeader className="space-y-1 px-0 lg:px-6">
          <CardTitle className="text-2xl font-bold">
            {t('resetPassword.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 lg:px-6 space-y-4">
          <div className="flex items-start gap-3 rounded-md bg-success/10 p-4 text-sm text-success">
            <CheckCircle2 className="size-5 mt-0.5 shrink-0" />
            <span>{t('resetPassword.success')}</span>
          </div>
          <Button
            variant="gradient"
            className="w-full"
            onClick={onSwitchToLogin}
          >
            {t('resetPassword.backToLogin')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-none lg:border lg:shadow-sm">
      <CardHeader className="space-y-1 px-0 lg:px-6">
        <CardTitle className="text-2xl font-bold">
          {t('resetPassword.title')}
        </CardTitle>
        <CardDescription>{t('resetPassword.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="px-0 lg:px-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {serverError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {serverError}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reset-code">{t('resetPassword.code')}</Label>
            <Input
              id="reset-code"
              placeholder={t('resetPassword.codePlaceholder')}
              autoComplete="one-time-code"
              {...register('code')}
            />
            {errors.code && (
              <p className="text-sm text-destructive">{errors.code.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reset-password">{t('resetPassword.newPassword')}</Label>
            <PasswordInput
              id="reset-password"
              placeholder={t('resetPassword.newPasswordPlaceholder')}
              autoComplete="new-password"
              {...register('newPassword')}
            />
            <PasswordStrength password={newPassword} />
            {errors.newPassword && (
              <p className="text-sm text-destructive">{errors.newPassword.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reset-confirm">{t('resetPassword.confirmPassword')}</Label>
            <PasswordInput
              id="reset-confirm"
              placeholder={t('resetPassword.confirmPasswordPlaceholder')}
              autoComplete="new-password"
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            variant="gradient"
            className="w-full"
            loading={isSubmitting}
          >
            {isSubmitting ? t('resetPassword.submitting') : t('resetPassword.submit')}
          </Button>

          <button
            type="button"
            onClick={onSwitchToLogin}
            className="block w-full text-center text-sm font-medium text-primary hover:underline"
          >
            {t('resetPassword.backToLogin')}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
