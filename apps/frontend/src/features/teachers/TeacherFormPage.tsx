import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared';
import { MultiSelect, type MultiSelectOption } from '@/components/shared/MultiSelect';
import { useGetSubjectsQuery } from '@/features/subjects/subjectApi';
import {
  useGetTeacherQuery,
  useCreateTeacherMutation,
  useUpdateTeacherMutation,
  useSetTeacherSubjectsMutation,
  useSetTeacherAvailabilityMutation,
} from './teacherApi';
import { AvailabilityGrid } from './AvailabilityGrid';

const teacherSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  contact: z.string().optional(),
  maxPeriodsPerWeek: z
    .union([z.number().int().min(1), z.nan(), z.literal('')])
    .optional()
    .transform((val) => {
      if (val === '' || (typeof val === 'number' && isNaN(val))) return undefined;
      return val as number;
    }),
});

type TeacherFormValues = z.infer<typeof teacherSchema>;

interface UnavailableSlot {
  workingDayId: string;
  slotId: string;
}

export function Component() {
  const { t } = useTranslation('teachers');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const { data: teacher, isLoading: teacherLoading } = useGetTeacherQuery(id!, { skip: !id });
  const { data: subjectsData } = useGetSubjectsQuery({ pageSize: 200 });
  const [createTeacher, { isLoading: isCreating }] = useCreateTeacherMutation();
  const [updateTeacher, { isLoading: isUpdating }] = useUpdateTeacherMutation();
  const [setSubjects] = useSetTeacherSubjectsMutation();
  const [setAvailability] = useSetTeacherAvailabilityMutation();

  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [unavailableSlots, setUnavailableSlots] = useState<UnavailableSlot[]>([]);

  const subjectOptions: MultiSelectOption[] = (subjectsData?.data ?? []).map((s) => ({
    value: s.id,
    label: s.name,
  }));

  const form = useForm<TeacherFormValues>({
    resolver: zodResolver(teacherSchema),
    defaultValues: { name: '', contact: '' },
  });

  useEffect(() => {
    if (teacher) {
      form.reset({
        name: teacher.name,
        contact: teacher.contact ?? '',
        maxPeriodsPerWeek: teacher.maxPeriodsPerWeek ?? undefined,
      });
      setSelectedSubjects(teacher.teacherSubjects?.map((ts) => ts.subjectId) ?? []);
      setUnavailableSlots(
        teacher.teacherAvailability?.map((a) => ({
          workingDayId: a.workingDayId,
          slotId: a.slotId,
        })) ?? [],
      );
    }
  }, [teacher, form]);

  const isSubmitting = isCreating || isUpdating;

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      if (isEdit) {
        await updateTeacher({
          id: id!,
          name: values.name,
          contact: values.contact || undefined,
          maxPeriodsPerWeek: typeof values.maxPeriodsPerWeek === 'number' ? values.maxPeriodsPerWeek : null,
        }).unwrap();
        await setSubjects({ id: id!, subjectIds: selectedSubjects }).unwrap();
        await setAvailability({ id: id!, unavailableSlots }).unwrap();
        toast.success(t('updateSuccess'));
      } else {
        const created = await createTeacher({
          name: values.name,
          contact: values.contact || undefined,
          maxPeriodsPerWeek: typeof values.maxPeriodsPerWeek === 'number' ? values.maxPeriodsPerWeek : null,
        }).unwrap();
        if (selectedSubjects.length > 0) {
          await setSubjects({ id: created.id, subjectIds: selectedSubjects }).unwrap();
        }
        if (unavailableSlots.length > 0) {
          await setAvailability({ id: created.id, unavailableSlots }).unwrap();
        }
        toast.success(t('createSuccess'));
      }
      navigate('/teachers');
    } catch {
      toast.error(isEdit ? t('updateError') : t('createError'));
    }
  });

  if (isEdit && teacherLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title={isEdit ? t('form.editTitle') : t('form.createTitle')}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">{t('form.name')}</Label>
            <Input
              id="name"
              placeholder={t('form.namePlaceholder')}
              {...form.register('name')}
              autoFocus
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact">{t('form.contact')}</Label>
            <Input
              id="contact"
              placeholder={t('form.contactPlaceholder')}
              {...form.register('contact')}
            />
          </div>
        </div>

        <div className="space-y-2 max-w-xs">
          <Label htmlFor="maxPeriodsPerWeek">{t('form.maxPeriodsPerWeek')}</Label>
          <Input
            id="maxPeriodsPerWeek"
            type="number"
            min={1}
            placeholder={t('form.maxPeriodsPlaceholder')}
            {...form.register('maxPeriodsPerWeek', { valueAsNumber: true })}
          />
        </div>

        <div className="space-y-2">
          <Label>{t('form.subjects')}</Label>
          <MultiSelect
            options={subjectOptions}
            value={selectedSubjects}
            onChange={setSelectedSubjects}
            placeholder={t('form.subjectsPlaceholder')}
            searchPlaceholder={t('form.subjectsSearch')}
            emptyMessage={t('form.subjectsEmpty')}
          />
        </div>

        <Separator />

        <AvailabilityGrid
          value={unavailableSlots}
          onChange={setUnavailableSlots}
        />

        <div className="flex gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('form.saving') : t('form.save')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/teachers')}
            disabled={isSubmitting}
          >
            {t('form.cancel')}
          </Button>
        </div>
      </form>
    </div>
  );
}
