import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { requestLogger, errorHandler } from '@timetable/shared';
import { route } from './router';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  requestLogger(event);
  try {
    return await route(event);
  } catch (error) {
    return errorHandler(error);
  }
}
