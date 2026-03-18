import { Badge } from '@/components/ui/badge';

type StatusType =
  | 'active'
  | 'inactive'
  | 'archived'
  | 'generated'
  | 'outdated'
  | 'pending'
  | 'draft';

const statusConfig: Record<
  StatusType,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'info' | 'outline' | 'secondary' }
> = {
  active: { label: 'Active', variant: 'success' },
  inactive: { label: 'Inactive', variant: 'outline' },
  archived: { label: 'Archived', variant: 'secondary' },
  generated: { label: 'Generated', variant: 'info' },
  outdated: { label: 'Outdated', variant: 'warning' },
  pending: { label: 'Pending', variant: 'warning' },
  draft: { label: 'Draft', variant: 'outline' },
};

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}
