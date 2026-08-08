import type { ORDER_STATUS } from '../../shared/constants.js';

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export type Address = {
  line1: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

export type OrderItemInput = { productId: string; quantity: number };
export type CreateOrderInput = {
  customerId: string;
  shippingAddress: Address;
  items: OrderItemInput[];
  payment: { creditCardNumber: string };
};
export type ReservableOrder = Omit<CreateOrderInput, 'payment'>;
export type QueuedOrder = ReservableOrder & { paymentCardNumber: string };
export type OrderResult = {
  id: string;
  status: OrderStatus;
  customerId: string;
  warehouseId: string | null;
  totalMinor: bigint;
  currency: string;
  createdAt: Date;
};
export type OrderDetails = OrderResult & {
  paymentReference: string | null;
  shippingAddress: unknown;
  items: Array<{
    productId: string;
    quantity: number;
    unitPriceMinor: bigint;
  }>;
};
export type PendingPaymentOrder = OrderResult & {
  warehouseId: string;
  paymentKey: string;
  paymentCardNumber: string;
  reservationExpiresAt: Date;
};
