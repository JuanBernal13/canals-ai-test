import { createHash } from 'node:crypto';
import { Prisma } from '../../../generated/prisma/client.js';
import type { Point } from '../../../domain/warehouses/point.js';
import { EVENT_TYPE } from '../../../shared/constants.js';

export class PrismaOutboxEventWriter {
  async createReservationRequested(
    transaction: Prisma.TransactionClient,
    orderId: string,
    destination: Point,
    productIds: string[],
  ): Promise<void> {
    const groupKey = createHash('sha256').update([...productIds].sort().join(':')).digest('hex');
    await transaction.outboxEvent.create({
      data: {
        type: EVENT_TYPE.RESERVATION_REQUESTED,
        payload: { orderId, destination, groupKey },
      },
    });
  }

  async createOrderPaid(
    transaction: Prisma.TransactionClient,
    orderId: string,
    warehouseId: string,
  ): Promise<void> {
    await transaction.outboxEvent.create({
      data: {
        type: EVENT_TYPE.ORDER_PAID,
        payload: { orderId, warehouseId },
      },
    });
  }

  async createPaymentRequested(
    transaction: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    await transaction.outboxEvent.create({
      data: {
        type: EVENT_TYPE.PAYMENT_REQUESTED,
        payload: { orderId },
      },
    });
  }
}
