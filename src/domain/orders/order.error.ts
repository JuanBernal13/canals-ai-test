import { AppError } from '../../shared/app-error.js';
import { ERROR_CODE, type ErrorCode } from '../../shared/constants.js';

type OrderErrorOptions = {
  code?: ErrorCode;
  retryable?: boolean;
  cause?: unknown;
};

export class OrderError extends AppError {
  constructor(message: string, statusCode: number, options: OrderErrorOptions = {}) {
    super(message, {
      code: options.code ?? ERROR_CODE.ORDER_ERROR,
      statusCode,
      retryable: options.retryable ?? false,
      expose: true,
      ...(options.cause === undefined ? {} : { cause: options.cause }),
    });
  }
}
