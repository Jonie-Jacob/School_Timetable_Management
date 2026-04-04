import { useEffect, useState, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
  /** Use 'dark' when placed inside a dark container like PageHeader */
  variant?: 'default' | 'dark';
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  debounceMs = 300,
  className,
  variant = 'default',
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue);
      }
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [localValue, debounceMs, onChange, value]);

  const handleClear = useCallback(() => {
    setLocalValue('');
    onChange('');
  }, [onChange]);

  const isDark = variant === 'dark';

  return (
    <div className={cn('relative', className)}>
      <Search className={cn(
        'absolute left-2.5 top-1/2 size-4 -translate-y-1/2',
        isDark ? 'text-white/40' : 'text-muted-foreground',
      )} />
      <Input
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'pl-9 pr-8',
          isDark && 'bg-white/10 border-white/20 text-white placeholder:text-white/40 focus-visible:border-amber-500/50 focus-visible:ring-amber-500/20',
        )}
      />
      {localValue && (
        <Button
          variant="ghost"
          size="icon-xs"
          className={cn(
            'absolute right-1.5 top-1/2 -translate-y-1/2',
            isDark && 'text-white/40 hover:text-white hover:bg-white/10',
          )}
          onClick={handleClear}
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
