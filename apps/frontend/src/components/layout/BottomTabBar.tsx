import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, School, CalendarCheck, Bell, MoreHorizontal } from 'lucide-react';
import { BottomTabItem } from './BottomTabItem';
import { MoreSheet } from './MoreSheet';

export function BottomTabBar() {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav className="fixed bottom-0 inset-x-0 z-50 flex lg:hidden items-center border-t border-border/50 backdrop-blur-xl bg-background/80 safe-bottom">
        <BottomTabItem
          to="/"
          icon={LayoutDashboard}
          label={t('nav.dashboard')}
        />
        <BottomTabItem
          to="/classes"
          icon={School}
          label={t('nav.classes')}
        />
        <BottomTabItem
          to="/timetables"
          icon={CalendarCheck}
          label={t('nav.timetables')}
        />
        <BottomTabItem
          to="/notifications"
          icon={Bell}
          label={t('nav.notifications')}
        />
        <BottomTabItem
          icon={MoreHorizontal}
          label={t('nav.more')}
          onClick={() => setMoreOpen(true)}
        />
      </nav>

      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
}
