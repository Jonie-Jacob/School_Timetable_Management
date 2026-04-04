import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  CalendarRange,
  BookOpen,
  Users,
  Link2,
  Eye,
  Settings,
  Clock,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface MoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MORE_ITEMS = [
  { key: 'academicYears', to: '/academic-years', icon: CalendarRange },
  { key: 'periodStructures', to: '/period-structures', icon: Clock },
  { key: 'subjects', to: '/subjects', icon: BookOpen },
  { key: 'teachers', to: '/teachers', icon: Users },
  { key: 'electiveGroups', to: '/elective-groups', icon: Link2 },
  { key: 'teacherTimetable', to: '/teacher-timetable', icon: Eye },
  { key: 'settings', to: '/settings', icon: Settings },
] as const;
// Note: Mobile BottomTabBar has: Dashboard, Classes, Timetable, Notifications, More
// "More" sheet shows the rest. Order follows the user data-entry flow.

export function MoreSheet({ open, onOpenChange }: MoreSheetProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{t('nav.more')}</SheetTitle>
        </SheetHeader>
        <nav className="grid grid-cols-3 gap-4 py-4">
          {MORE_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                navigate(item.to);
                onOpenChange(false);
              }}
              className="flex flex-col items-center gap-2 rounded-lg p-3 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <item.icon className="size-6" />
              <span className="text-xs font-medium text-center">
                {t(`nav.${item.key}`)}
              </span>
            </button>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
