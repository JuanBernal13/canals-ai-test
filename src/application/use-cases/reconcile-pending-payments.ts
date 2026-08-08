import type { OrderRepository } from '../ports/order-repository.js';
import type { PaymentGateway } from '../ports/payment-gateway.js';
import type { PendingPaymentOrder } from '../../domain/orders/order.types.js';
import { PAYMENT_STATUS } from '../../shared/constants.js';

export class ReconcilePendingPayments {
  constructor(
    private readonly orders: OrderRepository,
    private readonly payments: PaymentGateway,
  ) {}

  async execute(limit: number): Promise<number> {
    const pendingOrders = await this.orders.findPendingPayments(limit);
    await Promise.allSettled(pendingOrders.map(order => this.reconcile(order)));
    return pendingOrders.length;
  }

  private async reconcile(order: PendingPaymentOrder): Promise<void> {
    const payment = await this.payments.findByIdempotencyKey(order.paymentKey);
    if (payment.status === PAYMENT_STATUS.SUCCEEDED) {
      await this.orders.markPaid(order.id, payment.reference);
      return;
    }
    if (payment.status === PAYMENT_STATUS.DECLINED) {
      await this.orders.markPaymentFailedAndRelease(order.id);
      return;
    }
    if (order.reservationExpiresAt <= new Date()) {
      await this.orders.markPaymentFailedAndRelease(order.id);
    }
  }
}
