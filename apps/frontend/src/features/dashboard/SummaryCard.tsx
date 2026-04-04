import { type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

interface SummaryCardProps {
  icon: LucideIcon;
  label: string;
  count: number;
  to: string;
  iconColor?: string;
  iconBg?: string;
}

export function SummaryCard({ icon: Icon, label, count, to, iconColor = 'text-amber-600 dark:text-amber-400', iconBg = 'bg-amber-500/10' }: SummaryCardProps) {
  const navigate = useNavigate();

  return (
    <div
      className="group relative cursor-pointer rounded-xl border border-border/50 bg-card backdrop-blur-sm p-5 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/5 hover:border-amber-500/20 hover:-translate-y-0.5"
      onClick={() => navigate(to)}
    >
      <div className="flex items-center gap-4">
        <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${iconBg} transition-colors`}>
          <Icon className={`size-5 ${iconColor}`} />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums tracking-tight">{count.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground truncate uppercase tracking-wide font-medium">{label}</p>
        </div>
      </div>
    </div>
  );
}

export function SummaryCardSkeleton() {
  return (
    <div className="rounded-xl border border-border/50 bg-card backdrop-blur-sm p-5">
      <div className="flex items-center gap-4">
        <Skeleton className="size-11 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </div>
  );
}
