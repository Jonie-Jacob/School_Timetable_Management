import { InvokeCommand, LambdaClient, LogType } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({});

interface InvokeOptions {
  functionName: string;
  payload: Record<string, unknown>;
}

export async function invokeLambda<T>(options: InvokeOptions): Promise<T> {
  const command = new InvokeCommand({
    FunctionName: options.functionName,
    InvocationType: 'RequestResponse',
    LogType: LogType.None,
    Payload: Buffer.from(JSON.stringify(options.payload)),
  });

  const response = await lambda.send(command);

  if (response.FunctionError) {
    throw new Error(`Lambda invocation error: ${response.FunctionError}`);
  }

  const responsePayload = response.Payload
    ? JSON.parse(Buffer.from(response.Payload).toString())
    : null;

  return responsePayload as T;
}
