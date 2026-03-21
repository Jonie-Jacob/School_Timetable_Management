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

export const DAY_TO_NUMBER: Record<DayKey, number> = {
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
  SUNDAY: 7,
};

export const NUMBER_TO_DAY: Record<number, DayKey> = {
  1: 'MONDAY',
  2: 'TUESDAY',
  3: 'WEDNESDAY',
  4: 'THURSDAY',
  5: 'FRIDAY',
  6: 'SATURDAY',
  7: 'SUNDAY',
};
