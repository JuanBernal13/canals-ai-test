import { AppError } from '../../shared/app-error.js';
import { ERROR_CODE, ERROR_MESSAGE, HTTP_STATUS, type ErrorCode } from '../../shared/constants.js';

export class PaymentDeclinedError extends AppError {
  constructor(cause?: unknown) {
    super(ERROR_MESSAGE.PAYMENT_DECLINED, {
      code: ERROR_CODE.PAYMENT_DECLINED,
      statusCode: HTTP_STATUS.PAYMENT_REQUIRED,
      retryable: false,
      expose: true,
      ...(cause === undefined ? {} : { cause }),
    });
  }
}

export class PaymentUnavailableError extends AppError {
  constructor(cause?: unknown) {
    super(ERROR_MESSAGE.PAYMENT_UNAVAILABLE, {
      code: ERROR_CODE.PAYMENT_UNAVAILABLE,
      statusCode: HTTP_STATUS.SERVICE_UNAVAILABLE,
      retryable: true,
      expose: true,
      ...(cause === undefined ? {} : { cause }),
    });
  }
}

export class PaymentUnknownError extends AppError {
  constructor(
    message: string = ERROR_MESSAGE.PAYMENT_UNKNOWN,
    code: ErrorCode = ERROR_CODE.PAYMENT_UNKNOWN,
    cause?: unknown,
  ) {
    super(message, {
      code,
      statusCode: HTTP_STATUS.SERVICE_UNAVAILABLE,
      retryable: true,
      expose: true,
      ...(cause === undefined ? {} : { cause }),
    });
  }
}

export class PaymentConnectionError extends PaymentUnknownError {
  constructor(cause?: unknown) {
    super(ERROR_MESSAGE.PAYMENT_CONNECTION, ERROR_CODE.PAYMENT_CONNECTION, cause);
  }
}
