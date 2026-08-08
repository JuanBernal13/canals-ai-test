import type { EventPublisher } from '../ports/event-publisher.js';
import type { OutboxRepository } from '../ports/outbox-repository.js';
import type { ProcessLogger } from '../ports/process-logger.js';

export class PublishPendingEvents {
  constructor(
    private readonly outbox: OutboxRepository,
    private readonly publisher: EventPublisher,
    private readonly workerId: string,
    private readonly logger: ProcessLogger = NOOP_LOGGER,
  ) {}

  async execute(batchSize: number): Promise<number> {
    const events = await this.outbox.claimPending(batchSize, this.workerId);
    if (events.length > 0) {
      this.logger.info('batch_claimed', { messageCount: events.length });
    }
    const groups = new Map<string, typeof events>();
    for (const event of events) {
      const key = orderingKey(event.payload) ?? event.id;
      const group = groups.get(key) ?? [];
      group.push(event);
      groups.set(key, group);
    }
    await Promise.all([...groups.values()].map(async group => {
      for (let index = 0; index < group.length; index += 1) {
        const event = group[index]!;
        if (await this.publish(event)) continue;
        await Promise.all(
          group
            .slice(index + 1)
            .map((pending) => this.outbox.markFailed(pending.id, this.workerId, pending.attempts)),
        );
        break;
      }
    }));
    return events.length;
  }

  private async publish(
    event: Awaited<ReturnType<OutboxRepository['claimPending']>>[number],
  ): Promise<boolean> {
      try {
        await this.publisher.publish(event);
        await this.outbox.markPublished(event.id, this.workerId);
        this.logger.info('outbox_marked_published', { eventId: event.id });
        return true;
      } catch (error) {
        await this.outbox.markFailed(event.id, this.workerId, event.attempts);
        this.logger.error('event_publish_failed', {
          eventId: event.id,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
  }
}

const NOOP_LOGGER: ProcessLogger = { info: () => {}, error: () => {} };

function orderingKey(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const groupKey = (payload as Record<string, unknown>).groupKey;
  return typeof groupKey === 'string' ? groupKey : null;
}
