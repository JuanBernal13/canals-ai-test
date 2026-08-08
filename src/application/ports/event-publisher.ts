import type { OutboxEvent } from './outbox-repository.js';

export interface EventPublisher {
  publish(event: OutboxEvent): Promise<void>;
}
