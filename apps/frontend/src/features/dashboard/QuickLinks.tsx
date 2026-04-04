import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { School, CalendarDays, Eye, ArrowRight } from 'lucide-react';

export function QuickLinks() {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();

  const links = [
    { label: t('quickLinks.manageClasses'), to: '/classes', icon: School, color: 'text-violet-500' },
    { label: t('quickLinks.generateTimetables'), to: '/teacher-timetable', icon: CalendarDays, color: 'text-teal-500' },
    { label: t('quickLinks.teacherView'), to: '/teacher-timetable', icon: Eye, color: 'text-cyan-500' },
  ];

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">{t('quickLinks.title')}</h2>
      <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-3">
        {links.map((link) => (
          <button
            key={link.label}
            type="button"
            className="group flex items-center gap-3 rounded-xl border border-border/50 bg-card backdrop-blur-sm p-4 text-left transition-all duration-200 hover:border-amber-500/20 hover:shadow-sm hover:-translate-y-0.5"
            onClick={() => navigate(link.to)}
          >
            <link.icon className={`size-5 ${link.color} shrink-0`} />
            <span className="text-sm font-medium flex-1">{link.label}</span>
            <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
      </div>
    </div>
  );
}
