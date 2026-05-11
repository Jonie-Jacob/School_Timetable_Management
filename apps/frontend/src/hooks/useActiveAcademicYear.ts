import { useAppSelector } from '@/app/hooks';
import { useGetAcademicYearsQuery, type AcademicYear } from '@/features/academic-years/academicYearApi';

/**
 * Returns the AcademicYear matching the active id stored in auth state.
 * Returns null until the academic-years list has loaded or no active id is set.
 */
export function useActiveAcademicYear(): AcademicYear | null {
  const activeAcademicYearId = useAppSelector((s) => s.auth.activeAcademicYearId);
  const { data } = useGetAcademicYearsQuery({ pageSize: 50 });
  if (!activeAcademicYearId || !data) return null;
  return data.data.find((ay) => ay.id === activeAcademicYearId) ?? null;
}
