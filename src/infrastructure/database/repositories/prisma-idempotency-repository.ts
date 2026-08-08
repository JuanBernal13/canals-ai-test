import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import type {
  IdempotencyRepository,
  IdempotencyStart,
  StoredResponse,
} from '../../../application/ports/idempotency-repository.js';
import { DATABASE_ERROR_CODE, IDEMPOTENCY_STATUS, LIMIT } from '../../../shared/constants.js';

export class PrismaIdempotencyRepositoryAdapter implements IdempotencyRepository {
  constructor(private readonly db: PrismaClient) {}

  async start(input: {
    key: string;
    customerId: string;
    fingerprint: string;
  }): Promise<IdempotencyStart> {
    try {
      await this.db.idempotencyKey.create({
        data: { ...input, expiresAt: new Date(Date.now() + LIMIT.IDEMPOTENCY_RETENTION_MS) },
      });
      return { kind: 'acquired' };
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== DATABASE_ERROR_CODE.UNIQUE_CONSTRAINT
      )
        throw error;
    }

    const existing = await this.db.idempotencyKey.findUniqueOrThrow({ where: { key: input.key } });
    if (existing.customerId !== input.customerId || existing.fingerprint !== input.fingerprint) {
      return { kind: 'conflict' };
    }
    if (existing.status === IDEMPOTENCY_STATUS.PROCESSING) {
      const staleBefore = new Date(Date.now() - LIMIT.IDEMPOTENCY_PROCESSING_TIMEOUT_MS);
      if (existing.createdAt <= staleBefore) {
        const reclaimed = await this.db.$transaction(
          async (transaction) => {
            const order = await transaction.order.findUnique({
              where: { paymentKey: input.key },
              select: { id: true },
            });
            if (order) return false;
            const updated = await transaction.idempotencyKey.updateMany({
              where: {
                key: input.key,
                status: IDEMPOTENCY_STATUS.PROCESSING,
                createdAt: { lte: staleBefore },
              },
              data: {
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + LIMIT.IDEMPOTENCY_RETENTION_MS),
              },
            });
            return updated.count === 1;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        if (reclaimed) return { kind: 'acquired' };
      }
      return { kind: 'processing' };
    }
    return { kind: 'replay', response: parseStoredResponse(existing.response) };
  }

  async complete(key: string, response: StoredResponse): Promise<void> {
    const jsonResponse = JSON.parse(JSON.stringify(response)) as Prisma.InputJsonValue;
    await this.db.idempotencyKey.update({
      where: { key },
      data: {
        status: IDEMPOTENCY_STATUS.COMPLETED,
        response: jsonResponse,
        completedAt: new Date(),
      },
    });
  }
}

function parseStoredResponse(value: Prisma.JsonValue | null): StoredResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid stored idempotency response');
  const statusCode = value.statusCode;
  const body = value.body;
  if (
    typeof statusCode !== 'number' ||
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body)
  ) {
    throw new Error('Invalid stored idempotency response');
  }
  return { statusCode, body: body as Record<string, unknown> };
}
