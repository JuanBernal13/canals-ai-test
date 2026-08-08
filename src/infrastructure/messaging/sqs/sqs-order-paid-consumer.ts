import { DeleteMessageCommand, ReceiveMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import type { ProcessOrderPaid } from '../../../application/use-cases/process-order-paid.js';
import { parseOrderPaidEvent } from '../../../domain/events/order-paid.event.js';
import { LIMIT } from '../../../shared/constants.js';
import { reportBatchFailures } from './report-batch-failures.js';
import { errorFields, logQueueEvent } from './queue-log.js';

export class SqsOrderPaidConsumerAdapter {
  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
    private readonly processOrderPaid: ProcessOrderPaid,
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
    logQueueEvent('fulfillment-worker', 'poll_received', {
      queue: 'order-events',
      messageCount: response.Messages?.length ?? 0,
    });
    const results = await Promise.allSettled(
      (response.Messages ?? []).map((message) => this.consume(message.Body, message.ReceiptHandle)),
    );
    reportBatchFailures('fulfillment-worker', results);
  }

  private async consume(body?: string, receiptHandle?: string): Promise<void> {
    if (!body || !receiptHandle) return;
    const event = parseOrderPaidEvent(JSON.parse(body) as unknown);
    logQueueEvent('fulfillment-worker', 'message_received', {
      eventId: event.eventId,
      eventType: event.type,
    });
    try {
      await this.processOrderPaid.execute(event);
      logQueueEvent('fulfillment-worker', 'message_processed', { eventId: event.eventId });
      await this.client.send(
        new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: receiptHandle }),
      );
      logQueueEvent('fulfillment-worker', 'message_deleted', { eventId: event.eventId });
    } catch (error) {
      logQueueEvent('fulfillment-worker', 'message_failed', {
        eventId: event.eventId,
        ...errorFields(error),
      }, 'error');
      throw error;
    }
  }
}
