import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SubjectRow, TeacherRow } from './types';

interface SubjectOption {
  id: string;
  name: string;
  abbreviation?: string | null;
}

interface TeacherOption {
  id: string;
  name: string;
  qualifiedSubjectIds: string[];
  assignedPeriods: number;
  maxPeriodsPerWeek: number | null;
}

interface Props {
  subjects: SubjectRow[];
  onChange: (subjects: SubjectRow[]) => void;
  allSubjects: SubjectOption[];
  allTeachers: TeacherOption[];
  periodsPerWeek: number;
}

export function SubjectsSection({ subjects, onChange, allSubjects, allTeachers, periodsPerWeek }: Props) {
  const selectedSubjectIds = new Set(subjects.map(s => s.subjectId));

  const toggleSubject = (subjectId: string, checked: boolean) => {
    if (checked) {
      onChange([...subjects, { subjectId, parallelSections: 1, teachers: [{ teacherId: '', assistantTeacherId: '', weightage: periodsPerWeek }] }]);
    } else {
      onChange(subjects.filter(s => s.subjectId !== subjectId));
    }
  };

  const updateSubject = (index: number, updates: Partial<SubjectRow>) => {
    const next = [...subjects];
    next[index] = { ...next[index], ...updates };
    onChange(next);
  };

  const addTeacher = (subjectIndex: number) => {
    const next = [...subjects];
    next[subjectIndex] = {
      ...next[subjectIndex],
      teachers: [...next[subjectIndex].teachers, { teacherId: '', assistantTeacherId: '', weightage: 1 }],
    };
    onChange(next);
  };

  const removeTeacher = (subjectIndex: number, teacherIndex: number) => {
    const next = [...subjects];
    next[subjectIndex] = {
      ...next[subjectIndex],
      teachers: next[subjectIndex].teachers.filter((_, i) => i !== teacherIndex),
    };
    onChange(next);
  };

  const updateTeacher = (subjectIndex: number, teacherIndex: number, updates: Partial<TeacherRow>) => {
    const next = [...subjects];
    const teachers = [...next[subjectIndex].teachers];
    teachers[teacherIndex] = { ...teachers[teacherIndex], ...updates };
    next[subjectIndex] = { ...next[subjectIndex], teachers };
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Subjects & Teachers</h3>
      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
        {allSubjects.map((subj) => {
          const isSelected = selectedSubjectIds.has(subj.id);
          const subjectIndex = subjects.findIndex(s => s.subjectId === subj.id);
          const subjectRow = subjectIndex >= 0 ? subjects[subjectIndex] : null;

          return (
            <div key={subj.id} className="border rounded-lg p-2.5 space-y-2">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => toggleSubject(subj.id, !!checked)}
                />
                <span className="text-sm font-medium flex-1">{subj.name}</span>
                {isSelected && subjectRow && (
                  <>
                    <div className="flex items-center gap-1.5">
                      <Label className="text-[10px] text-muted-foreground">Sections</Label>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        className="w-14 h-7 text-xs"
                        value={subjectRow.parallelSections}
                        onChange={(e) => updateSubject(subjectIndex, { parallelSections: parseInt(e.target.value) || 1 })}
                      />
                    </div>
                    <ModeBadge teachers={subjectRow.teachers.length} ps={subjectRow.parallelSections} />
                  </>
                )}
              </div>

              {isSelected && subjectRow && (
                <div className="ml-6 space-y-1.5">
                  {subjectRow.teachers.map((teacher, tIdx) => (
                    <TeacherRowComponent
                      key={tIdx}
                      teacher={teacher}
                      subjectId={subj.id}
                      allTeachers={allTeachers}
                      selectedTeacherIds={subjectRow.teachers.map(t => t.teacherId).filter(Boolean)}
                      onChange={(updates) => updateTeacher(subjectIndex, tIdx, updates)}
                      onRemove={subjectRow.teachers.length > 1 ? () => removeTeacher(subjectIndex, tIdx) : undefined}
                    />
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-muted-foreground"
                    onClick={() => addTeacher(subjectIndex)}
                  >
                    <Plus className="size-3 mr-1" /> Add Teacher
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ModeBadge({ teachers, ps }: { teachers: number; ps: number }) {
  if (teachers <= ps) {
    return <Badge variant="secondary" className="text-[9px] bg-green-100 text-green-800">Parallel</Badge>;
  }
  return <Badge variant="secondary" className="text-[9px] bg-orange-100 text-orange-800">Split</Badge>;
}

function TeacherRowComponent({
  teacher,
  subjectId,
  allTeachers,
  selectedTeacherIds,
  onChange,
  onRemove,
}: {
  teacher: TeacherRow;
  subjectId: string;
  allTeachers: { id: string; name: string; qualifiedSubjectIds: string[]; assignedPeriods: number; maxPeriodsPerWeek: number | null }[];
  selectedTeacherIds: string[];
  onChange: (updates: Partial<TeacherRow>) => void;
  onRemove?: () => void;
}) {
  const qualifiedTeachers = useMemo(
    () => allTeachers.filter(t => t.qualifiedSubjectIds.includes(subjectId)),
    [allTeachers, subjectId],
  );

  return (
    <div className="flex items-center gap-2 bg-muted/30 rounded p-1.5">
      <Select value={teacher.teacherId || undefined} onValueChange={(val) => onChange({ teacherId: val })}>
        <SelectTrigger className="h-7 text-xs flex-1 min-w-[140px]">
          <SelectValue placeholder="Select teacher" />
        </SelectTrigger>
        <SelectContent>
          {qualifiedTeachers.map((t) => (
            <SelectItem
              key={t.id}
              value={t.id}
              disabled={selectedTeacherIds.includes(t.id) && t.id !== teacher.teacherId}
            >
              <span className="flex items-center gap-1.5">
                {t.name}
                <span className="text-[10px] text-muted-foreground">
                  {t.assignedPeriods}/{t.maxPeriodsPerWeek ?? '∞'}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={teacher.assistantTeacherId || undefined} onValueChange={(val) => onChange({ assistantTeacherId: val === '_none' ? '' : val })}>
        <SelectTrigger className="h-7 text-xs flex-1 min-w-[120px]">
          <SelectValue placeholder="Asst (optional)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_none">None</SelectItem>
          {allTeachers
            .filter(t => t.id !== teacher.teacherId)
            .map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>

      <Input
        type="number"
        min={1}
        className="w-14 h-7 text-xs"
        value={teacher.weightage}
        onChange={(e) => onChange({ weightage: parseInt(e.target.value) || 1 })}
        title="Weightage"
      />

      {onRemove && (
        <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onRemove}>
          <Trash2 className="size-3 text-destructive" />
        </Button>
      )}
    </div>
  );
}
