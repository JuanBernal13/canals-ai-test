import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PaymentGateway } from '../../src/application/ports/payment-gateway.js';
import {
  PaymentConnectionError,
  PaymentDeclinedError,
  PaymentUnavailableError,
  PaymentUnknownError,
} from '../../src/domain/payments/payment.error.js';
import { CircuitBreakerPaymentGatewayAdapter } from '../../src/infrastructure/payments/circuit-breaker-payment-gateway.js';
import { PAYMENT_STATUS } from '../../src/shared/constants.js';

const chargeInput = {
  cardNumber: '4242424242424242',
  amountMinor: 1_000n,
  currency: 'USD',
  description: 'Order order-1',
  idempotencyKey: 'checkout-1',
};

afterEach(() => {
  vi.useRealTimers();
});

describe('CircuitBreakerPaymentGatewayAdapter', () => {
  it('opens after consecutive unknown results and recovers with one half-open probe', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T12:00:00.000Z'));
    const gateway = paymentGateway();
    vi.mocked(gateway.charge).mockRejectedValue(new PaymentConnectionError());
    const circuit = new CircuitBreakerPaymentGatewayAdapter(gateway, 2, 1_000);

    await expect(circuit.charge(chargeInput)).rejects.toBeInstanceOf(PaymentConnectionError);
    await expect(circuit.charge(chargeInput)).rejects.toBeInstanceOf(PaymentConnectionError);
    await expect(circuit.charge(chargeInput)).rejects.toBeInstanceOf(PaymentUnavailableError);
    expect(gateway.charge).toHaveBeenCalledTimes(2);

    vi.setSystemTime(new Date('2026-08-07T12:00:01.001Z'));
    vi.mocked(gateway.charge).mockResolvedValueOnce({ reference: 'pay_recovered' });
    await expect(circuit.charge(chargeInput)).resolves.toEqual({ reference: 'pay_recovered' });
    expect(gateway.charge).toHaveBeenCalledTimes(3);
  });

  it('does not open for business declines', async () => {
    const gateway = paymentGateway();
    vi.mocked(gateway.charge).mockRejectedValue(new PaymentDeclinedError());
    const circuit = new CircuitBreakerPaymentGatewayAdapter(gateway, 1, 1_000);

    await expect(circuit.charge(chargeInput)).rejects.toBeInstanceOf(PaymentDeclinedError);
    await expect(circuit.charge(chargeInput)).rejects.toBeInstanceOf(PaymentDeclinedError);
    expect(gateway.charge).toHaveBeenCalledTimes(2);
  });

  it('does not open for ambiguous results while the provider is reachable', async () => {
    const gateway = paymentGateway();
    vi.mocked(gateway.charge).mockRejectedValue(new PaymentUnknownError());
    const circuit = new CircuitBreakerPaymentGatewayAdapter(gateway, 1, 1_000);

    await expect(circuit.charge(chargeInput)).rejects.toBeInstanceOf(PaymentUnknownError);
    await expect(circuit.charge(chargeInput)).rejects.toBeInstanceOf(PaymentUnknownError);
    expect(gateway.charge).toHaveBeenCalledTimes(2);
  });
});

function paymentGateway(): PaymentGateway {
  return {
    charge: vi.fn(),
    findByIdempotencyKey: vi.fn().mockResolvedValue({ status: PAYMENT_STATUS.NOT_FOUND }),
  };
}
