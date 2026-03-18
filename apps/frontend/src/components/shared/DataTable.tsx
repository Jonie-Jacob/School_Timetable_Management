import { type ReactNode, useState } from 'react';
import {
  type ColumnDef,
  type PaginationState,
  type SortingState,
  type Table as TanstackTable,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { DataTableCardView } from './DataTableCardView';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  emptyIcon?: React.ComponentType<{ className?: string }>;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  pagination?: PaginationState;
  pageCount?: number;
  onPaginationChange?: (pagination: PaginationState) => void;
  renderCard?: (item: TData, index: number) => ReactNode;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
  pagination,
  pageCount,
  onPaginationChange,
  renderCard,
}: DataTableProps<TData, TValue>) {
  const { t } = useTranslation();
  const isDesktop = useBreakpoint('lg');
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      ...(pagination ? { pagination } : {}),
    },
    onSortingChange: setSorting,
    ...(pagination && onPaginationChange
      ? {
          onPaginationChange: (updater) => {
            const next =
              typeof updater === 'function' ? updater(pagination) : updater;
            onPaginationChange(next);
          },
          manualPagination: true,
          pageCount: pageCount ?? -1,
        }
      : {}),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Loading state — skeleton rows
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  // Empty state
  if (!data.length) {
    return (
      <EmptyState
        icon={emptyIcon as never}
        title={emptyTitle ?? t('status.empty')}
        description={emptyDescription}
      >
        {emptyAction}
      </EmptyState>
    );
  }

  // Mobile card view
  if (!isDesktop && renderCard) {
    return (
      <div className="space-y-4">
        <DataTableCardView data={data} renderCard={renderCard} />
        {pagination && onPaginationChange && (
          <PaginationControls table={table} pagination={pagination} />
        )}
      </div>
    );
  }

  // Desktop table view
  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-8"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {header.column.getIsSorted() === 'asc' ? (
                          <ArrowUp className="ml-1 size-3.5" />
                        ) : header.column.getIsSorted() === 'desc' ? (
                          <ArrowDown className="ml-1 size-3.5" />
                        ) : (
                          <ArrowUpDown className="ml-1 size-3.5 opacity-50" />
                        )}
                      </Button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pagination && onPaginationChange && (
        <PaginationControls table={table} pagination={pagination} />
      )}
    </div>
  );
}

function PaginationControls<TData>({
  table,
  pagination,
}: {
  table: TanstackTable<TData>;
  pagination: PaginationState;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between px-2">
      <p className="text-sm text-muted-foreground">
        {t('pagination.page')} {pagination.pageIndex + 1}
        {table.getPageCount() > 0 && ` ${t('pagination.of')} ${table.getPageCount()}`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          {t('pagination.previous')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          {t('pagination.next')}
        </Button>
      </div>
    </div>
  );
}
