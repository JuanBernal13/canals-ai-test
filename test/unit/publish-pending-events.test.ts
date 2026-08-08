import { describe, expect, it, vi } from 'vitest';
import type { EventPublisher } from '../../src/application/ports/event-publisher.js';
import type { OutboxEvent, OutboxRepository } from '../../src/application/ports/outbox-repository.js';
import { PublishPendingEvents } from '../../src/application/use-cases/publish-pending-events.js';

describe('PublishPendingEvents', () => {
  it('preserves order inside a group while publishing different groups concurrently', async () => {
    const events = [event('a-1', 'a'), event('a-2', 'a'), event('b-1', 'b')];
    const release = deferred();
    const published: string[] = [];
    const outbox = repository(events);
    const publisher: EventPublisher = {
      publish: vi.fn(async (item) => {
        published.push(item.id);
        if (item.id === 'a-1') await release.promise;
      }),
    };

    const execution = new PublishPendingEvents(outbox, publisher, 'worker-1').execute(10);
    await vi.waitFor(() => expect(published).toEqual(['a-1', 'b-1']));
    release.resolve();
    await execution;

    expect(published).toEqual(['a-1', 'b-1', 'a-2']);
    expect(outbox.markPublished).toHaveBeenCalledTimes(3);
  });

  it('does not publish a later event when an earlier event in its group fails', async () => {
    const events = [event('a-1', 'a'), event('a-2', 'a')];
    const outbox = repository(events);
    const publisher: EventPublisher = {
      publish: vi.fn().mockRejectedValueOnce(new Error('SQS unavailable')),
    };

    await new PublishPendingEvents(outbox, publisher, 'worker-1').execute(10);

    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(outbox.markFailed).toHaveBeenCalledTimes(2);
  });
});

function event(id: string, groupKey: string): OutboxEvent {
  return { id, type: 'ReservationRequested', payload: { groupKey }, attempts: 1 };
}

function repository(events: OutboxEvent[]): OutboxRepository {
  return {
    claimPending: vi.fn().mockResolvedValue(events),
    markPublished: vi.fn(),
    markFailed: vi.fn(),
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => {};
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
