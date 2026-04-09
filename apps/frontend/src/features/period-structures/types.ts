export interface EditorSlot {
  id: string;
  type: 'PERIOD' | 'INTERVAL' | 'LUNCH_BREAK';
  startTime: string;
  endTime: string;
  periodNumber: number | null;
}

export type DayKey = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

export const ALL_DAYS: DayKey[] = [
  'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
];

// Matches the backend DayOfWeek enum (MONDAY=0, ..., SUNDAY=6)
export const DAY_TO_NUMBER: Record<DayKey, number> = {
  MONDAY: 0,
  TUESDAY: 1,
  WEDNESDAY: 2,
  THURSDAY: 3,
  FRIDAY: 4,
  SATURDAY: 5,
  SUNDAY: 6,
};

export const NUMBER_TO_DAY: Record<number, DayKey> = {
  0: 'MONDAY',
  1: 'TUESDAY',
  2: 'WEDNESDAY',
  3: 'THURSDAY',
  4: 'FRIDAY',
  5: 'SATURDAY',
  6: 'SUNDAY',
};
