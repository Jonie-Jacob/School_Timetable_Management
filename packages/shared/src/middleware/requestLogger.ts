import { APIGatewayProxyEventV2 } from 'aws-lambda';

export function requestLogger(event: APIGatewayProxyEventV2): void {
  const method = event.requestContext?.http?.method || 'UNKNOWN';
  const path = event.rawPath || event.requestContext?.http?.path || '/';
  const requestId = event.requestContext?.requestId || 'local';

  console.log(
    JSON.stringify({
      level: 'INFO',
      message: 'Incoming request',
      method,
      path,
      requestId,
      timestamp: new Date().toISOString(),
    }),
  );
}
