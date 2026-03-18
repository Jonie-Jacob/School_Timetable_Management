import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface DataTableCardViewProps<TData> {
  data: TData[];
  renderCard: (item: TData, index: number) => ReactNode;
}

export function DataTableCardView<TData>({
  data,
  renderCard,
}: DataTableCardViewProps<TData>) {
  return (
    <div className="grid gap-3">
      {data.map((item, index) => (
        <Card key={index}>
          <CardContent className="p-4">{renderCard(item, index)}</CardContent>
        </Card>
      ))}
    </div>
  );
}
