import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../errors';

export function parseBody<T>(event: APIGatewayProxyEventV2, schema: ZodSchema<T>): T {
  let raw: unknown;
  try {
    raw = JSON.parse(event.body || '{}');
  } catch {
    throw new ValidationError('Invalid JSON body');
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const details = result.error.errors.map((err: ZodError['errors'][number]) => ({
      field: err.path.join('.'),
      message: err.message,
    }));
    throw new ValidationError('Validation failed', details);
  }

  return result.data;
}
