import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, authMiddleware, academicYearMiddleware, parseBody } from '@timetable/shared';
import { ExportService } from './service';
import { z } from 'zod';

const divisionExportSchema = z.object({
  divisionId: z.string().uuid(),
});

const teacherExportSchema = z.object({
  teacherId: z.string().uuid(),
});

const service = new ExportService();

export class ExportController {

  async health(): Promise<APIGatewayProxyResultV2> {
    return success({ status: 'ok', service: 'export' });
  }

  async exportDivisionPdf(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const { academicYearId } = await academicYearMiddleware(event, { schoolId: auth.schoolId! });
    const dto = parseBody(event, divisionExportSchema);
    const result = await service.exportDivisionPdf(auth.schoolId!, academicYearId, dto.divisionId);
    return success(result);
  }

  async exportDivisionExcel(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const { academicYearId } = await academicYearMiddleware(event, { schoolId: auth.schoolId! });
    const dto = parseBody(event, divisionExportSchema);
    const result = await service.exportDivisionExcel(auth.schoolId!, academicYearId, dto.divisionId);
    return success(result);
  }

  async exportTeacherPdf(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const { academicYearId } = await academicYearMiddleware(event, { schoolId: auth.schoolId! });
    const dto = parseBody(event, teacherExportSchema);
    const result = await service.exportTeacherPdf(auth.schoolId!, academicYearId, dto.teacherId);
    return success(result);
  }

  async exportTeacherExcel(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = authMiddleware(event);
    const { academicYearId } = await academicYearMiddleware(event, { schoolId: auth.schoolId! });
    const dto = parseBody(event, teacherExportSchema);
    const result = await service.exportTeacherExcel(auth.schoolId!, academicYearId, dto.teacherId);
    return success(result);
  }
}
