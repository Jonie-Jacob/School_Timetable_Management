import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelect, type MultiSelectOption } from '@/components/shared/MultiSelect';
import { useGetSubjectsQuery } from '@/features/subjects/subjectApi';

const teacherSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  contact: z.string().optional(),
  maxPeriodsPerWeek: z.union([
    z.number().int().min(1),
    z.nan(),
    z.literal(''),
  ]).optional().transform((val) => {
    if (val === '' || (typeof val === 'number' && isNaN(val))) return undefined;
    return val as number;
  }),
});

type TeacherFormValues = z.infer<typeof teacherSchema>;

export interface TeacherFormData {
  name: string;
  contact?: string;
  maxPeriodsPerWeek?: number | null;
  subjectIds: string[];
}

interface TeacherFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: TeacherFormData) => Promise<void>;
  isSubmitting: boolean;
  defaultValues?: {
    name: string;
    contact?: string;
    maxPeriodsPerWeek?: number | null;
    subjectIds?: string[];
  };
  mode?: 'create' | 'edit';
}

export function TeacherForm({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  defaultValues,
  mode = 'create',
}: TeacherFormProps) {
  const { t } = useTranslation('teachers');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);

  const { data: subjectsData } = useGetSubjectsQuery({ pageSize: 200 });

  const subjectOptions: MultiSelectOption[] = (subjectsData?.data ?? []).map((s) => ({
    value: s.id,
    label: s.name,
  }));

  const form = useForm<TeacherFormValues>({
    resolver: zodResolver(teacherSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      contact: defaultValues?.contact ?? '',
      maxPeriodsPerWeek: defaultValues?.maxPeriodsPerWeek ?? undefined,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: defaultValues?.name ?? '',
        contact: defaultValues?.contact ?? '',
        maxPeriodsPerWeek: defaultValues?.maxPeriodsPerWeek ?? undefined,
      });
      setSelectedSubjects(defaultValues?.subjectIds ?? []);
    }
  }, [open, defaultValues, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit({
      name: values.name,
      contact: values.contact || undefined,
      maxPeriodsPerWeek: typeof values.maxPeriodsPerWeek === 'number' ? values.maxPeriodsPerWeek : null,
      subjectIds: selectedSubjects,
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? t('form.createTitle') : t('form.editTitle')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div className="space-y-2">
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t('form.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('form.saving') : t('form.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
