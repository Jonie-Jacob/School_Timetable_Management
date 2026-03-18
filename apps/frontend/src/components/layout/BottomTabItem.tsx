import { type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/badge';

interface BottomTabItemProps {
  to?: string;
  icon: LucideIcon;
  label: string;
  badge?: number;
  onClick?: () => void;
}

export function BottomTabItem({ to, icon: Icon, label, badge, onClick }: BottomTabItemProps) {
  const content = (isActive = false) => (
    <div className="flex flex-col items-center gap-0.5 relative">
      <div className="relative">
        <Icon className={cn('size-5', isActive ? 'text-primary' : 'text-muted-foreground')} />
        {badge != null && badge > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-2 -right-3 size-4 justify-center p-0 text-[10px]"
          >
            {badge > 99 ? '99+' : badge}
          </Badge>
        )}
      </div>
      <span
        className={cn(
          'text-[10px] leading-tight',
          isActive ? 'text-primary font-medium' : 'text-muted-foreground'
        )}
      >
        {label}
      </span>
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex-1 flex items-center justify-center py-2"
      >
        {content()}
      </button>
    );
  }

  return (
    <NavLink
      to={to!}
      className="flex-1 flex items-center justify-center py-2"
    >
      {({ isActive }) => content(isActive)}
    </NavLink>
  );
}
