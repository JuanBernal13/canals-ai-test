export type ChargeInput = {
  cardNumber: string;
  amountMinor: bigint;
  currency: string;
  description: string;
  idempotencyKey: string;
};

export interface PaymentGateway {
  charge(input: ChargeInput): Promise<{ reference: string }>;
  findByIdempotencyKey(key: string): Promise<
    | { status: typeof PAYMENT_STATUS.SUCCEEDED; reference: string }
    | { status: typeof PAYMENT_STATUS.DECLINED }
    | { status: typeof PAYMENT_STATUS.NOT_FOUND }
  >;
}
import { PAYMENT_STATUS } from '../../shared/constants.js';
