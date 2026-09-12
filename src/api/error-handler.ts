import type { FastifyInstance } from 'fastify';
import { AppError, toAppError } from '../shared/app-error.js';
import {
  ERROR_CODE,
  ERROR_MESSAGE,
  HTTP_STATUS,
  type ErrorCode,
} from '../shared/constants.js';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const normalized = normalizeHttpError(error);
    if (!normalized.error.expose || normalized.error.statusCode >= 500) {
      request.log.error(
        {
          err: error,
          errorCode: normalized.error.code,
          retryable: normalized.error.retryable,
        },
        normalized.error.message,
      );
    }
    return reply.code(normalized.error.statusCode).send({
      error: normalized.error.expose
        ? normalized.error.message
        : ERROR_MESSAGE.INTERNAL_SERVER_ERROR,
      ...(normalized.details === undefined ? {} : { details: normalized.details }),
    });
  });
}

function normalizeHttpError(error: unknown): { error: AppError; details?: object[] } {
  if (error instanceof AppError) return { error };
  const fastifyError = toFastifyError(error);
  if (fastifyError.validation) {
    return {
      error: exposedError(
        ERROR_MESSAGE.INVALID_REQUEST,
        ERROR_CODE.INVALID_REQUEST,
        HTTP_STATUS.BAD_REQUEST,
      ),
      details: fastifyError.validation,
    };
  }
  if (fastifyError.statusCode === HTTP_STATUS.PAYLOAD_TOO_LARGE) {
    return {
      error: exposedError(
        ERROR_MESSAGE.REQUEST_TOO_LARGE,
        ERROR_CODE.PAYLOAD_TOO_LARGE,
        HTTP_STATUS.PAYLOAD_TOO_LARGE,
      ),
    };
  }
  if (fastifyError.statusCode === HTTP_STATUS.TOO_MANY_REQUESTS) {
    return {
      error: exposedError(
        ERROR_MESSAGE.RATE_LIMIT_EXCEEDED,
        ERROR_CODE.RATE_LIMIT_EXCEEDED,
        HTTP_STATUS.TOO_MANY_REQUESTS,
      ),
    };
  }
  if (fastifyError.statusCode === HTTP_STATUS.BAD_REQUEST) {
    return {
      error: exposedError(
        ERROR_MESSAGE.INVALID_REQUEST,
        ERROR_CODE.INVALID_REQUEST,
        HTTP_STATUS.BAD_REQUEST,
      ),
    };
  }
  return { error: toAppError(error) };
}

function exposedError(message: string, code: ErrorCode, statusCode: number): AppError {
  return new AppError(message, { code, statusCode, expose: true });
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
