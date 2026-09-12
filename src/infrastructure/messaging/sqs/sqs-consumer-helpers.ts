import { DeleteMessageCommand, ReceiveMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import { LIMIT } from '../../../shared/constants.js';
import { reportBatchFailures } from './report-batch-failures.js';
import { errorFields, logQueueEvent } from './queue-log.js';

export type QueueEvent = {
  eventId: string;
  type: string;
};

type ConsumeOptions<TEvent extends QueueEvent> = {
  client: SQSClient;
  queueUrl: string;
  component: string;
  parse: (value: unknown) => TEvent;
  process: (event: TEvent) => Promise<void>;
  receivedFields?: (event: TEvent) => Record<string, unknown>;
};

export async function pollSqsMessages(
  client: SQSClient,
  queueUrl: string,
  component: string,
  queue: string,
  consume: (body?: string, receiptHandle?: string) => Promise<void>,
): Promise<void> {
  const response = await client.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: LIMIT.SQS_BATCH_SIZE,
      WaitTimeSeconds: LIMIT.SQS_WAIT_SECONDS,
      VisibilityTimeout: LIMIT.SQS_VISIBILITY_SECONDS,
    }),
  );
  logQueueEvent(component, 'poll_received', {
    queue,
    messageCount: response.Messages?.length ?? 0,
  });
  const results = await Promise.allSettled(
    (response.Messages ?? []).map((message) => consume(message.Body, message.ReceiptHandle)),
  );
  reportBatchFailures(component, results);
}

export async function consumeSqsMessage<TEvent extends QueueEvent>(
  options: ConsumeOptions<TEvent>,
  body?: string,
  receiptHandle?: string,
): Promise<void> {
  if (!body || !receiptHandle) return;
  const event = options.parse(JSON.parse(body) as unknown);
  logQueueEvent(options.component, 'message_received', {
    eventId: event.eventId,
    eventType: event.type,
    ...options.receivedFields?.(event),
  });
  try {
    await options.process(event);
    logQueueEvent(options.component, 'message_processed', { eventId: event.eventId });
    await options.client.send(
      new DeleteMessageCommand({ QueueUrl: options.queueUrl, ReceiptHandle: receiptHandle }),
    );
    logQueueEvent(options.component, 'message_deleted', { eventId: event.eventId });
  } catch (error) {
    logQueueEvent(options.component, 'message_failed', {
      eventId: event.eventId,
      ...errorFields(error),
    }, 'error');
    throw error;
  }
}
