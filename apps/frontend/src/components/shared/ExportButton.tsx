import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ExportButtonProps {
  onExportPdf: () => Promise<void>;
  onExportExcel: () => Promise<void>;
  size?: 'default' | 'sm' | 'xs';
  variant?: 'default' | 'outline' | 'ghost';
  label?: string;
}

export function ExportButton({
  onExportPdf,
  onExportExcel,
  size = 'sm',
  variant = 'outline',
  label = 'Export',
}: ExportButtonProps) {
  const [loading, setLoading] = useState<'pdf' | 'excel' | null>(null);

  const handleExport = async (type: 'pdf' | 'excel') => {
    setLoading(type);
    try {
      if (type === 'pdf') {
        await onExportPdf();
      } else {
        await onExportExcel();
      }
    } finally {
      setLoading(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={loading !== null}>
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport('pdf')} disabled={loading !== null}>
          <FileText className="size-4 mr-2 text-red-500" />
          Download PDF
          {loading === 'pdf' && <Loader2 className="size-3 ml-2 animate-spin" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('excel')} disabled={loading !== null}>
          <FileSpreadsheet className="size-4 mr-2 text-green-600" />
          Download Excel
          {loading === 'excel' && <Loader2 className="size-3 ml-2 animate-spin" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
