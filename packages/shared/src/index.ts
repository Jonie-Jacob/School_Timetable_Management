// Errors
export {
  AppError,
  NotFoundError,
  ConflictError,
  ValidationError,
  ForbiddenError,
} from './errors';

// Helpers
export {
  success,
  paginated,
  created,
  accepted,
  noContent,
  errorResponse,
  parsePagination,
  type PaginationParams,
  parseBody,
  invokeLambda,
} from './helpers';

// Middleware
export {
  authMiddleware,
  academicYearMiddleware,
  requestLogger,
  errorHandler,
  type RequestContext,
} from './middleware';

// Database
export { prisma, tenantScope, softDelete } from './db';

// Models — enums
export {
  SlotType,
  JobStatus,
  TimetableStatus,
  AcademicYearStatus,
  ConflictType,
  DayOfWeek,
} from './models';

// Models — schemas & DTOs
export {
  createAcademicYearSchema,
  updateAcademicYearSchema,
  type CreateAcademicYearDto,
  type UpdateAcademicYearDto,
  createClassSchema,
  updateClassSchema,
  type CreateClassDto,
  type UpdateClassDto,
  createDivisionSchema,
  updateDivisionSchema,
  type CreateDivisionDto,
  type UpdateDivisionDto,
  createSubjectSchema,
  updateSubjectSchema,
  type CreateSubjectDto,
  type UpdateSubjectDto,
  createTeacherSchema,
  updateTeacherSchema,
  setTeacherSubjectsSchema,
  setTeacherAvailabilitySchema,
  type CreateTeacherDto,
  type UpdateTeacherDto,
  type SetTeacherSubjectsDto,
  type SetTeacherAvailabilityDto,
  createAssignmentSchema,
  updateAssignmentSchema,
  type CreateAssignmentDto,
  type UpdateAssignmentDto,
  createElectiveGroupSchema,
  updateElectiveGroupSchema,
  addElectiveSubjectSchema,
  type CreateElectiveGroupDto,
  type UpdateElectiveGroupDto,
  type AddElectiveSubjectDto,
  triggerGenerationSchema,
  overrideSlotSchema,
  type TriggerGenerationDto,
  type OverrideSlotDto,
  createPeriodStructureSchema,
  updatePeriodStructureSchema,
  assignPeriodStructureSchema,
  setWorkingDaysSchema,
  type CreatePeriodStructureDto,
  type UpdatePeriodStructureDto,
  type AssignPeriodStructureDto,
  type SetWorkingDaysDto,
  type SlotEntry,
} from './models';
