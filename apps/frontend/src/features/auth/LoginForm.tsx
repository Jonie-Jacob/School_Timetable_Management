import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '@/app/hooks';
import { loggedIn } from './authSlice';
import { mockLogin } from '@/lib/mock-auth';
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

  const onSubmit = async (values: LoginValues) => {
    setServerError(null);
    try {
      const user = await mockLogin(values.email, values.password);
      dispatch(loggedIn(user));
      navigate('/', { replace: true });
    } catch {
      setServerError(t('login.errors.invalidCredentials'));
    }
  };

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
