import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SidebarLinkProps {
  to: string;
  icon: LucideIcon;
  iconColor?: string;
  label: string;
  collapsed?: boolean;
  badge?: number;
  onClick?: () => void;
}

export function SidebarLink({
  to,
  icon: Icon,
  iconColor,
  label,
  collapsed = false,
  badge,
  onClick,
}: SidebarLinkProps) {
  const link = (
    <NavLink
      to={to}
      onClick={onClick}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
          collapsed ? 'justify-center px-2' : '',
          isActive
            ? 'bg-amber-500/10 text-amber-400 border-l-[3px] border-amber-500 ml-0 pl-[calc(0.75rem-3px)]'
            : 'text-stone-400 hover:bg-white/5 hover:text-stone-200'
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('size-5 shrink-0', isActive ? 'text-amber-400' : iconColor)} />
          {!collapsed && (
            <>
              <span className="flex-1 truncate">{label}</span>
              {badge != null && badge > 0 && (
                <Badge variant="destructive" className="ml-auto size-5 justify-center p-0 text-[10px]">
                  {badge > 99 ? '99+' : badge}
                </Badge>
              )}
            </>
          )}
        </>
      )}
    </NavLink>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return link;
}
