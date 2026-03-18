import { useAppSelector } from '@/app/hooks';

export function useReadOnly(): boolean {
  const activeAcademicYearId = useAppSelector(
    (state) => state.auth.activeAcademicYearId
  );
  // TODO: When academicYearApi is connected, check if the selected AY is archived.
  // For now, we look at localStorage for a simple flag.
  if (!activeAcademicYearId) return false;

  const stored = localStorage.getItem(`ay-archived-${activeAcademicYearId}`);
  return stored === 'true';
}
