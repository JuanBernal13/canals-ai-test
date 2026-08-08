import { DeleteMessageCommand, ReceiveMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import type { ProcessPaymentRequested } from '../../../application/use-cases/process-payment-requested.js';
import { parsePaymentRequestedEvent } from '../../../domain/events/payment-requested.event.js';
import { LIMIT } from '../../../shared/constants.js';
import { reportBatchFailures } from './report-batch-failures.js';
import { errorFields, logQueueEvent } from './queue-log.js';

export class SqsPaymentConsumerAdapter {
  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
    private readonly processPayment: ProcessPaymentRequested,
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
    logQueueEvent('payment-worker', 'poll_received', {
      queue: 'payment-requests',
      messageCount: response.Messages?.length ?? 0,
    });
    const results = await Promise.allSettled(
      (response.Messages ?? []).map((message) => this.consume(message.Body, message.ReceiptHandle)),
    );
    reportBatchFailures('payment-worker', results);
  }

  private async consume(body?: string, receiptHandle?: string): Promise<void> {
    if (!body || !receiptHandle) return;
    const event = parsePaymentRequestedEvent(JSON.parse(body) as unknown);
    logQueueEvent('payment-worker', 'message_received', {
      eventId: event.eventId,
      eventType: event.type,
    });
    try {
      await this.processPayment.execute(event);
      logQueueEvent('payment-worker', 'message_processed', { eventId: event.eventId });
      await this.client.send(
        new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: receiptHandle }),
      );
      logQueueEvent('payment-worker', 'message_deleted', { eventId: event.eventId });
    } catch (error) {
      logQueueEvent('payment-worker', 'message_failed', {
        eventId: event.eventId,
        ...errorFields(error),
      }, 'error');
      throw error;
    }
  }
}
