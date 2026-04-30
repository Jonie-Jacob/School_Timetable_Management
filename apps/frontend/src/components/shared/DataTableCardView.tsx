import type { ReactNode } from 'react';

interface DataTableCardViewProps<TData> {
  data: TData[];
  renderCard: (item: TData, index: number) => ReactNode;
}

export function DataTableCardView<TData>({
  data,
  renderCard,
}: DataTableCardViewProps<TData>) {
  return (
    <div className="space-y-2">
      {data.map((item, index) => renderCard(item, index))}
    </div>
  );
}
