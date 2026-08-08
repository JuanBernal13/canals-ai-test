import { ERROR_MESSAGE } from '../../shared/constants.js';

export class PaymentDeclinedError extends Error {
  constructor() { super(ERROR_MESSAGE.PAYMENT_DECLINED); }
}

export class PaymentUnavailableError extends Error {
  constructor() { super(ERROR_MESSAGE.PAYMENT_UNAVAILABLE); }
}

export class PaymentUnknownError extends Error {
  constructor() { super(ERROR_MESSAGE.PAYMENT_UNKNOWN); }
}

export class PaymentConnectionError extends PaymentUnknownError {
  constructor() {
    super();
    this.message = ERROR_MESSAGE.PAYMENT_CONNECTION;
  }
}
