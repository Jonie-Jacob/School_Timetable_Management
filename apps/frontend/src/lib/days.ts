/**
 * Canonical day-of-week labels.
 *
 * The backend DayOfWeek enum uses MONDAY=0, TUESDAY=1, ..., SUNDAY=6.
 * Every UI that renders `workingDay.dayOfWeek` must use these maps to
 * avoid the Sun-first off-by-one bug.
 */

export const DAY_LABELS_SHORT: Record<number, string> = {
  0: 'Mon',
  1: 'Tue',
  2: 'Wed',
  3: 'Thu',
  4: 'Fri',
  5: 'Sat',
  6: 'Sun',
};

export const DAY_LABELS_FULL: Record<number, string> = {
  0: 'Monday',
  1: 'Tuesday',
  2: 'Wednesday',
  3: 'Thursday',
  4: 'Friday',
  5: 'Saturday',
  6: 'Sunday',
};
