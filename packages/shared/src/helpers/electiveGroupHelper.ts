/**
 * Elective group helpers for cross-division identification and display name building.
 *
 * Consolidates duplicate logic from:
 * - teacher/service.ts :: listLoad() (lines 119-130)
 * - teacher/service.ts :: getTeacherBreakdown() (lines 248-259)
 * - export/service.ts :: getTeacherGrid() (lines 328-344)
 */

/**
 * Build a map of electiveGroupId → Set<divisionId>.
 * Used to determine which elective groups span multiple divisions.
 */
export function buildElectiveGroupDivisionMap(
  assignments: Array<{ electiveGroupId: string | null; divisionId: string }>,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const a of assignments) {
    if (a.electiveGroupId) {
      if (!map.has(a.electiveGroupId)) map.set(a.electiveGroupId, new Set());
      map.get(a.electiveGroupId)!.add(a.divisionId);
    }
  }
  return map;
}

/**
 * Identify which elective groups span multiple divisions (cross-division).
 * Returns a Set of elective group IDs that are cross-division.
 */
export function identifyCrossDivElectiveGroups(
  assignments: Array<{ electiveGroupId: string | null; divisionId: string }>,
): Set<string> {
  const egDivMap = buildElectiveGroupDivisionMap(assignments);
  const crossDiv = new Set<string>();
  for (const [egId, divs] of egDivMap) {
    if (divs.size > 1) crossDiv.add(egId);
  }
  return crossDiv;
}

/**
 * Build combined class name for cross-div elective display in export summary tables.
 * e.g., electiveGroupId → "XI B, XI C, XI D"
 *
 * Input should include division details (className + divisionLabel).
 */
export function buildElectiveGroupClassName(
  entries: Array<{
    electiveGroupId: string | null;
    className: string;
    divisionLabel: string;
  }>,
): Map<string, string> {
  const divNamesByGroup = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!e.electiveGroupId) continue;
    if (!divNamesByGroup.has(e.electiveGroupId)) divNamesByGroup.set(e.electiveGroupId, new Set());
    divNamesByGroup.get(e.electiveGroupId)!.add(`${e.className} ${e.divisionLabel}`);
  }

  const result = new Map<string, string>();
  for (const [egId, divNames] of divNamesByGroup) {
    result.set(egId, Array.from(divNames).sort((a, b) => a.localeCompare(b)).join(', '));
  }
  return result;
}
