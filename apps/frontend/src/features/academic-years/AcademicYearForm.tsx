import { useForm, Controller } from 'react-hook-form';
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
import { DatePicker } from '@/components/shared';

const createSchema = (t: (key: string) => string) =>
  z
    .object({
      label: z.string().min(1, t('form.labelRequired')),
      startDate: z.date({ required_error: t('form.startDateRequired') }),
      endDate: z.date({ required_error: t('form.endDateRequired') }),
    })
    .refine((data) => data.endDate > data.startDate, {
      message: t('form.endDateAfterStart'),
      path: ['endDate'],
    });

type FormValues = z.infer<ReturnType<typeof createSchema>>;

interface AcademicYearFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { label: string; startDate: string; endDate: string }) => void;
  isSubmitting?: boolean;
}

export function AcademicYearForm({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
}: AcademicYearFormProps) {
  const { t } = useTranslation('academic-years');
  const schema = createSchema(t);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { label: '', startDate: undefined, endDate: undefined },
  });

  const handleFormSubmit = (values: FormValues) => {
    onSubmit({
      label: values.label,
      startDate: values.startDate.toISOString().split('T')[0],
      endDate: values.endDate.toISOString().split('T')[0],
    });
    reset();
  };

  const handleClose = (val: boolean) => {
    if (!val) reset();
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('form.title')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="label">{t('form.label')}</Label>
            <Input
              id="label"
              placeholder={t('form.labelPlaceholder')}
              {...register('label')}
            />
            {errors.label && (
              <p className="text-sm text-destructive">{errors.label.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t('form.startDate')}</Label>
            <Controller
              name="startDate"
              control={control}
              render={({ field }) => (
                <DatePicker
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={t('form.startDate')}
                />
              )}
            />
            {errors.startDate && (
              <p className="text-sm text-destructive">{errors.startDate.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t('form.endDate')}</Label>
            <Controller
              name="endDate"
              control={control}
              render={({ field }) => (
                <DatePicker
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={t('form.endDate')}
                />
              )}
            />
            {errors.endDate && (
              <p className="text-sm text-destructive">{errors.endDate.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              {t('form.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {t('form.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
