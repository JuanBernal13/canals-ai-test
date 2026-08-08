import { SendMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import { describe, expect, it, vi } from 'vitest';
import type { OutboxEvent } from '../../src/application/ports/outbox-repository.js';
import { SqsEventPublisherAdapter } from '../../src/infrastructure/messaging/sqs/sqs-event-publisher.js';
import { EVENT_TYPE } from '../../src/shared/constants.js';

const queues = {
  orderEvents: 'http://sqs.local/order-events',
  reservations: 'http://sqs.local/inventory-reservations.fifo',
  payments: 'http://sqs.local/payment-requests',
};

describe('SqsEventPublisherAdapter', () => {
  it('publishes inventory requests with FIFO ordering attributes', async () => {
    const { publisher, send } = dependencies();
    const event = outboxEvent(EVENT_TYPE.RESERVATION_REQUESTED, {
      orderId: 'order-1',
      groupKey: 'products-a-b',
    });

    await publisher.publish(event);

    const command = vi.mocked(send).mock.calls[0]![0] as SendMessageCommand;
    expect(command.input).toMatchObject({
      QueueUrl: queues.reservations,
      MessageGroupId: 'products-a-b',
      MessageDeduplicationId: event.id,
    });
  });

  it('routes payment requests to the scalable Standard queue', async () => {
    const { publisher, send } = dependencies();

    await publisher.publish(outboxEvent(EVENT_TYPE.PAYMENT_REQUESTED, { orderId: 'order-1' }));

    const command = vi.mocked(send).mock.calls[0]![0] as SendMessageCommand;
    expect(command.input.QueueUrl).toBe(queues.payments);
    expect(command.input.MessageGroupId).toBeUndefined();
  });

  it('routes paid events to the fulfillment queue', async () => {
    const { publisher, send } = dependencies();

    await publisher.publish(outboxEvent(EVENT_TYPE.ORDER_PAID, { orderId: 'order-1' }));

    const command = vi.mocked(send).mock.calls[0]![0] as SendMessageCommand;
    expect(command.input.QueueUrl).toBe(queues.orderEvents);
  });
});

function dependencies() {
  const send = vi.fn().mockResolvedValue({});
  const client = { send } as unknown as SQSClient;
  return { publisher: new SqsEventPublisherAdapter(client, queues), send };
}

function outboxEvent(type: string, payload: object): OutboxEvent {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    type,
    payload,
    attempts: 1,
  };
}
