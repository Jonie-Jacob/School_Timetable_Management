import { useState } from 'react';
import { UserPlus, Plus, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetClassesQuery } from '@/features/classes/classApi';
import { useGetSubjectsQuery } from '@/features/subjects/subjectApi';
import { useGetTeachersQuery } from '@/features/teachers/teacherApi';
import {
  useGetUnassignedSubjectsQuery,
  useQuickAssignMutation,
  type UnassignedTeacherSubject,
} from '@/features/assignments/assignmentApi';

export function Component() {
  const [filterSubjectId, setFilterSubjectId] = useState<string>('');
  const [filterTeacherId, setFilterTeacherId] = useState<string>('');

  const { data: unassigned, isLoading } = useGetUnassignedSubjectsQuery({
    subjectId: filterSubjectId || undefined,
    teacherId: filterTeacherId || undefined,
  });
  const { data: classes } = useGetClassesQuery();
  const { data: subjectsData } = useGetSubjectsQuery({ pageSize: 200 });
  const { data: teachersData } = useGetTeachersQuery({ pageSize: 200 });

  const subjects = subjectsData?.data ?? [];
  const teachers = teachersData?.data ?? [];

  // Flatten divisions from classes
  const allDivisions = (classes ?? []).flatMap((cls) =>
    (cls.divisions ?? []).map((div) => ({
      ...div,
      className: cls.name,
      classId: cls.id,
      displayName: `${cls.name} - Div ${div.label}${div.streamName ? ` (${div.streamName})` : ''}`,
    })),
  );

  const [assignTarget, setAssignTarget] = useState<UnassignedTeacherSubject | null>(null);
  const [selectedDivisionId, setSelectedDivisionId] = useState('');
  const [weightage, setWeightage] = useState(3);
  const [quickAssign, { isLoading: isAssigning }] = useQuickAssignMutation();

  const handleAssign = async () => {
    if (!assignTarget || !selectedDivisionId) return;
    try {
      const result = await quickAssign({
        teacherId: assignTarget.teacherId,
        subjectId: assignTarget.subjectId,
        divisionId: selectedDivisionId,
        weightage,
      }).unwrap();

      if (result.conflicts.length > 0) {
        toast.warning(
          `Assignment created with ${result.conflicts.length} conflict(s). Check notifications.`,
          { duration: 5000 }
        );
      } else {
        toast.success('Assignment created successfully');
      }
      setAssignTarget(null);
      setSelectedDivisionId('');
      setWeightage(3);
    } catch (err: any) {
      toast.error(err?.data?.error?.message || 'Failed to create assignment');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Unassigned Teacher Subjects"
        description={`Teacher-subject pairs with no division assignment${unassigned ? ` (${unassigned.length} found)` : ''}`}
      />

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Subject</Label>
          <Select value={filterSubjectId} onValueChange={setFilterSubjectId}>
            <SelectTrigger className="w-40 h-8 text-sm">
              <SelectValue placeholder="All subjects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-sm">All subjects</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-sm">{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Teacher</Label>
          <Select value={filterTeacherId} onValueChange={setFilterTeacherId}>
            <SelectTrigger className="w-40 h-8 text-sm">
              <SelectValue placeholder="All teachers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-sm">All teachers</SelectItem>
              {teachers.map((t) => (
                <SelectItem key={t.id} value={t.id} className="text-sm">{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {(filterSubjectId || filterTeacherId) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterSubjectId('');
              setFilterTeacherId('');
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      )}

      {!isLoading && (!unassigned || unassigned.length === 0) && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-500/20 bg-emerald-500/5 backdrop-blur-sm p-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 mb-4">
            <UserPlus className="size-7" />
          </div>
          <h3 className="text-lg font-semibold">All teacher subjects are assigned</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md">
            Every teacher-subject combination has at least one division assignment.
          </p>
        </div>
      )}

      {!isLoading && unassigned && unassigned.length > 0 && (
        <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800 text-white/90">
                <th className="h-10 px-4 text-left text-xs uppercase tracking-wider font-medium">Teacher</th>
                <th className="h-10 px-4 text-left text-xs uppercase tracking-wider font-medium">Subject</th>
                <th className="h-10 px-4 text-center text-xs uppercase tracking-wider font-medium w-32">Action</th>
              </tr>
            </thead>
            <tbody>
              {unassigned.map((item, idx) => (
                <tr
                  key={item.teacherSubjectId}
                  className={`border-b border-border/40 transition-[background-color] duration-300 ease-in-out hover:bg-rose-500/5 ${
                    idx % 2 === 1 ? 'bg-rose-500/[0.02]' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="size-2 rounded-full bg-rose-400" />
                      <span className="font-medium">{item.teacherName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs bg-rose-500/5 border-rose-500/20 text-rose-700">
                      {item.subjectName}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Button
                      variant="outline"
                      size="xs"
                      className="text-[11px] gap-1 border-rose-500/30 text-rose-600 hover:bg-rose-500/10"
                      onClick={() => setAssignTarget(item)}
                    >
                      <Plus className="size-3" />
                      Assign
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800 text-white">
                <td colSpan={3} className="px-4 py-2.5 text-xs text-white/60">
                  {unassigned.length} unassigned teacher-subject pair(s)
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Assign Dialog */}
      <Dialog open={!!assignTarget} onOpenChange={(open) => { if (!open) setAssignTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="size-5 text-rose-500" />
              Assign to Division
            </DialogTitle>
          </DialogHeader>
          {assignTarget && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                <div className="text-sm"><span className="text-muted-foreground">Teacher:</span> <strong>{assignTarget.teacherName}</strong></div>
                <div className="text-sm"><span className="text-muted-foreground">Subject:</span> <strong>{assignTarget.subjectName}</strong></div>
              </div>

              <div className="space-y-2">
                <Label>Division</Label>
                <Select value={selectedDivisionId} onValueChange={setSelectedDivisionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a division..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allDivisions.map((div) => (
                      <SelectItem key={div.id} value={div.id} className="text-sm">
                        <div className="flex items-center gap-2">
                          {div.displayName}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Periods per week (weightage)</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={weightage}
                  onChange={(e) => setWeightage(parseInt(e.target.value) || 1)}
                />
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-700">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <span>If this teacher has scheduling conflicts in the selected division, the assignment will still be created and a notification will be generated.</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)} disabled={isAssigning}>Cancel</Button>
            <Button
              onClick={handleAssign}
              disabled={!selectedDivisionId || isAssigning}
            >
              {isAssigning ? <Loader2 className="size-4 animate-spin mr-1" /> : <Plus className="size-4 mr-1" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
