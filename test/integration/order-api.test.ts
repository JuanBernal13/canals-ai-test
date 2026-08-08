import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CreateOrder } from '../../src/application/use-cases/create-order.js';
import { GetOrder } from '../../src/application/use-cases/get-order.js';
import { IdempotentCreateOrder } from '../../src/application/use-cases/idempotent-create-order.js';
import { ProcessPaymentRequested } from '../../src/application/use-cases/process-payment-requested.js';
import { ProcessReservationRequested } from '../../src/application/use-cases/process-reservation-requested.js';
import { buildServer } from '../../src/api/server.js';
import { config } from '../../src/config/index.js';
import { prisma } from '../../src/infrastructure/database/prisma-client.js';
import { PrismaIdempotencyRepositoryAdapter } from '../../src/infrastructure/database/repositories/prisma-idempotency-repository.js';
import { PrismaOrderRepositoryAdapter } from '../../src/infrastructure/database/repositories/prisma-order-repository.js';
import { MockGeocoderAdapter } from '../../src/infrastructure/geocoding/mock-geocoder.js';
import {
  createRequestFingerprint,
  HmacRequestFingerprintAdapter,
} from '../../src/infrastructure/idempotency/create-request-fingerprint.js';
import { HttpPaymentGatewayAdapter } from '../../src/infrastructure/payments/http-payment-gateway.js';
import { parsePaymentRequestedEvent } from '../../src/domain/events/payment-requested.event.js';
import { parseReservationRequestedEvent } from '../../src/domain/events/reservation-requested.event.js';
import { PrismaOutboxRepositoryAdapter } from '../../src/infrastructure/database/repositories/prisma-outbox-repository.js';
import { CURRENCY, EVENT_TYPE, LIMIT } from '../../src/shared/constants.js';

const customerId = randomUUID();
const productId = randomUUID();
const warehouseId = randomUUID();
const fallbackProductId = randomUUID();
const concurrentWarehouseId = randomUUID();
const idempotencyKey = `integration-${randomUUID()}`;
const declinedKey = `declined-${randomUUID()}`;
const fallbackKey = `fallback-${randomUUID()}`;
const staleKey = `stale-${randomUUID()}`;
const unknownCityKey = `unknown-city-${randomUUID()}`;
const createdOrderIds: string[] = [];
const repository = new PrismaOrderRepositoryAdapter(prisma);
const processReservation = new ProcessReservationRequested(repository);
const processPayment = new ProcessPaymentRequested(
  repository,
  new HttpPaymentGatewayAdapter(config.payment.baseUrl, config.payment.timeoutMs),
);
const app = await buildServer(
  {
    createOrder: new IdempotentCreateOrder(
      new CreateOrder(
        repository,
        new MockGeocoderAdapter(),
      ),
      new PrismaIdempotencyRepositoryAdapter(prisma),
      new HmacRequestFingerprintAdapter(config.idempotencySecret),
    ),
    getOrder: new GetOrder(repository),
    dependencyChecks: {
      database: async () => {
        await prisma.$queryRaw`SELECT 1`;
      },
      payments: async () => {},
      queue: async () => {},
    },
  },
  { logger: false },
);

let orderId: string | undefined;

beforeAll(async () => {
  await prisma.customer.create({
    data: { id: customerId, email: `${customerId}@test.local`, name: 'Integration Customer' },
  });
  await prisma.product.create({
    data: {
      id: productId,
      sku: `SKU-${productId}`,
      name: 'Integration Product',
      unitPriceMinor: 500n,
      currency: CURRENCY.USD,
    },
  });
  await prisma.product.create({
    data: {
      id: fallbackProductId,
      sku: `SKU-${fallbackProductId}`,
      name: 'Fallback Product',
      unitPriceMinor: 200n,
      currency: CURRENCY.USD,
    },
  });
  await prisma.warehouse.create({
    data: { id: warehouseId, name: 'Integration Bogota', latitude: 4.7, longitude: -74.07 },
  });
  await prisma.inventory.create({ data: { warehouseId, productId, onHand: 10, reserved: 0 } });
  await prisma.warehouse.create({
    data: {
      id: concurrentWarehouseId,
      name: 'Concurrent Bogota',
      latitude: 4.71,
      longitude: -74.08,
    },
  });
  await prisma.inventory.createMany({
    data: [
      { warehouseId, productId: fallbackProductId, onHand: 0, reserved: 0 },
      { warehouseId: concurrentWarehouseId, productId: fallbackProductId, onHand: 5, reserved: 0 },
    ],
  });
});

