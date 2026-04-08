import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, authMiddleware, academicYearMiddleware, parseBody } from '@timetable/shared';
import { ExportService } from './service';
import { z } from 'zod';

const divisionExportSchema = z.object({
  divisionId: z.string().uuid(),
});

const classExportSchema = z.object({
  classId: z.string().uuid(),
});

const teacherExportSchema = z.object({
  teacherId: z.string().uuid(),
});

const teachersExportSchema = z.object({
  teacherIds: z.array(z.string().uuid()).default([]),
});

const service = new ExportService();

export class ExportController {

  async health(): Promise<APIGatewayProxyResultV2> {
    return success({ status: 'ok', service: 'export' });
  }

  async exportDivisionPdf(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const { academicYearId } = await academicYearMiddleware(event, { schoolId: auth.schoolId! });
    const dto = parseBody(event, divisionExportSchema);
    const result = await service.exportDivisionPdf(auth.schoolId!, academicYearId, dto.divisionId);
    return success(result);
  }

  async exportDivisionExcel(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const { academicYearId } = await academicYearMiddleware(event, { schoolId: auth.schoolId! });
    const dto = parseBody(event, divisionExportSchema);
    const result = await service.exportDivisionExcel(auth.schoolId!, academicYearId, dto.divisionId);
    return success(result);
  }

  async exportTeacherPdf(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const { academicYearId } = await academicYearMiddleware(event, { schoolId: auth.schoolId! });
    const dto = parseBody(event, teacherExportSchema);
    const result = await service.exportTeacherPdf(auth.schoolId!, academicYearId, dto.teacherId);
    return success(result);
  }

  async exportTeacherExcel(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const { academicYearId } = await academicYearMiddleware(event, { schoolId: auth.schoolId! });
    const dto = parseBody(event, teacherExportSchema);
    const result = await service.exportTeacherExcel(auth.schoolId!, academicYearId, dto.teacherId);
    return success(result);
  }

  // Class-level exports (all divisions in a class)

  async exportClassPdf(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const { academicYearId } = await academicYearMiddleware(event, { schoolId: auth.schoolId! });
    const dto = parseBody(event, classExportSchema);
    const result = await service.exportClassPdf(auth.schoolId!, academicYearId, dto.classId);
    return success(result);
  }

  async exportClassExcel(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const { academicYearId } = await academicYearMiddleware(event, { schoolId: auth.schoolId! });
    const dto = parseBody(event, classExportSchema);
    const result = await service.exportClassExcel(auth.schoolId!, academicYearId, dto.classId);
    return success(result);
  }

  // Multi-class exports

  async exportClassesPdf(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const { academicYearId } = await academicYearMiddleware(event, { schoolId: auth.schoolId! });
    const dto = parseBody(event, z.object({ classIds: z.array(z.string().uuid()) }));
    const result = await service.exportClassesPdf(auth.schoolId!, academicYearId, dto.classIds);
    return success(result);
  }

  async exportClassesExcel(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const { academicYearId } = await academicYearMiddleware(event, { schoolId: auth.schoolId! });
    const dto = parseBody(event, z.object({ classIds: z.array(z.string().uuid()) }));
    const result = await service.exportClassesExcel(auth.schoolId!, academicYearId, dto.classIds);
    return success(result);
  }

  // Multi-teacher exports (selected teachers or all)

  async exportTeachersPdf(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const { academicYearId } = await academicYearMiddleware(event, { schoolId: auth.schoolId! });
    const dto = parseBody(event, teachersExportSchema);
    const result = await service.exportTeachersPdf(auth.schoolId!, academicYearId, dto.teacherIds ?? []);
    return success(result);
  }

  async exportTeachersExcel(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const auth = await authMiddleware(event);
    const { academicYearId } = await academicYearMiddleware(event, { schoolId: auth.schoolId! });
    const dto = parseBody(event, teachersExportSchema);
    const result = await service.exportTeachersExcel(auth.schoolId!, academicYearId, dto.teacherIds ?? []);
    return success(result);
  }
}
