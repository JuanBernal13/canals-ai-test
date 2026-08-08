import { errorFields, logQueueEvent } from './queue-log.js';

export function reportBatchFailures(component: string, results: PromiseSettledResult<void>[]): void {
  for (const result of results) {
    if (result.status !== 'rejected') continue;
    logQueueEvent(component, 'batch_message_failed', errorFields(result.reason), 'error');
  }
}
