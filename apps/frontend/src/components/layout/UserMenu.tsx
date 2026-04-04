import { LogOut, School } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '@/app/hooks';
import { loggedOut } from '@/features/auth/authSlice';
import { mockLogout } from '@/lib/mock-auth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function UserMenu() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { schoolName, email } = useAppSelector((state) => state.auth);

  const handleLogout = () => {
    mockLogout();
    dispatch(loggedOut());
    navigate('/login');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Avatar className="size-7">
            <AvatarFallback className="bg-amber-500/15 text-xs text-amber-700 dark:text-amber-400">
              {(schoolName?.[0] ?? 'S').toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="hidden xl:inline max-w-[120px] truncate text-sm">
            {schoolName ?? 'School'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{schoolName ?? 'School'}</p>
            <p className="text-xs text-muted-foreground">{email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="gap-2">
          <School className="size-4" />
          School Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="gap-2 text-destructive">
          <LogOut className="size-4" />
          Log Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
