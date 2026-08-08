import type { FastifyInstance } from 'fastify';
import { OrderError } from '../domain/orders/order.error.js';
import {
  PaymentDeclinedError,
  PaymentUnavailableError,
  PaymentUnknownError,
} from '../domain/payments/payment.error.js';
import { ERROR_MESSAGE, HTTP_STATUS } from '../shared/constants.js';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof OrderError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    if (error instanceof PaymentDeclinedError) {
      return reply.code(HTTP_STATUS.PAYMENT_REQUIRED).send({ error: error.message });
    }
    if (error instanceof PaymentUnavailableError || error instanceof PaymentUnknownError) {
      return reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({ error: error.message });
    }
    const fastifyError = toFastifyError(error);
    if (fastifyError.validation) {
      return reply.code(HTTP_STATUS.BAD_REQUEST).send({
        error: ERROR_MESSAGE.INVALID_REQUEST,
        details: fastifyError.validation,
      });
    }
    if (fastifyError.statusCode === HTTP_STATUS.PAYLOAD_TOO_LARGE) {
      return reply
        .code(HTTP_STATUS.PAYLOAD_TOO_LARGE)
        .send({ error: ERROR_MESSAGE.REQUEST_TOO_LARGE });
    }
    if (fastifyError.statusCode === HTTP_STATUS.TOO_MANY_REQUESTS) {
      return reply
        .code(HTTP_STATUS.TOO_MANY_REQUESTS)
        .send({ error: ERROR_MESSAGE.RATE_LIMIT_EXCEEDED });
    }
    if (fastifyError.statusCode === HTTP_STATUS.BAD_REQUEST) {
      return reply.code(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGE.INVALID_REQUEST });
    }
    request.log.error({ err: error }, ERROR_MESSAGE.INTERNAL_SERVER_ERROR);
    return reply
      .code(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .send({ error: ERROR_MESSAGE.INTERNAL_SERVER_ERROR });
  });
}

function toFastifyError(error: unknown): { statusCode?: number; validation?: object[] } {
  if (typeof error !== 'object' || error === null) return {};
  const candidate = error as { statusCode?: unknown; validation?: unknown };
  return {
    ...(typeof candidate.statusCode === 'number' ? { statusCode: candidate.statusCode } : {}),
    ...(Array.isArray(candidate.validation)
      ? { validation: candidate.validation as object[] }
      : {}),
  };
}
