import { useMemo } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { SubjectRow } from './types';

interface ClassInfo {
  id: string;
  name: string;
  sortOrder: number;
  divisions: { id: string; label: string }[];
}

interface Props {
  type: 'per-division' | 'cross-division';
  subjects: SubjectRow[];
  subjectNames: Record<string, { name: string; abbr?: string | null }>;
  divisionParticipation: Record<string, string[]>;
  onChange: (participation: Record<string, string[]>) => void;
  classes: ClassInfo[];
  selectedClassIds: string[];
  onClassesChange: (classIds: string[]) => void;
}

export function DivisionParticipationSection({
  type, subjects, subjectNames, divisionParticipation, onChange,
  classes, selectedClassIds, onClassesChange,
}: Props) {
  const subjectIds = subjects.map(s => s.subjectId);

  // Get divisions for selected classes
  const visibleDivisions = useMemo(() => {
    const result: { divisionId: string; classId: string; className: string; label: string; classSortOrder: number }[] = [];
    for (const cls of classes) {
      if (!selectedClassIds.includes(cls.id)) continue;
      for (const div of cls.divisions) {
        result.push({ divisionId: div.id, classId: cls.id, className: cls.name, label: div.label, classSortOrder: cls.sortOrder });
      }
    }
    return result.sort((a, b) => a.classSortOrder - b.classSortOrder || a.label.localeCompare(b.label));
  }, [classes, selectedClassIds]);

  // Group divisions by class for display
  const groupedByClass = useMemo(() => {
    const map = new Map<string, typeof visibleDivisions>();
    for (const d of visibleDivisions) {
      if (!map.has(d.classId)) map.set(d.classId, []);
      map.get(d.classId)!.push(d);
    }
    return Array.from(map.entries());
  }, [visibleDivisions]);

  const toggleCell = (divisionId: string, subjectId: string, checked: boolean) => {
    const current = divisionParticipation[divisionId] ?? [];
    let next: string[];
    if (checked) {
      next = [...current, subjectId];
    } else {
      next = current.filter(s => s !== subjectId);
    }
    const updated = { ...divisionParticipation };
    if (next.length > 0) {
      updated[divisionId] = next;
    } else {
      delete updated[divisionId];
    }
    onChange(updated);
  };

  const toggleAllForDivision = (divisionId: string, checked: boolean) => {
    const updated = { ...divisionParticipation };
    if (checked) {
      updated[divisionId] = [...subjectIds];
    } else {
      delete updated[divisionId];
    }
    onChange(updated);
  };

  const toggleAllForSubject = (subjectId: string, checked: boolean) => {
    const updated = { ...divisionParticipation };
    for (const d of visibleDivisions) {
      const current = updated[d.divisionId] ?? [];
      if (checked) {
        if (!current.includes(subjectId)) updated[d.divisionId] = [...current, subjectId];
      } else {
        updated[d.divisionId] = current.filter(s => s !== subjectId);
        if (updated[d.divisionId]!.length === 0) delete updated[d.divisionId];
      }
    }
    onChange(updated);
  };

  const handleClassToggle = (classId: string) => {
    if (type === 'cross-division') {
      // Cross-div: single class only
      onClassesChange(selectedClassIds.includes(classId) ? [] : [classId]);
    } else {
      // Per-div: toggle in multi-select
      if (selectedClassIds.includes(classId)) {
        onClassesChange(selectedClassIds.filter(id => id !== classId));
      } else {
        onClassesChange([...selectedClassIds, classId]);
      }
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Division Participation</h3>

      {/* Class selector */}
      <div className="space-y-1.5">
        <Label className="text-xs">
          {type === 'cross-division' ? 'Select Class' : 'Select Classes'}
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {classes.map(cls => (
            <button
              key={cls.id}
              type="button"
              onClick={() => handleClassToggle(cls.id)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                selectedClassIds.includes(cls.id)
                  ? 'bg-amber-100 border-amber-400 text-amber-900 font-medium'
                  : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/60'
              }`}
            >
              {cls.name.replace(/^Class\s+/i, '')}
            </button>
          ))}
        </div>
      </div>

      {/* Division × Subject grid */}
      {subjectIds.length > 0 && visibleDivisions.length > 0 && (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-stone-800 text-white">
                <th className="text-left px-2 py-1.5 font-medium sticky left-0 bg-stone-800 z-10">Division</th>
                {subjectIds.map(sid => {
                  const info = subjectNames[sid];
                  const allChecked = visibleDivisions.every(d => (divisionParticipation[d.divisionId] ?? []).includes(sid));
                  return (
                    <th key={sid} className="text-center px-2 py-1.5 font-medium">
                      <div className="flex flex-col items-center gap-0.5">
                        <span>{info?.abbr || info?.name || sid.slice(0, 6)}</span>
                        <Checkbox
                          checked={allChecked}
                          onCheckedChange={(checked) => toggleAllForSubject(sid, !!checked)}
                          className="border-white/50"
                        />
                      </div>
                    </th>
                  );
                })}
                <th className="text-center px-2 py-1.5 font-medium">All</th>
              </tr>
            </thead>
            <tbody>
              {groupedByClass.map(([, divs]) => (
                divs.map((d, dIdx) => {
                  const current = divisionParticipation[d.divisionId] ?? [];
                  const allChecked = subjectIds.every(s => current.includes(s));
                  return (
                    <tr key={d.divisionId} className={dIdx % 2 === 0 ? '' : 'bg-muted/20'}>
                      <td className="px-2 py-1 font-medium sticky left-0 bg-inherit z-10 whitespace-nowrap">
                        {d.className.replace(/^Class\s+/i, '')} {d.label}
                      </td>
                      {subjectIds.map(sid => (
                        <td key={sid} className="text-center px-2 py-1">
                          <Checkbox
                            checked={current.includes(sid)}
                            onCheckedChange={(checked) => toggleCell(d.divisionId, sid, !!checked)}
                          />
                        </td>
                      ))}
                      <td className="text-center px-2 py-1">
                        <Checkbox
                          checked={allChecked}
                          onCheckedChange={(checked) => toggleAllForDivision(d.divisionId, !!checked)}
                        />
                      </td>
                    </tr>
                  );
                })
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedClassIds.length === 0 && (
        <p className="text-xs text-muted-foreground italic">Select at least one class to configure divisions.</p>
      )}
    </div>
  );
}
