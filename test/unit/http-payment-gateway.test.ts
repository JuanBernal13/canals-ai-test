import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpPaymentGatewayAdapter } from '../../src/infrastructure/payments/http-payment-gateway.js';
import {
  PaymentConnectionError,
  PaymentUnavailableError,
} from '../../src/domain/payments/payment.error.js';

const charge = {
  cardNumber: '4242424242424242',
  amountMinor: 2_500n,
  currency: 'USD',
  description: 'Order order-1',
  idempotencyKey: 'checkout-1',
};

afterEach(() => vi.unstubAllGlobals());

describe('HttpPaymentGatewayAdapter', () => {
  it('reconciles a server error before deciding the charge result', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'temporary' }, 500))
      .mockResolvedValueOnce(jsonResponse({ status: 'succeeded', reference: 'pay_1' }, 200));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new HttpPaymentGatewayAdapter('http://payments.local', 100).charge(charge);

    expect(result).toEqual({ reference: 'pay_1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats a definitive client rejection as unavailable without querying again', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'invalid request' }, 400));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new HttpPaymentGatewayAdapter('http://payments.local', 100).charge(charge))
      .rejects.toBeInstanceOf(PaymentUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('normalizes status lookup transport failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network failure')));

    await expect(new HttpPaymentGatewayAdapter('http://payments.local', 100).findByIdempotencyKey('checkout-1'))
      .rejects.toBeInstanceOf(PaymentConnectionError);
  });
});

function jsonResponse(body: object, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
