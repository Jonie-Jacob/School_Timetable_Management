import { useMemo } from 'react';
import { cn } from '@/lib/cn';

interface PasswordStrengthProps {
  password: string;
  className?: string;
}

function getStrength(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) return { score: 1, label: 'Weak' };
  if (score <= 2) return { score: 2, label: 'Fair' };
  if (score <= 3) return { score: 3, label: 'Good' };
  return { score: 4, label: 'Strong' };
}

const strengthColors: Record<number, string> = {
  1: 'bg-destructive',
  2: 'bg-warning',
  3: 'bg-info',
  4: 'bg-success',
};

const strengthTextColors: Record<number, string> = {
  1: 'text-destructive',
  2: 'text-warning',
  3: 'text-info',
  4: 'text-success',
};

export function PasswordStrength({
  password,
  className,
}: PasswordStrengthProps) {
  const { score, label } = useMemo(() => getStrength(password), [password]);

  if (!password) return null;

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              i < score ? strengthColors[score] : 'bg-muted'
            )}
          />
        ))}
      </div>
      <p className={cn('text-xs', strengthTextColors[score])}>{label}</p>
    </div>
  );
}
