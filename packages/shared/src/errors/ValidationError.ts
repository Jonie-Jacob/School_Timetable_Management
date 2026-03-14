import { AppError } from './AppError';

export class ValidationError extends AppError {
  constructor(
    message: string,
    details?: Array<{ field?: string; message: string }>,
  ) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}
