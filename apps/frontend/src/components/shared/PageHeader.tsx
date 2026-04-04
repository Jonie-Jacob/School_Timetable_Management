import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl bg-sidebar text-sidebar-foreground px-5 py-4 shadow-sm">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-white/60 mt-0.5">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
