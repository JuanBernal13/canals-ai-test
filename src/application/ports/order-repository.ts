import type {
  OrderDetails,
  OrderResult,
  PendingPaymentOrder,
  QueuedOrder,
} from '../../domain/orders/order.types.js';
import type { Point } from '../../domain/warehouses/point.js';

export interface OrderRepository {
  findById(orderId: string): Promise<OrderDetails | null>;
  findByPaymentKey(paymentKey: string): Promise<OrderResult | null>;
  findPendingPayment(orderId: string): Promise<PendingPaymentOrder | null>;
  findPendingPayments(limit: number): Promise<PendingPaymentOrder[]>;
  enqueue(input: QueuedOrder, destination: Point, paymentKey: string): Promise<OrderResult>;
  reservePending(orderId: string, destination: Point): Promise<void>;
  markReservationFailed(orderId: string): Promise<void>;
  markPaid(orderId: string, paymentReference: string): Promise<OrderResult>;
  markPaymentFailedAndRelease(orderId: string): Promise<void>;
}
