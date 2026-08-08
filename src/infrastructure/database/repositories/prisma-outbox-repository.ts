import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import type { OutboxEvent, OutboxRepository } from '../../../application/ports/outbox-repository.js';
import { LIMIT } from '../../../shared/constants.js';

export class PrismaOutboxRepositoryAdapter implements OutboxRepository {
  constructor(private readonly db: PrismaClient) {}

  claimPending(limit: number, workerId: string): Promise<OutboxEvent[]> {
    return this.db.$queryRaw<OutboxEvent[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "OutboxEvent"
        WHERE "published_at" IS NULL
          AND "available_at" <= CURRENT_TIMESTAMP
          AND ("claim_until" IS NULL OR "claim_until" < CURRENT_TIMESTAMP)
        ORDER BY "created_at"
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      , updated AS (
        UPDATE "OutboxEvent" AS event
        SET "claimed_by" = ${workerId}::uuid,
            "claim_until" = CURRENT_TIMESTAMP + make_interval(secs => ${LIMIT.OUTBOX_CLAIM_SECONDS}),
            "attempts" = event."attempts" + 1
        FROM candidates
        WHERE event."id" = candidates."id"
        RETURNING event."id", event."type", event."payload", event."attempts", event."created_at"
      )
      SELECT "id", "type", "payload", "attempts"
      FROM updated
      ORDER BY "created_at", "id"
    `);
  }

  async markPublished(id: string, workerId: string): Promise<void> {
    await this.db.outboxEvent.updateMany({
      where: { id, claimedBy: workerId },
      data: { publishedAt: new Date(), claimedBy: null, claimUntil: null },
    });
  }

  async markFailed(id: string, workerId: string, attempts: number): Promise<void> {
    const retryDelay = LIMIT.OUTBOX_RETRY_BASE_MS
      * 2 ** Math.min(attempts - 1, LIMIT.OUTBOX_MAX_BACKOFF_EXPONENT);
    await this.db.outboxEvent.updateMany({
      where: { id, claimedBy: workerId },
      data: {
        availableAt: new Date(Date.now() + retryDelay),
        claimedBy: null,
        claimUntil: null,
      },
    });
  }
}
