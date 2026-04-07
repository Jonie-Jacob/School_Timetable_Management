import { Settings, School, Palette, Globe } from 'lucide-react';
import { PageHeader } from '@/components/shared';
import { Badge } from '@/components/ui/badge';

const SETTING_SECTIONS = [
  { icon: School, label: 'School Information', description: 'Update school name, address, and contact details.', color: 'text-violet-500', bg: 'bg-violet-500/10' },
  { icon: Palette, label: 'Theme & Appearance', description: 'Customize colors, dark mode preferences, and display settings.', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { icon: Globe, label: 'Language & Region', description: 'Set preferred language and date/time format.', color: 'text-sky-500', bg: 'bg-sky-500/10' },
];

export function Component() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Configure school and application settings." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SETTING_SECTIONS.map((section) => (
          <div key={section.label} className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-5 space-y-3 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/5 hover:border-amber-500/20 cursor-pointer">
            <div className="flex items-center gap-3">
              <div className={`flex size-10 items-center justify-center rounded-xl ${section.bg}`}>
                <section.icon className={`size-5 ${section.color}`} />
              </div>
              <div>
                <h3 className="font-semibold text-sm">{section.label}</h3>
                <Badge variant="outline" className="text-[9px] mt-0.5">Coming soon</Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{section.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
