import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, CalendarDays } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetTeachersQuery } from '@/features/teachers/teacherApi';

export function Component() {
  const { t } = useTranslation();
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');

  const { data: teachersData, isLoading: teachersLoading } = useGetTeachersQuery({ pageSize: 200 });
  const teachers = teachersData?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teacher Timetable"
        description="View weekly timetable for a selected teacher."
        actions={
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Select Teacher</Label>
            <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
              <SelectTrigger className="w-48 h-8 text-sm">
                <SelectValue placeholder="Choose teacher..." />
              </SelectTrigger>
              <SelectContent>
                {teachers.map((teacher) => (
                  <SelectItem key={teacher.id} value={teacher.id} className="text-sm">
                    {teacher.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {teachersLoading && (
        <Skeleton className="h-64 rounded-xl" />
      )}

      {!teachersLoading && !selectedTeacherId && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-amber-500/20 bg-amber-500/5 backdrop-blur-sm p-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 mb-4">
            <Eye className="size-7" />
          </div>
          <h3 className="text-lg font-semibold">Select a teacher</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md">
            Choose a teacher from the dropdown above to view their weekly timetable.
          </p>
        </div>
      )}

      {!teachersLoading && selectedTeacherId && (
        <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-6 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 mb-4 mx-auto">
            <CalendarDays className="size-7" />
          </div>
          <h3 className="text-lg font-semibold">
            {teachers.find((t) => t.id === selectedTeacherId)?.name ?? 'Teacher'}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Timetable grid view will be available once timetables are generated for the divisions this teacher is assigned to.
          </p>
          <p className="mt-4 text-xs text-muted-foreground/60">
            This view will show the full weekly schedule with period slots, assigned classes/divisions, and subjects.
          </p>
        </div>
      )}
    </div>
  );
}
