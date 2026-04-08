import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import {
  LayoutDashboard,
  CalendarRange,
  Clock,
  School,
  BookOpen,
  Users,
  Link2,
  Bell,
  Eye,
  Settings,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/cn';
import { useAppSelector, useAppDispatch } from '@/app/hooks';
import { loggedOut } from '@/features/auth/authSlice';
import { mockLogout } from '@/lib/mock-auth';

interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NAV_ITEMS = [
  { key: 'dashboard', to: '/', icon: LayoutDashboard },
  { key: 'academicYears', to: '/academic-years', icon: CalendarRange },
  { key: 'periodStructures', to: '/period-structures', icon: Clock },
  { key: 'classes', to: '/classes', icon: School },
  { key: 'subjects', to: '/subjects', icon: BookOpen },
  { key: 'teachers', to: '/teachers', icon: Users },
  { key: 'electiveGroups', to: '/elective-groups', icon: Link2 },
  { key: 'notifications', to: '/notifications', icon: Bell },
  { key: 'teacherTimetable', to: '/teacher-timetable', icon: Eye },
  { key: 'settings', to: '/settings', icon: Settings },
] as const;

export function MobileDrawer({ open, onOpenChange }: MobileDrawerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { email, schoolName } = useAppSelector((s) => s.auth);

  const handleLogout = () => {
    mockLogout();
    dispatch(loggedOut());
    onOpenChange(false);
    navigate('/login');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-72 p-0 bg-gradient-to-b from-primary to-secondary"
      >
        <SheetHeader className="p-4 pb-2">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-white/20 font-bold text-white text-sm">
              ST
            </div>
            <SheetTitle className="text-white">{t('appName')}</SheetTitle>
          </div>
        </SheetHeader>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              onClick={() => onOpenChange(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )
              }
            >
              <item.icon className="size-5 shrink-0" />
              <span>{t(`nav.${item.key}`)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto p-4 pt-2">
          <Separator className="mb-3 bg-white/20" />
          {(schoolName || email) && (
            <div className="mb-3 px-1">
              {schoolName && (
                <p className="text-sm font-medium text-white truncate">{schoolName}</p>
              )}
              {email && (
                <p className="text-xs text-white/60 truncate">{email}</p>
              )}
            </div>
          )}
          <Button
            variant="ghost"
            className="w-full justify-start text-white/70 hover:text-white hover:bg-white/10"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 size-4" />
            {t('actions.logout')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
