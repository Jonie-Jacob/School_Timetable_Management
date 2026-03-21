import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { mockForgotPassword } from '@/lib/mock-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const forgotSchema = z.object({
  email: z.string().email('Invalid email address'),
});

type ForgotValues = z.infer<typeof forgotSchema>;

interface ForgotPasswordFormProps {
  onSwitchToLogin: () => void;
  onSwitchToReset: (email: string) => void;
}

export function ForgotPasswordForm({
  onSwitchToLogin,
  onSwitchToReset,
}: ForgotPasswordFormProps) {
  const { t } = useTranslation('auth');
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotValues) => {
    setServerError(null);
    try {
      await mockForgotPassword(values.email);
      setSent(true);
      setSentEmail(values.email);
    } catch {
      setServerError(t('forgotPassword.errors.sendFailed'));
    }
  };

  return (
    <Card className="border-0 shadow-none lg:border lg:shadow-sm">
      <CardHeader className="space-y-1 px-0 lg:px-6">
        <CardTitle className="text-2xl font-bold">
          {t('forgotPassword.title')}
        </CardTitle>
        <CardDescription>{t('forgotPassword.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="px-0 lg:px-6">
        {sent ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-md bg-success/10 p-4 text-sm text-success">
              <CheckCircle2 className="size-5 mt-0.5 shrink-0" />
              <span>{t('forgotPassword.success')}</span>
            </div>
            <Button
              variant="gradient"
              className="w-full"
              onClick={() => onSwitchToReset(sentEmail)}
            >
              {t('forgotPassword.enterCode')}
            </Button>
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="block w-full text-center text-sm font-medium text-primary hover:underline"
            >
              {t('forgotPassword.backToLogin')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {serverError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {serverError}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="forgot-email">{t('forgotPassword.email')}</Label>
              <Input
                id="forgot-email"
                type="email"
                placeholder={t('forgotPassword.emailPlaceholder')}
                autoComplete="email"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <Button
              type="submit"
              variant="gradient"
              className="w-full"
              loading={isSubmitting}
            >
              {isSubmitting
                ? t('forgotPassword.submitting')
                : t('forgotPassword.submit')}
            </Button>

            <button
              type="button"
              onClick={onSwitchToLogin}
              className="block w-full text-center text-sm font-medium text-primary hover:underline"
            >
              {t('forgotPassword.backToLogin')}
            </button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
