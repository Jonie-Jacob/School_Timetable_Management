import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { Breadcrumb } from './Breadcrumb';
import { ReadOnlyBanner } from './ReadOnlyBanner';
import { MobileHeader } from './MobileHeader';
import { BottomTabBar } from './BottomTabBar';
import { FloatingActionButton } from './FloatingActionButton';
import { FeatureErrorBoundary } from '@/components/shared';

export function AppShell() {
  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Desktop Sidebar — hidden at sm/md */}
      <Sidebar />

      {/* Main column with warm gradient background */}
      <div className="flex flex-1 flex-col min-w-0 warm-gradient-bg overflow-hidden">
        {/* Animated background orbs */}
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />

        {/* Desktop TopBar — hidden at sm/md */}
        <div className="relative z-10">
          <TopBar />
        </div>

        {/* Mobile Header — visible at sm/md */}
        <div className="relative z-10">
          <MobileHeader />
        </div>

        {/* Read-only banner */}
        <div className="relative z-10">
          <ReadOnlyBanner />
        </div>

        {/* Breadcrumb — desktop only */}
        <div className="hidden lg:block relative z-10">
          <Breadcrumb />
        </div>

        {/* Content area */}
        <main className="relative z-10 flex-1 overflow-auto p-4 lg:p-6 pb-20 lg:pb-6">
          <FeatureErrorBoundary>
            <Outlet />
          </FeatureErrorBoundary>
        </main>
      </div>

      {/* Mobile Bottom Tab Bar — visible at sm/md */}
      <BottomTabBar />

      {/* Floating Action Button — setup wizard / conflict notifications */}
      <FloatingActionButton />
    </div>
  );
}
