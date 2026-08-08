import { createHash } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CRYPTO,
  ERROR_MESSAGE,
  HEALTH_STATUS,
  HEADER,
  HTTP_STATUS,
  LIMIT,
  PAYMENT,
  PAYMENT_STATUS,
  ROUTE,
  VALIDATION,
} from '../../shared/constants.js';

const paymentSchema = z.object({
  creditCardNumber: z
    .string()
    .min(VALIDATION.CARD_MIN_LENGTH)
    .max(VALIDATION.CARD_MAX_LENGTH)
    .regex(/^\d+$/),
  amountMinor: z.string().regex(/^\d+$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  description: z.string().min(1).max(VALIDATION.PAYMENT_DESCRIPTION_LENGTH),
});

type StoredPayment = { fingerprint: string; statusCode: number; body: object };

export function buildMockPaymentServer(logger = true): FastifyInstance {
  const app = Fastify({ logger, bodyLimit: LIMIT.PAYMENT_BODY_BYTES });
  const payments = new Map<string, StoredPayment>();

  app.get(ROUTE.PAYMENT_HEALTH, async () => ({ status: HEALTH_STATUS.READY }));
  app.get<{ Params: { key: string } }>(ROUTE.PAYMENT_BY_KEY, async (request, reply) => {
    const payment = payments.get(request.params.key);
    if (!payment)
      return reply.code(HTTP_STATUS.NOT_FOUND).send({ status: PAYMENT_STATUS.NOT_FOUND });
    if (payment.statusCode === HTTP_STATUS.PAYMENT_REQUIRED)
      return { status: PAYMENT_STATUS.DECLINED };
    const reference = 'reference' in payment.body ? payment.body.reference : undefined;
    return { status: PAYMENT_STATUS.SUCCEEDED, reference };
  });
  app.post(ROUTE.PAYMENTS, async (request, reply) => {
    const key = request.headers[HEADER.IDEMPOTENCY_KEY];
    const parsed = paymentSchema.safeParse(request.body);
    if (
      typeof key !== 'string' ||
      key.length < 1 ||
      key.length > LIMIT.IDEMPOTENCY_KEY_LENGTH ||
      !parsed.success
    ) {
      return reply
        .code(HTTP_STATUS.BAD_REQUEST)
        .send({ error: ERROR_MESSAGE.INVALID_PAYMENT_REQUEST });
    }
    const fingerprint = createHash(CRYPTO.HASH_ALGORITHM)
      .update(JSON.stringify(parsed.data))
      .digest('hex');
    const existing = payments.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return reply.code(HTTP_STATUS.CONFLICT).send({ error: ERROR_MESSAGE.IDEMPOTENCY_CONFLICT });
      }
      return reply.code(existing.statusCode).send(existing.body);
    }
    const declined = parsed.data.creditCardNumber.endsWith(PAYMENT.DECLINED_CARD_SUFFIX);
    const statusCode = declined ? HTTP_STATUS.PAYMENT_REQUIRED : HTTP_STATUS.CREATED;
    const body = declined
      ? { error: ERROR_MESSAGE.PAYMENT_DECLINED }
      : {
          reference: `${PAYMENT.REFERENCE_PREFIX}${createHash(CRYPTO.HASH_ALGORITHM)
            .update(key)
            .digest('hex')
            .slice(0, 24)}`,
        };
    payments.set(key, { fingerprint, statusCode, body });
    return reply.code(statusCode).send(body);
  });

  return app;
}
