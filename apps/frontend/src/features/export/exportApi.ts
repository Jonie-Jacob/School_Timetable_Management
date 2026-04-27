import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from '@/lib/api';

interface PdfExportResponse {
  data: {
    format: 'pdf';
    html: string;
    filename: string;
    divisionsIncluded?: number;
    teachersIncluded?: number;
  };
}

interface ExcelExportResponse {
  data: {
    format: 'excel';
    base64: string;
    filename: string;
    sheetsIncluded?: number;
  };
}

export const exportApi = createApi({
  reducerPath: 'exportApi',
  baseQuery,
  endpoints: (builder) => ({
    // Division exports
    exportDivisionPdf: builder.mutation<PdfExportResponse['data'], { divisionId: string }>({
      query: (body) => ({ url: 'export/division/pdf', method: 'POST', body }),
      transformResponse: (r: PdfExportResponse) => r.data,
    }),
    exportDivisionExcel: builder.mutation<ExcelExportResponse['data'], { divisionId: string }>({
      query: (body) => ({ url: 'export/division/excel', method: 'POST', body }),
      transformResponse: (r: ExcelExportResponse) => r.data,
    }),

    // Class exports (all divisions in a class)
    exportClassPdf: builder.mutation<PdfExportResponse['data'], { classId: string }>({
      query: (body) => ({ url: 'export/class/pdf', method: 'POST', body }),
      transformResponse: (r: PdfExportResponse) => r.data,
    }),
    exportClassExcel: builder.mutation<ExcelExportResponse['data'], { classId: string }>({
      query: (body) => ({ url: 'export/class/excel', method: 'POST', body }),
      transformResponse: (r: ExcelExportResponse) => r.data,
    }),

    // Multi-class exports
    exportClassesPdf: builder.mutation<PdfExportResponse['data'], { classIds: string[] }>({
      query: (body) => ({ url: 'export/classes/pdf', method: 'POST', body }),
      transformResponse: (r: PdfExportResponse) => r.data,
    }),
    exportClassesExcel: builder.mutation<ExcelExportResponse['data'], { classIds: string[] }>({
      query: (body) => ({ url: 'export/classes/excel', method: 'POST', body }),
      transformResponse: (r: ExcelExportResponse) => r.data,
    }),

    // Single teacher exports
    exportTeacherPdf: builder.mutation<PdfExportResponse['data'], { teacherId: string }>({
      query: (body) => ({ url: 'export/teacher/pdf', method: 'POST', body }),
      transformResponse: (r: PdfExportResponse) => r.data,
    }),
    exportTeacherExcel: builder.mutation<ExcelExportResponse['data'], { teacherId: string }>({
      query: (body) => ({ url: 'export/teacher/excel', method: 'POST', body }),
      transformResponse: (r: ExcelExportResponse) => r.data,
    }),

    // Multi-teacher exports
    exportTeachersPdf: builder.mutation<PdfExportResponse['data'], { teacherIds: string[] }>({
      query: (body) => ({ url: 'export/teachers/pdf', method: 'POST', body }),
      transformResponse: (r: PdfExportResponse) => r.data,
    }),
    exportTeachersExcel: builder.mutation<ExcelExportResponse['data'], { teacherIds: string[] }>({
      query: (body) => ({ url: 'export/teachers/excel', method: 'POST', body }),
      transformResponse: (r: ExcelExportResponse) => r.data,
    }),

    // Free periods export
    exportFreePeriods: builder.mutation<PdfExportResponse['data'], void>({
      query: () => ({ url: 'export/free-periods', method: 'POST', body: {} }),
      transformResponse: (r: PdfExportResponse) => r.data,
    }),
  }),
});

export const {
  useExportDivisionPdfMutation,
  useExportDivisionExcelMutation,
  useExportClassPdfMutation,
  useExportClassExcelMutation,
  useExportClassesPdfMutation,
  useExportClassesExcelMutation,
  useExportTeacherPdfMutation,
  useExportTeacherExcelMutation,
  useExportTeachersPdfMutation,
  useExportTeachersExcelMutation,
  useExportFreePeriodsMutation,
} = exportApi;

// ── Download helpers ──

export function downloadHtmlAsPdf(html: string, _filename: string) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, '_blank');
  if (printWindow) {
    printWindow.addEventListener('load', () => {
      printWindow.print();
    });
  }
  // Cleanup after a delay
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function downloadExcel(base64: string, filename: string) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
