import { SendMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import type { EventPublisher } from '../../../application/ports/event-publisher.js';
import type { OutboxEvent } from '../../../application/ports/outbox-repository.js';
import { ERROR_MESSAGE, EVENT_TYPE } from '../../../shared/constants.js';
import { logQueueEvent } from './queue-log.js';

export class SqsEventPublisherAdapter implements EventPublisher {
  constructor(
    private readonly client: SQSClient,
    private readonly queues: { orderEvents: string; reservations: string; payments: string },
  ) {}

  async publish(event: OutboxEvent): Promise<void> {
    const message = { eventId: event.id, type: event.type, payload: event.payload };
    if (event.type === EVENT_TYPE.ORDER_PAID) {
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: this.queues.orderEvents,
          MessageBody: JSON.stringify(message),
        }),
      );
      logQueueEvent('outbox-publisher', 'event_published', {
        eventId: event.id,
        eventType: event.type,
        queue: 'order-events',
      });
      return;
    }
    if (event.type === EVENT_TYPE.PAYMENT_REQUESTED) {
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: this.queues.payments,
          MessageBody: JSON.stringify(message),
        }),
      );
      logQueueEvent('outbox-publisher', 'event_published', {
        eventId: event.id,
        eventType: event.type,
        queue: 'payment-requests',
      });
      return;
    }
    if (event.type === EVENT_TYPE.RESERVATION_REQUESTED && isRecord(event.payload)) {
      const groupKey = event.payload.groupKey;
      if (typeof groupKey !== 'string') throw new Error(ERROR_MESSAGE.INVALID_QUEUE_EVENT);
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: this.queues.reservations,
          MessageBody: JSON.stringify(message),
          MessageGroupId: groupKey,
          MessageDeduplicationId: event.id,
        }),
      );
      logQueueEvent('outbox-publisher', 'event_published', {
        eventId: event.id,
        eventType: event.type,
        queue: 'inventory-reservations.fifo',
        groupKey,
      });
      return;
    }
    throw new Error(ERROR_MESSAGE.UNSUPPORTED_QUEUE_EVENT);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
