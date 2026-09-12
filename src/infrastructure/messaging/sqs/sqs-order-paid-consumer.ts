import type { SQSClient } from '@aws-sdk/client-sqs';
import type { ProcessOrderPaid } from '../../../application/use-cases/process-order-paid.js';
import { parseOrderPaidEvent } from '../../../domain/events/order-paid.event.js';
import { consumeSqsMessage, pollSqsMessages } from './sqs-consumer-helpers.js';

export class SqsOrderPaidConsumerAdapter {
  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
    private readonly processOrderPaid: ProcessOrderPaid,
  ) {}

  async pollOnce(): Promise<void> {
    await pollSqsMessages(
      this.client,
      this.queueUrl,
      'fulfillment-worker',
      'order-events',
      (body, receiptHandle) => this.consume(body, receiptHandle),
    );
  }

  private async consume(body?: string, receiptHandle?: string): Promise<void> {
    await consumeSqsMessage({
      client: this.client,
      queueUrl: this.queueUrl,
      component: 'fulfillment-worker',
      parse: parseOrderPaidEvent,
      process: (event) => this.processOrderPaid.execute(event),
    }, body, receiptHandle);
  }
}
