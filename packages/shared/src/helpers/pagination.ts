import { APIGatewayProxyEventV2 } from 'aws-lambda';

export interface PaginationParams {
  page: number;
  pageSize: number;
  skip: number;
  search?: string;
}

export function parsePagination(event: APIGatewayProxyEventV2): PaginationParams {
  const qs = event.queryStringParameters || {};

  const page = Math.max(1, parseInt(qs.page || '1', 10) || 1);
  const rawPageSize = parseInt(qs.pageSize || qs.limit || '20', 10) || 20;
  const pageSize = Math.min(Math.max(1, rawPageSize), 100);
  const skip = (page - 1) * pageSize;
  const search = qs.search?.trim() || undefined;

  return { page, pageSize, skip, search };
}