afterAll(async () => {
  const ownedOrderIds = [orderId, ...createdOrderIds].filter(
    (id): id is string => id !== undefined,
  );
  for (const createdId of ownedOrderIds) {
    await prisma.outboxEvent.deleteMany({
      where: { payload: { path: ['orderId'], equals: createdId } },
    });
  }
  await prisma.order.deleteMany({ where: { id: { in: ownedOrderIds } } });
  await prisma.idempotencyKey.deleteMany({
    where: {
      key: {
        in: [idempotencyKey, declinedKey, fallbackKey, staleKey, unknownCityKey],
      },
    },
  });
  await prisma.inventory.deleteMany({ where: { warehouseId, productId } });
  await prisma.inventory.deleteMany({
    where: {
      productId: fallbackProductId,
    },
  });
  await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
  await prisma.warehouse.deleteMany({ where: { id: concurrentWarehouseId } });
  await prisma.product.deleteMany({
    where: { id: { in: [productId, fallbackProductId] } },
  });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await app.close();
  await prisma.$disconnect();
});

describe('order API', () => {
  it('queues, replays, reserves, pays and retrieves an order', async () => {
    const payload = {
      customerId,
      shippingAddress: {
        line1: 'Calle 1',
        city: 'Bogota',
        region: 'Bogota',
        postalCode: '110111',
        country: 'CO',
      },
      items: [{ productId, quantity: 2 }],
      payment: { creditCardNumber: '4242424242424242' },
    };
    const first = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': idempotencyKey },
      payload,
    });
    expect(first.statusCode).toBe(202);
    expect(first.json()).not.toHaveProperty('paymentKey');
    expect(first.json()).not.toHaveProperty('reservationExpiresAt');
    orderId = first.json<{ id: string }>().id;
    expect(first.json<{ status: string; warehouseId: string | null }>()).toMatchObject({
      status: 'PENDING_RESERVATION',
      warehouseId: null,
    });

    const replay = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': idempotencyKey },
      payload,
    });
    expect(replay.statusCode).toBe(202);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.json()).toEqual(first.json());

    await processReservationFor(orderId);
    await processPaymentFor(orderId);

    const fetched = await app.inject({ method: 'GET', url: `/orders/${orderId}` });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json<{ id: string; status: string }>()).toMatchObject({
      id: orderId,
      status: 'PAID',
    });
    expect(fetched.json()).not.toHaveProperty('paymentKey');
    expect(fetched.json()).not.toHaveProperty('reservationExpiresAt');

    const inventory = await prisma.inventory.findUniqueOrThrow({
      where: { warehouseId_productId: { warehouseId, productId } },
    });
    expect(inventory.onHand).toBe(8);
    expect(inventory.reserved).toBe(0);
    expect(
      await prisma.outboxEvent.count({
        where: {
          type: EVENT_TYPE.ORDER_PAID,
          payload: { path: ['orderId'], equals: orderId },
        },
      }),
    ).toBe(1);
  });

  it('releases reserved inventory after a declined payment', async () => {
    const before = await prisma.inventory.findUniqueOrThrow({
      where: { warehouseId_productId: { warehouseId, productId } },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': declinedKey },
      payload: {
        customerId,
        shippingAddress: {
          line1: 'Calle 3',
          city: 'Bogota',
          region: 'Bogota',
          postalCode: '110111',
          country: 'CO',
        },
        items: [{ productId, quantity: 1 }],
        payment: { creditCardNumber: '4242424242420000' },
      },
    });
    expect(response.statusCode).toBe(202);
    const declinedOrderId = response.json<{ id: string }>().id;
    createdOrderIds.push(declinedOrderId);
    await processReservationFor(declinedOrderId);
    await processPaymentFor(declinedOrderId);
    const declinedOrder = await prisma.order.findUniqueOrThrow({ where: { id: declinedOrderId } });
    expect(declinedOrder.status).toBe('PAYMENT_FAILED');
    const after = await prisma.inventory.findUniqueOrThrow({
      where: { warehouseId_productId: { warehouseId, productId } },
    });
    expect(after.onHand).toBe(before.onHand);
    expect(after.reserved).toBe(before.reserved);
  });

  it('uses the next closest warehouse when the closest cannot fulfill every item', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': fallbackKey },
      payload: {
        customerId,
        shippingAddress: {
          line1: 'Calle 4',
          city: 'Bogota',
          region: 'Bogota',
          postalCode: '110111',
          country: 'CO',
        },
        items: [{ productId: fallbackProductId, quantity: 1 }],
        payment: { creditCardNumber: '4242424242424242' },
      },
    });
    expect(response.statusCode).toBe(202);
    const queued = response.json<{ id: string }>();
    await processReservationFor(queued.id);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: queued.id } });
    createdOrderIds.push(order.id);
    expect(order.warehouseId).toBe(concurrentWarehouseId);
  });

  it('returns 422 for a city the mock geocoder does not recognize', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': unknownCityKey },
      payload: {
        customerId,
        shippingAddress: {
          line1: 'Unknown address',
          city: 'Atlantis',
          region: 'Unknown',
          postalCode: '00000',
          country: 'US',
        },
        items: [{ productId, quantity: 1 }],
        payment: { creditCardNumber: '4242424242424242' },
      },
    });
    expect(response.statusCode).toBe(422);
  });

  it('reclaims a stale processing key when no order was created', async () => {
    const payload = {
      customerId,
      shippingAddress: {
        line1: 'Calle 5',
        city: 'Bogota',
        region: 'Bogota',
        postalCode: '110111',
        country: 'CO',
      },
      items: [{ productId, quantity: 1 }],
      payment: { creditCardNumber: '4242424242424242' },
    };
    await prisma.idempotencyKey.create({
      data: {
        key: staleKey,
        customerId,
        fingerprint: createRequestFingerprint(payload, config.idempotencySecret),
        createdAt: new Date(Date.now() - LIMIT.IDEMPOTENCY_PROCESSING_TIMEOUT_MS - 1_000),
        expiresAt: new Date(Date.now() + LIMIT.IDEMPOTENCY_RETENTION_MS),
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': staleKey },
      payload,
    });
    expect(response.statusCode).toBe(202);
    createdOrderIds.push(response.json<{ id: string }>().id);
  });

  it('claims disjoint outbox batches for concurrent publishers', async () => {
    const ownedOrderIds = [orderId, ...createdOrderIds].filter(
      (id): id is string => id !== undefined,
    );
    for (const ownedOrderId of ownedOrderIds) {
      await prisma.outboxEvent.updateMany({
        where: { payload: { path: ['orderId'], equals: ownedOrderId } },
        data: { publishedAt: new Date() },
      });
    }
    const events = await prisma.outboxEvent.createManyAndReturn({
      data: Array.from({ length: 4 }, () => ({ type: 'TestEvent', payload: {} })),
    });
    const outbox = new PrismaOutboxRepositoryAdapter(prisma);
    const first = await outbox.claimPending(2, randomUUID());
    const second = await outbox.claimPending(2, randomUUID());
    expect(new Set([...first, ...second].map((event) => event.id)).size).toBe(4);
    await prisma.outboxEvent.deleteMany({ where: { id: { in: events.map((event) => event.id) } } });
  });
});

async function processReservationFor(orderIdToProcess: string): Promise<void> {
  const event = await prisma.outboxEvent.findFirstOrThrow({
    where: {
      type: EVENT_TYPE.RESERVATION_REQUESTED,
      payload: { path: ['orderId'], equals: orderIdToProcess },
    },
  });
  await processReservation.execute(
    parseReservationRequestedEvent({ eventId: event.id, type: event.type, payload: event.payload }),
  );
}

async function processPaymentFor(orderIdToProcess: string): Promise<void> {
  const event = await prisma.outboxEvent.findFirstOrThrow({
    where: {
      type: EVENT_TYPE.PAYMENT_REQUESTED,
      payload: { path: ['orderId'], equals: orderIdToProcess },
    },
  });
  await processPayment.execute(
    parsePaymentRequestedEvent({ eventId: event.id, type: event.type, payload: event.payload }),
  );
}
