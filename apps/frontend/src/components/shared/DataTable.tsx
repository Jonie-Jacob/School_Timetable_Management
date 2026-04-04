import { type ReactNode, useState, useEffect, useCallback } from 'react';
import {
  type ColumnDef,
  type ColumnSizingState,
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
  totalCount?: number;
  onPaginationChange?: (pagination: PaginationState) => void;
  renderCard?: (item: TData, index: number) => ReactNode;
  /** Unique key for persisting column sizes in localStorage */
  storageKey?: string;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50];

function loadColumnSizing(key: string): ColumnSizingState {
  try {
    const stored = localStorage.getItem(`dt-cols-${key}`);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveColumnSizing(key: string, sizing: ColumnSizingState) {
  try {
    localStorage.setItem(`dt-cols-${key}`, JSON.stringify(sizing));
  } catch {
    // Ignore storage errors
  }
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
  totalCount,
  onPaginationChange,
  renderCard,
  storageKey,
}: DataTableProps<TData, TValue>) {
  const { t } = useTranslation();
  const isDesktop = useBreakpoint('lg');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(
    storageKey ? loadColumnSizing(storageKey) : {},
  );

  // Persist column sizes on change
  const handleColumnSizingChange = useCallback(
    (updater: ColumnSizingState | ((old: ColumnSizingState) => ColumnSizingState)) => {
      setColumnSizing((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        if (storageKey) saveColumnSizing(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnSizing,
      ...(pagination ? { pagination } : {}),
    },
    onSortingChange: setSorting,
    onColumnSizingChange: handleColumnSizingChange,
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

  if (!isDesktop && renderCard) {
    return (
      <div className="space-y-4">
        <DataTableCardView data={data} renderCard={renderCard} />
        {pagination && onPaginationChange && (
          <PaginationControls table={table} pagination={pagination} onPaginationChange={onPaginationChange} totalCount={totalCount} currentCount={data.length} />
        )}
      </div>
    );
  }

  return (
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
                        className="-ml-2 h-7 text-xs uppercase tracking-wider font-semibold text-white/80 hover:text-white hover:bg-white/10"
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
                      <span className="text-xs uppercase tracking-wider font-semibold text-white/80">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                      </span>
                    )}
                  </div>
                  {header.column.getCanResize() && (
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none transition-colors ${
                        header.column.getIsResizing()
                          ? 'bg-amber-500'
                          : 'bg-transparent group-hover:bg-white/20'
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

      {pagination && onPaginationChange && (
        <PaginationControls table={table} pagination={pagination} onPaginationChange={onPaginationChange} totalCount={totalCount} currentCount={data.length} />
      )}
    </div>
  );
}

function PaginationControls<TData>({
  table,
  pagination,
  onPaginationChange,
  totalCount,
  currentCount,
}: {
  table: TanstackTable<TData>;
  pagination: PaginationState;
  onPaginationChange: (pagination: PaginationState) => void;
  totalCount?: number;
  currentCount: number;
}) {
  const { t } = useTranslation();

  const from = pagination.pageIndex * pagination.pageSize + 1;
  const to = from + currentCount - 1;

  return (
    <div className="flex items-center justify-between bg-sidebar text-sidebar-foreground px-4 py-2.5">
      {/* Left: entries info + page size */}
      <div className="flex items-center gap-3">
        {totalCount != null && (
          <span className="text-xs text-white/50 tabular-nums whitespace-nowrap">
            {from}–{to} of {totalCount}
          </span>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-white/40 whitespace-nowrap">Rows</span>
          <Select
            value={String(pagination.pageSize)}
            onValueChange={(val) => {
              onPaginationChange({ pageIndex: 0, pageSize: Number(val) });
            }}
          >
            <SelectTrigger className="h-6 w-[60px] text-xs border-white/20 bg-white/10 text-white">
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
      </div>

      {/* Right: page count + nav buttons */}
      <div className="flex items-center gap-2">
        <p className="text-xs text-white/50 tabular-nums">
          {t('pagination.page')} {pagination.pageIndex + 1}
          {table.getPageCount() > 0 && ` ${t('pagination.of')} ${table.getPageCount()}`}
        </p>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-white/60 hover:text-white hover:bg-white/10"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-white/60 hover:text-white hover:bg-white/10"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
