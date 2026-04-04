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
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const PAGE_SIZE_OPTIONS = [10, 25, 50];

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
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Loading state — skeleton rows
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
        <div className="space-y-0">
          <Skeleton className="h-10 w-full rounded-none" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-none" />
          ))}
        </div>
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
          <PaginationControls table={table} pagination={pagination} onPaginationChange={onPaginationChange} />
        )}
      </div>
    );
  }

  // Desktop table view
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent border-border/40">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="relative group"
                  >
                    <div className="flex items-center">
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-ml-2 h-7 text-xs uppercase tracking-wider font-semibold"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {header.column.getIsSorted() === 'asc' ? (
                            <ArrowUp className="ml-1 size-3" />
                          ) : header.column.getIsSorted() === 'desc' ? (
                            <ArrowDown className="ml-1 size-3" />
                          ) : (
                            <ArrowUpDown className="ml-1 size-3 opacity-40" />
                          )}
                        </Button>
                      ) : (
                        <span className="text-xs uppercase tracking-wider font-semibold">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                        </span>
                      )}
                    </div>
                    {/* Column resize handle */}
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none transition-colors ${
                          header.column.getIsResizing()
                            ? 'bg-amber-500'
                            : 'bg-transparent group-hover:bg-border'
                        }`}
                      />
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
                  <TableCell key={cell.id} style={{ width: cell.column.getSize() }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pagination && onPaginationChange && (
        <PaginationControls table={table} pagination={pagination} onPaginationChange={onPaginationChange} />
      )}
    </div>
  );
}

function PaginationControls<TData>({
  table,
  pagination,
  onPaginationChange,
}: {
  table: TanstackTable<TData>;
  pagination: PaginationState;
  onPaginationChange: (pagination: PaginationState) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm px-4 py-2.5">
      {/* Page size selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page</span>
        <Select
          value={String(pagination.pageSize)}
          onValueChange={(val) => {
            onPaginationChange({ pageIndex: 0, pageSize: Number(val) });
          }}
        >
          <SelectTrigger className="h-7 w-16 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)} className="text-xs">
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Page indicator */}
      <p className="text-xs text-muted-foreground tabular-nums">
        {t('pagination.page')} {pagination.pageIndex + 1}
        {table.getPageCount() > 0 && ` ${t('pagination.of')} ${table.getPageCount()}`}
      </p>

      {/* Navigation buttons */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
