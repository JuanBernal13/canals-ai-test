import type { ChargeInput, PaymentGateway } from '../../application/ports/payment-gateway.js';
import { setTimeout as delay } from 'node:timers/promises';
import {
  PaymentConnectionError,
  PaymentDeclinedError,
  PaymentUnavailableError,
  PaymentUnknownError,
} from '../../domain/payments/payment.error.js';
import { CONTENT_TYPE, HEADER, HTTP_STATUS, LIMIT, PAYMENT_STATUS, ROUTE } from '../../shared/constants.js';

type PaymentStatus = Awaited<ReturnType<PaymentGateway['findByIdempotencyKey']>>;

export class HttpPaymentGatewayAdapter implements PaymentGateway {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async charge(input: ChargeInput): Promise<{ reference: string }> {
    try {
      const response = await fetch(new URL(ROUTE.PAYMENTS, this.baseUrl), {
        method: 'POST',
        headers: {
          [HEADER.CONTENT_TYPE]: CONTENT_TYPE.JSON,
          [HEADER.IDEMPOTENCY_KEY]: input.idempotencyKey,
        },
        body: JSON.stringify({
          creditCardNumber: input.cardNumber,
          amountMinor: input.amountMinor.toString(),
          currency: input.currency,
          description: input.description,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return await this.parseChargeResponse(response);
    } catch (error) {
      if (error instanceof PaymentDeclinedError || error instanceof PaymentUnavailableError) throw error;
      return await this.resolveAmbiguousResult(input.idempotencyKey);
    }
  }

  async findByIdempotencyKey(key: string): Promise<PaymentStatus> {
    let response: Response;
    try {
      response = await fetch(new URL(`${ROUTE.PAYMENTS}/${encodeURIComponent(key)}`, this.baseUrl), {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new PaymentConnectionError();
    }
    if (response.status === HTTP_STATUS.NOT_FOUND) return { status: PAYMENT_STATUS.NOT_FOUND };
    if (!response.ok) throw new PaymentUnknownError();
    try {
      const body = await response.json() as { status?: unknown; reference?: unknown };
      if (body.status === PAYMENT_STATUS.DECLINED) return { status: PAYMENT_STATUS.DECLINED };
      if (body.status === PAYMENT_STATUS.SUCCEEDED && typeof body.reference === 'string') {
        return { status: PAYMENT_STATUS.SUCCEEDED, reference: body.reference };
      }
      throw new PaymentUnknownError();
    } catch (error) {
      if (error instanceof PaymentUnknownError) throw error;
      throw new PaymentUnknownError();
    }
  }

  private async parseChargeResponse(response: Response): Promise<{ reference: string }> {
    if (response.status === HTTP_STATUS.PAYMENT_REQUIRED) throw new PaymentDeclinedError();
    if (response.status === HTTP_STATUS.REQUEST_TIMEOUT
      || response.status >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
      throw new PaymentUnknownError();
    }
    if (!response.ok) throw new PaymentUnavailableError();
    const body = await response.json() as { reference?: unknown };
    if (typeof body.reference !== 'string') throw new PaymentUnknownError();
    return { reference: body.reference };
  }

  private async resolveAmbiguousResult(key: string): Promise<{ reference: string }> {
    let connectionFailures = 0;
    for (let attempt = 1; attempt <= LIMIT.PAYMENT_RECONCILIATION_ATTEMPTS; attempt += 1) {
      try {
        const payment = await this.findByIdempotencyKey(key);
        if (payment.status === PAYMENT_STATUS.SUCCEEDED) return { reference: payment.reference };
        if (payment.status === PAYMENT_STATUS.DECLINED) throw new PaymentDeclinedError();
      } catch (error) {
        if (error instanceof PaymentDeclinedError) throw error;
        if (error instanceof PaymentConnectionError) connectionFailures += 1;
      }
      if (attempt < LIMIT.PAYMENT_RECONCILIATION_ATTEMPTS) {
        await delay(attempt * LIMIT.PAYMENT_RECONCILIATION_BACKOFF_MS);
      }
    }
    if (connectionFailures === LIMIT.PAYMENT_RECONCILIATION_ATTEMPTS) {
      throw new PaymentConnectionError();
    }
    throw new PaymentUnknownError();
  }
}
