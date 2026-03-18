import { useState, useCallback, useMemo } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  maxDisplay?: number;
  className?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Select items...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No items found.',
  disabled = false,
  maxDisplay = 3,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);

  const selectedLabels = useMemo(() => {
    return value
      .map((v) => options.find((o) => o.value === v)?.label)
      .filter(Boolean) as string[];
  }, [value, options]);

  const handleSelect = useCallback(
    (itemValue: string) => {
      if (value.includes(itemValue)) {
        onChange(value.filter((v) => v !== itemValue));
      } else {
        onChange([...value, itemValue]);
      }
    },
    [value, onChange]
  );

  const handleRemove = useCallback(
    (itemValue: string) => {
      onChange(value.filter((v) => v !== itemValue));
    },
    [value, onChange]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'min-h-9 w-full justify-between font-normal',
            !value.length && 'text-muted-foreground',
            className
          )}
        >
          <div className="flex flex-1 flex-wrap gap-1">
            {value.length === 0 ? (
              placeholder
            ) : (
              <>
                {selectedLabels.slice(0, maxDisplay).map((label, i) => (
                  <Badge
                    key={value[i]}
                    variant="secondary"
                    className="gap-0.5 px-1.5"
                  >
                    {label}
                    <button
                      type="button"
                      className="ml-0.5 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(value[i]);
                      }}
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
                {selectedLabels.length > maxDisplay && (
                  <Badge variant="outline" className="px-1.5">
                    +{selectedLabels.length - maxDisplay} more
                  </Badge>
                )}
              </>
            )}
          </div>
          <ChevronsUpDown className="ml-1 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => handleSelect(option.value)}
                >
                  <div
                    className={cn(
                      'mr-2 flex size-4 items-center justify-center rounded-sm border border-primary',
                      value.includes(option.value)
                        ? 'bg-primary text-primary-foreground'
                        : 'opacity-50'
                    )}
                  >
                    {value.includes(option.value) && (
                      <Check className="size-3" />
                    )}
                  </div>
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
