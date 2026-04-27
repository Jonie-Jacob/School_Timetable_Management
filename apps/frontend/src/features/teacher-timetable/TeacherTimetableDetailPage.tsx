import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared';
import { ExportButton } from '@/components/shared/ExportButton';
import { useGetTeachersQuery, useGetTeachersLoadQuery } from '@/features/teachers/teacherApi';
import {
  useExportTeacherPdfMutation,
  useExportTeacherExcelMutation,
  downloadHtmlAsPdf,
  downloadExcel,
} from '@/features/export/exportApi';
import { TeacherTimetableGrid } from './TeacherTimetableGrid';
import { TeacherBreakdown } from './TeacherBreakdown';

export function Component() {
  const { teacherId } = useParams<{ teacherId: string }>();
  const navigate = useNavigate();

  const { data: teachersData } = useGetTeachersQuery({ pageSize: 200 });
  const { data: teacherLoads } = useGetTeachersLoadQuery();
  const teacher = teachersData?.data.find((t) => t.id === teacherId);
  const teacherLoad = teacherLoads?.find((l) => l.id === teacherId);

  const [exportPdf] = useExportTeacherPdfMutation();
  const [exportExcel] = useExportTeacherExcelMutation();

  if (!teacherId) {
    return null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={teacher?.name ?? 'Teacher Timetable'}
        description="Weekly timetable for this teacher."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/teacher-timetable')}>
              <ArrowLeft className="size-3.5" />
              All teachers
            </Button>
            <ExportButton
              onExportPdf={async () => {
                try {
                  const result = await exportPdf({ teacherId }).unwrap();
                  downloadHtmlAsPdf(result.html, result.filename);
                  toast.success('Export ready -- use browser print dialog to save as PDF');
                } catch {
                  toast.error('Export failed');
                }
              }}
              onExportExcel={async () => {
                try {
                  const result = await exportExcel({ teacherId }).unwrap();
                  downloadExcel(result.base64, result.filename);
                  toast.success('Excel downloaded');
                } catch {
                  toast.error('Export failed');
                }
              }}
            />
          </div>
        }
      />

      <TeacherTimetableGrid teacherId={teacherId} teacherName={teacher?.name} assignedPeriods={teacherLoad?.assignedPeriods} />

      <TeacherBreakdown teacherId={teacherId} />
    </div>
  );
}
