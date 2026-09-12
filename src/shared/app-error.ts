import {
  ERROR_CODE,
  ERROR_MESSAGE,
  HTTP_STATUS,
  type ErrorCode,
} from './constants.js';

export type AppErrorOptions = {
  code: ErrorCode;
  statusCode?: number;
  retryable?: boolean;
  expose?: boolean;
  cause?: unknown;
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly expose: boolean;

  constructor(message: string, options: AppErrorOptions) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = new.target.name;
    this.code = options.code;
    this.statusCode = options.statusCode ?? HTTP_STATUS.INTERNAL_SERVER_ERROR;
    this.retryable = options.retryable ?? false;
    this.expose = options.expose ?? false;
  }
}

export class InvariantError extends AppError {
  constructor(message: string, code: ErrorCode, cause?: unknown) {
    super(message, {
      code,
      statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      retryable: false,
      expose: false,
      ...(cause === undefined ? {} : { cause }),
    });
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError(ERROR_MESSAGE.INTERNAL_SERVER_ERROR, {
    code: ERROR_CODE.UNEXPECTED_ERROR,
    statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    retryable: true,
    expose: false,
    cause: error,
  });
}

export function hasErrorCode(error: unknown, code: ErrorCode): error is AppError {
  return error instanceof AppError && error.code === code;
}

export function errorMetadata(error: unknown): {
  errorName: string;
  errorCode: ErrorCode;
  errorMessage: string;
  retryable: boolean;
} {
  const normalized = toAppError(error);
  return {
    errorName: error instanceof Error ? error.name : normalized.name,
    errorCode: normalized.code,
    errorMessage: error instanceof Error ? error.message : String(error),
    retryable: normalized.retryable,
  };
}
