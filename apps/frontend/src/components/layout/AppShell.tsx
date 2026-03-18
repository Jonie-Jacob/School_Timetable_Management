import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { Breadcrumb } from './Breadcrumb';
import { ReadOnlyBanner } from './ReadOnlyBanner';
import { MobileHeader } from './MobileHeader';
import { BottomTabBar } from './BottomTabBar';
import { FeatureErrorBoundary } from '@/components/shared';

export function AppShell() {
  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Desktop Sidebar — hidden at sm/md */}
      <Sidebar />

      {/* Main column */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Desktop TopBar — hidden at sm/md */}
        <TopBar />

        {/* Mobile Header — visible at sm/md */}
        <MobileHeader />

        {/* Read-only banner */}
        <ReadOnlyBanner />

        {/* Breadcrumb — desktop only */}
        <div className="hidden lg:block">
          <Breadcrumb />
        </div>

        {/* Content area */}
        <main className="flex-1 overflow-auto p-4 lg:p-6 pb-20 lg:pb-6">
          <FeatureErrorBoundary>
            <Outlet />
          </FeatureErrorBoundary>
        </main>
      </div>

      {/* Mobile Bottom Tab Bar — visible at sm/md */}
      <BottomTabBar />
    </div>
  );
}
