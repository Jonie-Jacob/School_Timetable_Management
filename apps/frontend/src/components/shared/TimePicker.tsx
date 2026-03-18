import { cn } from '@/lib/cn';
import { Input } from '@/components/ui/input';

interface TimePickerProps {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function TimePicker({
  value = '',
  onChange,
  disabled = false,
  className,
}: TimePickerProps) {
  return (
    <Input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn('w-auto', className)}
    />
  );
}
