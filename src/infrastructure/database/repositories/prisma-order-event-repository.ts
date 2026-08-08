import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import { assertOrderTransition } from '../../../domain/orders/order-transition.js';
import { ORDER_STATUS } from '../../../shared/constants.js';
import type { OrderEventRepository } from '../../../application/ports/order-event-repository.js';

export class PrismaOrderEventRepositoryAdapter implements OrderEventRepository {
  constructor(private readonly db: PrismaClient) {}

  async markReadyFromEvent(eventId: string, orderId: string): Promise<void> {
    await this.db.$transaction(async (transaction) => {
      const alreadyProcessed = await transaction.inboxMessage.findUnique({ where: { eventId } });
      if (alreadyProcessed) return;
      const order = await transaction.order.findUniqueOrThrow({ where: { id: orderId } });
      assertOrderTransition(order.status, ORDER_STATUS.READY_TO_FULFILL);
      const updated = await transaction.order.updateMany({
        where: { id: orderId, status: ORDER_STATUS.PAID },
        data: { status: ORDER_STATUS.READY_TO_FULFILL },
      });
      if (updated.count !== 1) throw new Error(`Order ${orderId} is not ready to process`);
      await transaction.inboxMessage.create({ data: { eventId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }
}
