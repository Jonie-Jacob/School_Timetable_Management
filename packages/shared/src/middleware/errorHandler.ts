import { APIGatewayProxyResultV2 } from 'aws-lambda';
import { AppError } from '../errors';
import { errorResponse } from '../helpers/response';

export function errorHandler(error: unknown): APIGatewayProxyResultV2 {
  if (error instanceof AppError) {
    console.error(JSON.stringify({
      level: 'WARN',
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
    }));
    return errorResponse(error.statusCode, error.code, error.message, error.details);
  }

  // Unexpected errors
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(JSON.stringify({
    level: 'ERROR',
    code: 'INTERNAL_ERROR',
    message,
    stack: error instanceof Error ? error.stack : undefined,
  }));

  return errorResponse(500, 'INTERNAL_ERROR', 'An internal server error occurred');
}
