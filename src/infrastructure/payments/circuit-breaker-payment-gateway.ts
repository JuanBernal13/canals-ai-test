import type { ChargeInput, PaymentGateway } from '../../application/ports/payment-gateway.js';
import {
  PaymentConnectionError,
  PaymentUnavailableError,
} from '../../domain/payments/payment.error.js';
import { ERROR_MESSAGE } from '../../shared/constants.js';

const CIRCUIT_STATE = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
} as const;

type CircuitState = (typeof CIRCUIT_STATE)[keyof typeof CIRCUIT_STATE];

export class CircuitBreakerPaymentGatewayAdapter implements PaymentGateway {
  private state: CircuitState = CIRCUIT_STATE.CLOSED;
  private consecutiveFailures = 0;
  private openedAt = 0;

  constructor(
    private readonly gateway: PaymentGateway,
    private readonly failureThreshold: number,
    private readonly resetAfterMs: number,
  ) {
    if (failureThreshold < 1 || resetAfterMs < 1) {
      throw new RangeError(ERROR_MESSAGE.INVALID_CIRCUIT_BREAKER_CONFIG);
    }
  }

  charge(input: ChargeInput): Promise<{ reference: string }> {
    return this.execute(
      () => this.gateway.charge(input),
      () => new PaymentUnavailableError(),
    );
  }

  findByIdempotencyKey(key: string): ReturnType<PaymentGateway['findByIdempotencyKey']> {
    return this.execute(
      () => this.gateway.findByIdempotencyKey(key),
      () => new PaymentConnectionError(),
    );
  }

  private async execute<T>(operation: () => Promise<T>, openError: () => Error): Promise<T> {
    if (!this.acquireRequest()) throw openError();
    try {
      const result = await operation();
      this.close();
      return result;
    } catch (error) {
      if (error instanceof PaymentConnectionError) this.recordFailure();
      else this.close();
      throw error;
    }
  }

  private acquireRequest(): boolean {
    if (this.state === CIRCUIT_STATE.CLOSED) return true;
    if (this.state === CIRCUIT_STATE.HALF_OPEN) return false;
    if (Date.now() - this.openedAt < this.resetAfterMs) return false;
    this.state = CIRCUIT_STATE.HALF_OPEN;
    return true;
  }

  private recordFailure(): void {
    if (this.state === CIRCUIT_STATE.HALF_OPEN) {
      this.open();
      return;
    }
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) this.open();
  }

  private open(): void {
    this.state = CIRCUIT_STATE.OPEN;
    this.openedAt = Date.now();
  }

  private close(): void {
    this.state = CIRCUIT_STATE.CLOSED;
    this.consecutiveFailures = 0;
    this.openedAt = 0;
  }
}
