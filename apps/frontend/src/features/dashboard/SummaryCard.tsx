import { type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface SummaryCardProps {
  icon: LucideIcon;
  label: string;
  count: number;
  to: string;
}

export function SummaryCard({ icon: Icon, label, count, to }: SummaryCardProps) {
  const navigate = useNavigate();

  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30 group"
      onClick={() => navigate(to)}
    >
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary/15 transition-colors">
          <Icon className="size-6" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums">{count.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground truncate">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function SummaryCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <Skeleton className="size-12 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}
