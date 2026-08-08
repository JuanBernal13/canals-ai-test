type QueueLogLevel = 'info' | 'error';
type QueueLogFields = Record<string, string | number | boolean | undefined>;

export function logQueueEvent(
  component: string,
  event: string,
  fields: QueueLogFields = {},
  level: QueueLogLevel = 'info',
): void {
  if (process.env.QUEUE_LOGGING === 'false' && level === 'info') return;
  process.stdout.write(
    `${JSON.stringify({ level, time: new Date().toISOString(), component, event, ...fields })}\n`,
  );
}

export function errorFields(error: unknown): QueueLogFields {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message };
  }
  return { errorMessage: String(error) };
}
