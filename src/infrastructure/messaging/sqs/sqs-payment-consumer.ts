import type { SQSClient } from '@aws-sdk/client-sqs';
import type { ProcessPaymentRequested } from '../../../application/use-cases/process-payment-requested.js';
import { parsePaymentRequestedEvent } from '../../../domain/events/payment-requested.event.js';
import { consumeSqsMessage, pollSqsMessages } from './sqs-consumer-helpers.js';

export class SqsPaymentConsumerAdapter {
  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
    private readonly processPayment: ProcessPaymentRequested,
  ) {}

  async pollOnce(): Promise<void> {
    await pollSqsMessages(
      this.client,
      this.queueUrl,
      'payment-worker',
      'payment-requests',
      (body, receiptHandle) => this.consume(body, receiptHandle),
    );
  }

  private async consume(body?: string, receiptHandle?: string): Promise<void> {
    await consumeSqsMessage({
      client: this.client,
      queueUrl: this.queueUrl,
      component: 'payment-worker',
      parse: parsePaymentRequestedEvent,
      process: (event) => this.processPayment.execute(event),
    }, body, receiptHandle);
  }
}
