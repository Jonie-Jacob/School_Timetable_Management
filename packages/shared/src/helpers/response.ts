import { APIGatewayProxyResultV2 } from 'aws-lambda';

interface PaginationMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export function success<T>(data: T, statusCode = 200): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  };
}

export function paginated<T>(
  data: T[],
  meta: PaginationMeta,
): APIGatewayProxyResultV2 {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, meta }),
  };
}

export function created<T>(data: T): APIGatewayProxyResultV2 {
  return {
    statusCode: 201,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  };
}

export function accepted<T>(data: T): APIGatewayProxyResultV2 {
  return {
    statusCode: 202,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  };
}

export function noContent(): APIGatewayProxyResultV2 {
  return { statusCode: 204, body: '' };
}

export function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  details?: Array<{ field?: string; message: string }>,
): APIGatewayProxyResultV2 {
  const body: Record<string, unknown> = {
    error: { code, message, ...(details && { details }) },
  };
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
