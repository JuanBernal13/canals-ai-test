import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import { setTimeout as delay } from 'node:timers/promises';
import { config } from '../../../config/index.js';
import { PrismaOutboxEventWriter } from './prisma-outbox-event-writer.js';
import type { OrderRepository } from '../../../application/ports/order-repository.js';
import { OrderError } from '../../../domain/orders/order.error.js';
import { assertOrderTransition } from '../../../domain/orders/order-transition.js';
import type {
  OrderDetails,
  OrderResult,
  PendingPaymentOrder,
  QueuedOrder,
} from '../../../domain/orders/order.types.js';
import type { Point } from '../../../domain/warehouses/point.js';
import {
  DATABASE_ERROR_CODE,
  ERROR_MESSAGE,
  HTTP_STATUS,
  LIMIT,
  ORDER_STATUS,
} from '../../../shared/constants.js';

type WarehouseCandidate = { id: string };
type UpdatedCount = { updated: bigint };
type PersistedPendingOrder = OrderResult & {
  paymentKey: string;
  paymentCardNumber: string;
  reservationExpiresAt: Date | null;
};

export class PrismaOrderRepositoryAdapter implements OrderRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly outboxEvents = new PrismaOutboxEventWriter(),
  ) {}

  findById(orderId: string): Promise<OrderDetails | null> {
    return this.db.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        customerId: true,
        warehouseId: true,
        status: true,
        totalMinor: true,
        currency: true,
        shippingAddress: true,
        paymentReference: true,
        createdAt: true,
        items: {
          select: { productId: true, quantity: true, unitPriceMinor: true },
        },
      },
    });
  }

  findByPaymentKey(paymentKey: string): Promise<OrderResult | null> {
    return this.db.order.findUnique({
      where: { paymentKey },
      select: {
        id: true,
        customerId: true,
        warehouseId: true,
        status: true,
        totalMinor: true,
        currency: true,
        createdAt: true,
      },
    });
  }

  async findPendingPayment(orderId: string): Promise<PendingPaymentOrder | null> {
    const order = await this.db.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        customerId: true,
        warehouseId: true,
        totalMinor: true,
        currency: true,
        createdAt: true,
        paymentKey: true,
        paymentCardNumber: true,
        reservationExpiresAt: true,
      },
    });
    if (!order || order.status !== ORDER_STATUS.PENDING_PAYMENT) return null;
    return toPendingPaymentOrder(order);
  }

  async findPendingPayments(limit: number): Promise<PendingPaymentOrder[]> {
    const orders = await this.db.order.findMany({
      where: {
        status: ORDER_STATUS.PENDING_PAYMENT,
        reservationExpiresAt: { lte: new Date() },
      },
      orderBy: { reservationExpiresAt: 'asc' },
      take: limit,
      select: {
        id: true,
        status: true,
        customerId: true,
        warehouseId: true,
        totalMinor: true,
        currency: true,
        createdAt: true,
        paymentKey: true,
        paymentCardNumber: true,
        reservationExpiresAt: true,
      },
    });
    return orders
      .map(toPendingPaymentOrder)
      .filter((order): order is PendingPaymentOrder => order !== null);
  }

  async enqueue(
    input: QueuedOrder,
    destination: Point,
    paymentKey: string,
  ): Promise<OrderResult> {
    const products = await this.db.product.findMany({
      where: { id: { in: input.items.map((item) => item.productId) } },
      select: { id: true, unitPriceMinor: true, currency: true },
    });
    if (products.length !== input.items.length) {
      throw new OrderError(ERROR_MESSAGE.UNKNOWN_PRODUCT, HTTP_STATUS.BAD_REQUEST);
    }
    const currencies = new Set(products.map((product) => product.currency));
    if (currencies.size !== 1) {
      throw new OrderError(ERROR_MESSAGE.MIXED_CURRENCIES, HTTP_STATUS.BAD_REQUEST);
    }
    const currency = products[0]!.currency;
    const productsById = new Map(products.map((product) => [product.id, product]));
    const totalMinor = input.items.reduce((total, item) => {
      const product = productsById.get(item.productId)!;
      return total + product.unitPriceMinor * BigInt(item.quantity);
    }, 0n);

    try {
      return await this.db.$transaction(async (transaction) => {
        const order = await transaction.order.create({
          data: {
            customerId: input.customerId,
            status: ORDER_STATUS.PENDING_RESERVATION,
            totalMinor,
            currency,
            shippingAddress: input.shippingAddress,
            paymentKey,
            paymentCardNumber: input.paymentCardNumber,
            items: {
              create: input.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                unitPriceMinor: productsById.get(item.productId)!.unitPriceMinor,
              })),
            },
          },
        });
        await this.outboxEvents.createReservationRequested(
          transaction,
          order.id,
          destination,
          input.items.map((item) => item.productId),
        );
        return order;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === DATABASE_ERROR_CODE.FOREIGN_KEY_CONSTRAINT
      ) {
        throw new OrderError(ERROR_MESSAGE.UNKNOWN_CUSTOMER, HTTP_STATUS.BAD_REQUEST);
      }
      throw error;
    }
  }

  async reservePending(orderId: string, destination: Point): Promise<void> {
    const pending = await this.db.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });
    if (pending.status !== ORDER_STATUS.PENDING_RESERVATION) {
      return;
    }

    const requestedItems = JSON.stringify(
      pending.items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
      })),
    );
    const candidates = await this.db.$queryRaw<WarehouseCandidate[]>(Prisma.sql`
      WITH requested AS (
        SELECT product_id::uuid AS product_id, quantity
        FROM jsonb_to_recordset(${requestedItems}::jsonb)
          AS item(product_id text, quantity integer)
      )
      SELECT warehouse.id
      FROM "Warehouse" AS warehouse
      JOIN "Inventory" AS inventory ON inventory.warehouse_id = warehouse.id
      JOIN requested ON requested.product_id = inventory.product_id
      GROUP BY warehouse.id, warehouse.latitude, warehouse.longitude
      HAVING COUNT(*) = (SELECT COUNT(*) FROM requested)
        AND BOOL_AND(inventory.on_hand - inventory.reserved >= requested.quantity)
      ORDER BY 6371 * 2 * ASIN(LEAST(1, SQRT(
        POWER(SIN(RADIANS(warehouse.latitude - ${destination.latitude}) / 2), 2)
        + COS(RADIANS(${destination.latitude})) * COS(RADIANS(warehouse.latitude))
        * POWER(SIN(RADIANS(warehouse.longitude - ${destination.longitude}) / 2), 2)
      ))), warehouse.id
    `);
    if (candidates.length === 0) {
      throw new OrderError(ERROR_MESSAGE.NO_WAREHOUSE, HTTP_STATUS.CONFLICT);
    }

    for (const warehouse of candidates) {
      for (let attempt = 1; attempt <= config.database.transaction.attempts; attempt += 1) {
        try {
          await this.db.$transaction(
            async (transaction) => {
              const [reservation] = await transaction.$queryRaw<UpdatedCount[]>`
              WITH requested AS (
                SELECT product_id::uuid AS product_id, quantity
                FROM jsonb_to_recordset(${requestedItems}::jsonb)
                  AS item(product_id text, quantity integer)
              ), reserved_inventory AS (
                UPDATE "Inventory" AS inventory
                SET "reserved" = inventory."reserved" + requested.quantity
                FROM requested
                WHERE inventory."warehouse_id" = ${warehouse.id}::uuid
                  AND inventory."product_id" = requested.product_id
                  AND inventory."on_hand" - inventory."reserved" >= requested.quantity
                RETURNING inventory."product_id"
              )
              SELECT COUNT(*) AS updated FROM reserved_inventory
            `;
              if (Number(reservation?.updated ?? 0n) !== pending.items.length) {
                throw new OrderError(ERROR_MESSAGE.WAREHOUSE_CHANGED, HTTP_STATUS.CONFLICT);
              }
              const updated = await transaction.order.updateMany({
                where: { id: orderId, status: ORDER_STATUS.PENDING_RESERVATION },
                data: {
                  warehouseId: warehouse.id,
                  status: ORDER_STATUS.PENDING_PAYMENT,
                  reservationExpiresAt: new Date(Date.now() + LIMIT.RESERVATION_TTL_MS),
                },
              });
              if (updated.count !== 1) {
                throw new OrderError(ERROR_MESSAGE.WAREHOUSE_CHANGED, HTTP_STATUS.CONFLICT);
              }
              await this.outboxEvents.createPaymentRequested(transaction, orderId);
            },
            {
              isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
              maxWait: config.database.transaction.maxWaitMs,
              timeout: config.database.transaction.timeoutMs,
            },
          );
          return;
        } catch (error) {
          if (isTransactionConflict(error)) {
            if (attempt < config.database.transaction.attempts) {
              await delay(retryDelay(attempt));
              continue;
            }
            break;
          }
          if (error instanceof OrderError && error.message === ERROR_MESSAGE.WAREHOUSE_CHANGED) {
            break;
          }
          throw error;
        }
      }
    }
    throw new OrderError(ERROR_MESSAGE.INVENTORY_CHANGED, HTTP_STATUS.CONFLICT);
  }

  async markReservationFailed(orderId: string): Promise<void> {
    await this.db.order.updateMany({
      where: { id: orderId, status: ORDER_STATUS.PENDING_RESERVATION },
      data: { status: ORDER_STATUS.RESERVATION_FAILED },
    });
  }

  async markPaid(orderId: string, paymentReference: string): Promise<OrderResult> {
    return this.db.$transaction(async (transaction) => {
      const pendingOrder = await transaction.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { items: true },
      });
      if (pendingOrder.warehouseId === null) throw new Error(ERROR_MESSAGE.RESERVATION_MISSING);
      assertOrderTransition(pendingOrder.status, ORDER_STATUS.PAID);
      const updated = await transaction.order.updateMany({
        where: { id: orderId, status: ORDER_STATUS.PENDING_PAYMENT },
        data: { status: ORDER_STATUS.PAID, paymentReference },
      });
      if (updated.count !== 1) {
        throw new OrderError(ERROR_MESSAGE.ORDER_NOT_PENDING, HTTP_STATUS.CONFLICT);
      }
      const items = JSON.stringify(
        pendingOrder.items.map((item) => ({
          product_id: item.productId,
          quantity: item.quantity,
        })),
      );
      const [confirmation] = await transaction.$queryRaw<UpdatedCount[]>`
        WITH requested AS (
          SELECT product_id::uuid AS product_id, quantity
          FROM jsonb_to_recordset(${items}::jsonb)
            AS item(product_id text, quantity integer)
        ), confirmed_inventory AS (
          UPDATE "Inventory" AS inventory
          SET "on_hand" = inventory."on_hand" - requested.quantity,
              "reserved" = inventory."reserved" - requested.quantity
          FROM requested
          WHERE inventory."warehouse_id" = ${pendingOrder.warehouseId}::uuid
            AND inventory."product_id" = requested.product_id
            AND inventory."reserved" >= requested.quantity
          RETURNING inventory."product_id"
        )
        SELECT COUNT(*) AS updated FROM confirmed_inventory
      `;
      if (Number(confirmation?.updated ?? 0n) !== pendingOrder.items.length) {
        throw new Error(ERROR_MESSAGE.RESERVATION_MISSING);
      }
      const order = await transaction.order.findUniqueOrThrow({ where: { id: orderId } });
      if (order.warehouseId === null) throw new Error(ERROR_MESSAGE.RESERVATION_MISSING);
      await this.outboxEvents.createOrderPaid(transaction, order.id, order.warehouseId);
      return order;
    });
  }

  async markPaymentFailedAndRelease(orderId: string): Promise<void> {
    await this.db.$transaction(async (transaction) => {
      const order = await transaction.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { items: true },
      });
      if (order.warehouseId === null) throw new Error(ERROR_MESSAGE.RESERVATION_MISSING);
      if (order.status === ORDER_STATUS.PAYMENT_FAILED) return;
      assertOrderTransition(order.status, ORDER_STATUS.PAYMENT_FAILED);
      const updated = await transaction.order.updateMany({
        where: { id: orderId, status: ORDER_STATUS.PENDING_PAYMENT },
        data: { status: ORDER_STATUS.PAYMENT_FAILED },
      });
      if (updated.count === 0) {
        const currentOrder = await transaction.order.findUniqueOrThrow({ where: { id: orderId } });
        if (currentOrder.status === ORDER_STATUS.PAYMENT_FAILED) return;
        assertOrderTransition(currentOrder.status, ORDER_STATUS.PAYMENT_FAILED);
        return;
      }
      const items = JSON.stringify(
        order.items.map((item) => ({
          product_id: item.productId,
          quantity: item.quantity,
        })),
      );
      const [release] = await transaction.$queryRaw<UpdatedCount[]>`
        WITH requested AS (
          SELECT product_id::uuid AS product_id, quantity
          FROM jsonb_to_recordset(${items}::jsonb)
            AS item(product_id text, quantity integer)
        ), released_inventory AS (
          UPDATE "Inventory" AS inventory
          SET "reserved" = inventory."reserved" - requested.quantity
          FROM requested
          WHERE inventory."warehouse_id" = ${order.warehouseId}::uuid
            AND inventory."product_id" = requested.product_id
            AND inventory."reserved" >= requested.quantity
          RETURNING inventory."product_id"
        )
        SELECT COUNT(*) AS updated FROM released_inventory
      `;
      if (Number(release?.updated ?? 0n) !== order.items.length) {
        throw new Error(ERROR_MESSAGE.RESERVATION_MISSING);
      }
    });
  }

}

