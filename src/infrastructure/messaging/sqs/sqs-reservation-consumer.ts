import { DeleteMessageCommand, ReceiveMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import type { ProcessReservationRequested } from '../../../application/use-cases/process-reservation-requested.js';
import { parseReservationRequestedEvent } from '../../../domain/events/reservation-requested.event.js';
import { LIMIT } from '../../../shared/constants.js';
import { reportBatchFailures } from './report-batch-failures.js';
import { errorFields, logQueueEvent } from './queue-log.js';

export class SqsReservationConsumerAdapter {
  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
    private readonly processReservation: ProcessReservationRequested,
  ) {}

  async pollOnce(): Promise<void> {
    const response = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: LIMIT.SQS_BATCH_SIZE,
        WaitTimeSeconds: LIMIT.SQS_WAIT_SECONDS,
        VisibilityTimeout: LIMIT.SQS_VISIBILITY_SECONDS,
      }),
    );
    logQueueEvent('reservation-worker', 'poll_received', {
      queue: 'inventory-reservations.fifo',
      messageCount: response.Messages?.length ?? 0,
    });
    const groups = new Map<string, Array<{ body: string; receiptHandle: string }>>();
    for (const message of response.Messages ?? []) {
      if (!message.Body || !message.ReceiptHandle) continue;
      let event;
      try {
        event = parseReservationRequestedEvent(JSON.parse(message.Body) as unknown);
      } catch (error) {
        reportBatchFailures('reservation-worker', [{ status: 'rejected', reason: error }]);
        continue;
      }
      const group = groups.get(event.payload.groupKey) ?? [];
      group.push({ body: message.Body, receiptHandle: message.ReceiptHandle });
      groups.set(event.payload.groupKey, group);
    }
    const results = await Promise.allSettled([...groups.values()].map(async group => {
      for (const message of group) await this.consume(message.body, message.receiptHandle);
    }));
    reportBatchFailures('reservation-worker', results);
  }

  private async consume(body?: string, receiptHandle?: string): Promise<void> {
    if (!body || !receiptHandle) return;
    const event = parseReservationRequestedEvent(JSON.parse(body) as unknown);
    logQueueEvent('reservation-worker', 'message_received', {
      eventId: event.eventId,
      eventType: event.type,
      groupKey: event.payload.groupKey,
    });
    try {
      await this.processReservation.execute(event);
      logQueueEvent('reservation-worker', 'message_processed', { eventId: event.eventId });
      await this.client.send(
        new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: receiptHandle }),
      );
      logQueueEvent('reservation-worker', 'message_deleted', { eventId: event.eventId });
    } catch (error) {
      logQueueEvent('reservation-worker', 'message_failed', {
        eventId: event.eventId,
        ...errorFields(error),
      }, 'error');
      throw error;
    }
  }
}
