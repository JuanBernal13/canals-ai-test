import { CreateOrder } from './create-order.js';
import type { IdempotencyRepository, StoredResponse } from '../ports/idempotency-repository.js';
import { OrderError } from '../../domain/orders/order.error.js';
import type { CreateOrderInput } from '../../domain/orders/order.types.js';
import { ERROR_MESSAGE, HTTP_STATUS } from '../../shared/constants.js';
import { toOrderResponse } from '../mappers/order-response.js';
import type { RequestFingerprint } from '../ports/request-fingerprint.js';

export type CreateOrderOutcome = StoredResponse & { replayed: boolean };

export class IdempotentCreateOrder {
  constructor(
    private readonly createOrder: CreateOrder,
    private readonly idempotency: IdempotencyRepository,
    private readonly fingerprint: RequestFingerprint,
  ) {}

  async execute(input: CreateOrderInput, key: string): Promise<CreateOrderOutcome> {
    const started = await this.idempotency.start({
      key,
      customerId: input.customerId,
      fingerprint: this.fingerprint.create(input),
    });
    if (started.kind === 'replay') return { ...started.response, replayed: true };
    if (started.kind === 'conflict') {
      return response(HTTP_STATUS.CONFLICT, { error: ERROR_MESSAGE.IDEMPOTENCY_CONFLICT });
    }
    if (started.kind === 'processing') {
      const recovered = await this.createOrder.recover(key);
      if (recovered) {
        const recoveredResponse = response(HTTP_STATUS.ACCEPTED, toOrderResponse(recovered));
        await this.idempotency.complete(key, recoveredResponse);
        return recoveredResponse;
      }
      return response(HTTP_STATUS.CONFLICT, { error: ERROR_MESSAGE.IDEMPOTENCY_PROCESSING });
    }

    let result: StoredResponse;
    try {
      const order = await this.createOrder.execute(input, key);
      result = response(HTTP_STATUS.ACCEPTED, toOrderResponse(order));
    } catch (error) {
      if (error instanceof OrderError)
        result = response(error.statusCode, { error: error.message });
      else throw error;
    }
    await this.idempotency.complete(key, result);
    return { ...result, replayed: false };
  }
}

function response(statusCode: number, body: Record<string, unknown>): CreateOrderOutcome {
  return { statusCode, body, replayed: false };
}
