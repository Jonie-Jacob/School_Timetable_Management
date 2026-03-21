import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { School, CalendarDays, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function QuickLinks() {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();

  const links = [
    { label: t('quickLinks.manageClasses'), to: '/classes', icon: School },
    { label: t('quickLinks.generateTimetables'), to: '/teacher-timetable', icon: CalendarDays },
    { label: t('quickLinks.teacherView'), to: '/teacher-timetable', icon: Eye },
  ];

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{t('quickLinks.title')}</h2>
      <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-3">
        {links.map((link) => (
          <Button
            key={link.label}
            variant="outline"
            className="h-auto justify-start gap-3 p-4"
            onClick={() => navigate(link.to)}
          >
            <link.icon className="size-5 text-primary shrink-0" />
            <span className="text-sm font-medium">{link.label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
