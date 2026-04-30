import { useState, useMemo, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared';
import { useGetClassesQuery } from '@/features/classes/classApi';
import { useGetSubjectsQuery } from '@/features/subjects/subjectApi';
import { useGetTeachersLoadQuery } from '@/features/teachers/teacherApi';
import {
  useBulkSaveElectiveGroupMutation,
  useDeleteElectiveGroupMutation,
  type GroupedElectiveGroup,
  type BulkSaveRequest,
} from '../electiveGroupApi';
import { GroupConfigSection } from './GroupConfigSection';
import { SubjectsSection } from './SubjectsSection';
import { DivisionParticipationSection } from './DivisionParticipationSection';
import { SchedulingPreferencesSection } from './SchedulingPreferencesSection';
import {
  type ElectiveGroupFormValues,
  EMPTY_FORM,
  serverPrefsToForm,
  formPrefsToServer,
} from './types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData: GroupedElectiveGroup | null; // null = create mode
}

export function ElectiveGroupEditorModal({ open, onOpenChange, initialData }: Props) {
  const isEdit = !!initialData;

  // ── Server data ──
  const { data: classesData } = useGetClassesQuery();
  const { data: subjectsData } = useGetSubjectsQuery({ pageSize: 200 });
  const { data: teacherLoads } = useGetTeachersLoadQuery();
  const [bulkSave, { isLoading: saving }] = useBulkSaveElectiveGroupMutation();
  const [deleteGroup, { isLoading: deleting }] = useDeleteElectiveGroupMutation();

  // ── Form state ──
  const [form, setForm] = useState<ElectiveGroupFormValues>({ ...EMPTY_FORM });
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Initialize form from initial data
  useEffect(() => {
    if (!open) return;
    if (initialData) {
      setForm({
        config: {
          name: initialData.config.name,
          periodsPerWeek: initialData.config.periodsPerWeek,
          type: initialData.type,
        },
        subjects: initialData.subjects.map(s => ({
          subjectId: s.subjectId,
          parallelSections: s.parallelSections,
          teachers: s.teachers.map(t => ({
            teacherId: t.teacherId ?? '',
            assistantTeacherId: t.assistantTeacherId ?? '',
            weightage: t.weightage,
          })),
        })),
        divisionParticipation: Object.fromEntries(
          initialData.divisions.map(d => [d.divisionId, d.subjectIds])
        ),
        defaultPrefs: serverPrefsToForm(initialData.defaultSchedulingPreferences),
        perDivisionOverrides: Object.fromEntries(
          initialData.divisions
            .filter(d => d.schedulingPreferences)
            .map(d => [d.divisionId, serverPrefsToForm(d.schedulingPreferences)])
        ),
      });
      // Set selected classes from divisions
      const classIds = [...new Set(initialData.divisions.map(d => d.classId))];
      setSelectedClassIds(classIds);
    } else {
      setForm({ ...EMPTY_FORM, config: { ...EMPTY_FORM.config } });
      setSelectedClassIds([]);
    }
  }, [open, initialData]);

  // ── Derived data ──
  const classes = useMemo(() => {
    return (classesData ?? []).map((c: any) => ({
      id: c.id as string,
      name: c.name as string,
      sortOrder: c.sortOrder as number,
      divisions: (c.divisions ?? []).map((d: any) => ({ id: d.id as string, label: d.label as string })),
    })).sort((a: any, b: any) => a.sortOrder - b.sortOrder);
  }, [classesData]);

  const allSubjects = useMemo(() => {
    return ((subjectsData as any)?.data ?? []).map((s: any) => ({
      id: s.id as string,
      name: s.name as string,
      abbreviation: s.abbreviation as string | null,
    })).sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [subjectsData]);

  const subjectNames = useMemo(() => {
    const map: Record<string, { name: string; abbr?: string | null }> = {};
    for (const s of allSubjects) map[s.id] = { name: s.name, abbr: s.abbreviation };
    return map;
  }, [allSubjects]);

  const allTeachers = useMemo(() => {
    return (teacherLoads ?? []).map(t => ({
      id: t.id,
      name: t.name,
      qualifiedSubjectIds: t.qualifiedSubjectIds ?? [],
      assignedPeriods: t.assignedPeriods,
      maxPeriodsPerWeek: t.maxPeriodsPerWeek,
    }));
  }, [teacherLoads]);

  const participatingDivisions = useMemo(() => {
    const divIds = Object.keys(form.divisionParticipation);
    const result: { divisionId: string; className: string; divisionLabel: string }[] = [];
    for (const cls of classes) {
      for (const div of cls.divisions) {
        if (divIds.includes(div.id)) {
          result.push({ divisionId: div.id, className: cls.name, divisionLabel: div.label });
        }
      }
    }
    return result;
  }, [form.divisionParticipation, classes]);

  // ── Handlers ──
  const updateConfig = useCallback((config: ElectiveGroupFormValues['config']) => {
    setForm(prev => ({ ...prev, config }));
  }, []);

  const updateSubjects = useCallback((subjects: ElectiveGroupFormValues['subjects']) => {
    setForm(prev => ({ ...prev, subjects }));
  }, []);

  const updateParticipation = useCallback((divisionParticipation: Record<string, string[]>) => {
    setForm(prev => ({ ...prev, divisionParticipation }));
  }, []);

  const updateDefaultPrefs = useCallback((defaultPrefs: ElectiveGroupFormValues['defaultPrefs']) => {
    setForm(prev => ({ ...prev, defaultPrefs }));
  }, []);

  const updateOverrides = useCallback((perDivisionOverrides: Record<string, ElectiveGroupFormValues['defaultPrefs'] | null>) => {
    setForm(prev => ({ ...prev, perDivisionOverrides }));
  }, []);

  const handleSave = async () => {
    // Validation
    if (!form.config.name.trim()) {
      toast.error('Group name is required');
      return;
    }
    if (form.subjects.length === 0) {
      toast.error('Select at least one subject');
      return;
    }
    if (Object.keys(form.divisionParticipation).length === 0) {
      toast.error('Select at least one division');
      return;
    }

    const request: BulkSaveRequest = {
      groupId: initialData?.underlyingGroupIds[0] ?? null,
      config: form.config,
      subjects: form.subjects.map(s => ({
        subjectId: s.subjectId,
        parallelSections: s.parallelSections,
        teachers: s.teachers
          .filter(t => t.teacherId) // skip empty teacher rows
          .map(t => ({
            teacherId: t.teacherId || null,
            assistantTeacherId: t.assistantTeacherId || null,
            weightage: t.weightage,
          })),
      })),
      divisionParticipation: form.divisionParticipation,
      defaultSchedulingPreferences: formPrefsToServer(form.defaultPrefs),
      perDivisionOverrides: Object.fromEntries(
        Object.entries(form.perDivisionOverrides)
          .filter(([, v]) => v !== null)
          .map(([k, v]) => [k, formPrefsToServer(v!)])
      ),
      confirmDeleteSlots: false,
    };

    try {
      await bulkSave(request).unwrap();
      toast.success(isEdit ? 'Elective group updated' : 'Elective group created');
      onOpenChange(false);
    } catch (err: any) {
      const code = err?.data?.error?.code;
      if (code === 'SLOTS_REQUIRE_CONFIRMATION') {
        // Retry with confirmation
        try {
          await bulkSave({ ...request, confirmDeleteSlots: true }).unwrap();
          toast.success('Elective group updated (timetable slots cleared)');
          onOpenChange(false);
        } catch (err2: any) {
          toast.error(err2?.data?.error?.message ?? 'Save failed');
        }
      } else {
        toast.error(err?.data?.error?.message ?? 'Save failed');
      }
    }
  };

  const handleDelete = async () => {
    if (!initialData) return;
    try {
      for (const gId of initialData.underlyingGroupIds) {
        await deleteGroup(gId).unwrap();
      }
      toast.success('Elective group deleted');
      setDeleteConfirmOpen(false);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.data?.error?.message ?? 'Delete failed');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          {/* Dark gradient header */}
          <div className="bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800 px-6 py-4 text-white shrink-0">
            <DialogHeader className="p-0 space-y-0">
              <DialogTitle className="text-white text-lg font-bold">{isEdit ? 'Edit Elective Group' : 'Create Elective Group'}</DialogTitle>
            </DialogHeader>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            <GroupConfigSection config={form.config} onChange={updateConfig} isEdit={isEdit} />

            <SubjectsSection
              subjects={form.subjects}
              onChange={updateSubjects}
              allSubjects={allSubjects}
              allTeachers={allTeachers}
              periodsPerWeek={form.config.periodsPerWeek}
            />

            <DivisionParticipationSection
              type={form.config.type}
              subjects={form.subjects}
              subjectNames={subjectNames}
              divisionParticipation={form.divisionParticipation}
              onChange={updateParticipation}
              classes={classes}
              selectedClassIds={selectedClassIds}
              onClassesChange={setSelectedClassIds}
            />

            <SchedulingPreferencesSection
              defaultPrefs={form.defaultPrefs}
              onDefaultChange={updateDefaultPrefs}
              perDivisionOverrides={form.perDivisionOverrides}
              onOverridesChange={updateOverrides}
              participatingDivisions={participatingDivisions}
            />
          </div>

          {/* Dark gradient footer */}
          <div className="bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800 px-6 py-3.5 flex items-center justify-between shrink-0">
            {isEdit ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-red-400 border-red-400/40 hover:bg-red-500/20 hover:text-red-300 gap-1"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={saving || deleting}
              >
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            ) : <div />}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-white/80 border-white/20 hover:bg-white/10 hover:text-white"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-amber-500 hover:bg-amber-600 text-white"
                onClick={handleSave}
                disabled={saving || deleting}
              >
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete Elective Group"
        description="This will delete the elective group, all division assignments, and associated timetable data. This cannot be undone."
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </>
  );
}
