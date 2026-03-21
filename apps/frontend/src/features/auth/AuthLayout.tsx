import { useTranslation } from 'react-i18next';
import { CalendarDays, Zap, Users } from 'lucide-react';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation('auth');

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left branding panel — desktop only */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center bg-gradient-to-br from-primary to-secondary p-12 text-white relative overflow-hidden">
        {/* Background decorative circles */}
        <div className="absolute -top-24 -left-24 size-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -right-32 size-[30rem] rounded-full bg-white/5" />

        <div className="relative z-10 max-w-md text-center space-y-8">
          <div className="flex items-center justify-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-white/20 font-bold text-white text-xl">
              ST
            </div>
            <h1 className="text-3xl font-bold">{t('common:appName')}</h1>
          </div>

          <p className="text-lg text-white/80">{t('branding.tagline')}</p>

          <div className="space-y-4 text-left">
            {[
              { icon: CalendarDays, text: t('branding.feature1') },
              { icon: Zap, text: t('branding.feature2') },
              { icon: Users, text: t('branding.feature3') },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="size-5" />
                </div>
                <span className="text-sm font-medium text-white/90">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 flex-col items-center justify-center p-6 lg:p-12">
        {/* Mobile logo — visible on sm/md */}
        <div className="flex lg:hidden items-center gap-2 mb-8">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary font-bold text-white text-lg">
            ST
          </div>
          <span className="text-xl font-bold text-foreground">
            {t('common:appName')}
          </span>
        </div>

        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
