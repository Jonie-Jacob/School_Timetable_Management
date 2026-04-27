/** Form state for the unified elective group editor modal. */

export interface TeacherRow {
  teacherId: string;
  assistantTeacherId: string;
  weightage: number;
}

export interface SubjectRow {
  subjectId: string;
  parallelSections: number;
  teachers: TeacherRow[];
}

export interface ElectiveGroupFormValues {
  config: {
    name: string;
    periodsPerWeek: number;
    type: 'per-division' | 'cross-division';
  };
  subjects: SubjectRow[];
  /** divisionId → array of subjectIds that division participates in */
  divisionParticipation: Record<string, string[]>;
  defaultPrefs: {
    constraintType: 'HARD' | 'SOFT';
    preferredDays: number[];
    excludedDays: number[];
    preferredPeriodRange: { min: number; max: number } | null;
    excludedPeriodRange: { min: number; max: number } | null;
    preferAdjacentPeriods: boolean;
    maxPeriodsPerDay: number | null;
    minPeriodsPerDay: number | null;
  };
  perDivisionOverrides: Record<string, ElectiveGroupFormValues['defaultPrefs'] | null>;
}

export const DEFAULT_PREFS: ElectiveGroupFormValues['defaultPrefs'] = {
  constraintType: 'SOFT',
  preferredDays: [],
  excludedDays: [],
  preferredPeriodRange: null,
  excludedPeriodRange: null,
  preferAdjacentPeriods: false,
  maxPeriodsPerDay: null,
  minPeriodsPerDay: null,
};

export const EMPTY_FORM: ElectiveGroupFormValues = {
  config: { name: '', periodsPerWeek: 1, type: 'per-division' },
  subjects: [],
  divisionParticipation: {},
  defaultPrefs: { ...DEFAULT_PREFS },
  perDivisionOverrides: {},
};

/** Convert server prefs (JSONB) to form prefs shape */
export function serverPrefsToForm(p: any): ElectiveGroupFormValues['defaultPrefs'] {
  if (!p) return { ...DEFAULT_PREFS };
  return {
    constraintType: p.constraintType ?? 'SOFT',
    preferredDays: p.preferredDays ?? [],
    excludedDays: p.excludedDays ?? [],
    preferredPeriodRange: p.preferredPeriodRange ?? null,
    excludedPeriodRange: p.excludedPeriodRange ?? null,
    preferAdjacentPeriods: p.preferAdjacentPeriods ?? false,
    maxPeriodsPerDay: p.maxPeriodsPerDay ?? null,
    minPeriodsPerDay: p.minPeriodsPerDay ?? null,
  };
}

/** Convert form prefs back to server shape (strip empty arrays/nulls) */
export function formPrefsToServer(p: ElectiveGroupFormValues['defaultPrefs']): any {
  const result: any = { constraintType: p.constraintType };
  if (p.preferredDays.length) result.preferredDays = p.preferredDays;
  if (p.excludedDays.length) result.excludedDays = p.excludedDays;
  if (p.preferredPeriodRange) result.preferredPeriodRange = p.preferredPeriodRange;
  if (p.excludedPeriodRange) result.excludedPeriodRange = p.excludedPeriodRange;
  if (p.preferAdjacentPeriods) result.preferAdjacentPeriods = true;
  if (p.maxPeriodsPerDay) result.maxPeriodsPerDay = p.maxPeriodsPerDay;
  if (p.minPeriodsPerDay) result.minPeriodsPerDay = p.minPeriodsPerDay;
  // If only constraintType, still send it
  return Object.keys(result).length > 1 ? result : null;
}