function retryDelay(attempt: number): number {
  const backoff = Math.min(
    config.database.transaction.backoffBaseMs * 2 ** (attempt - 1),
    config.database.transaction.backoffMaxMs,
  );
  const jitter = Math.floor(Math.random() * config.database.transaction.jitterMs);
  return backoff + jitter;
}

function isTransactionConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === DATABASE_ERROR_CODE.TRANSACTION_CONFLICT) return true;
  if (error.code === DATABASE_ERROR_CODE.TRANSACTION_API_ERROR) return true;
  if (error.code !== DATABASE_ERROR_CODE.RAW_QUERY_FAILED) return false;
  if (!isRecord(error.meta)) return false;
  const driverAdapterError = error.meta.driverAdapterError;
  if (!isRecord(driverAdapterError)) return false;
  const cause = driverAdapterError.cause;
  if (!isRecord(cause)) return false;
  return cause.originalCode === DATABASE_ERROR_CODE.SERIALIZATION_CONFLICT;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toPendingPaymentOrder(order: PersistedPendingOrder): PendingPaymentOrder | null {
  if (order.warehouseId === null || order.reservationExpiresAt === null) return null;
  return {
    id: order.id,
    status: order.status,
    customerId: order.customerId,
    warehouseId: order.warehouseId,
    totalMinor: order.totalMinor,
    currency: order.currency,
    createdAt: order.createdAt,
    paymentKey: order.paymentKey,
    paymentCardNumber: order.paymentCardNumber,
    reservationExpiresAt: order.reservationExpiresAt,
  };
}
