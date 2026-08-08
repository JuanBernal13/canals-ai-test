import { describe, expect, it, vi } from 'vitest';
import type { IdempotentCreateOrder } from '../../src/application/use-cases/idempotent-create-order.js';
import type { GetOrder } from '../../src/application/use-cases/get-order.js';
import { buildServer } from '../../src/api/server.js';
import { ERROR_MESSAGE, LIMIT, ROUTE } from '../../src/shared/constants.js';

const createOrder = { execute: vi.fn() } as unknown as IdempotentCreateOrder;
const getOrder = { execute: vi.fn() } as unknown as GetOrder;
const checks = {
  database: async () => {},
  payments: async () => {},
  queue: async () => {},
};

describe('Fastify server plugins', () => {
  it('serves generated OpenAPI, Swagger UI, security headers and closes resources', async () => {
    const closeResources = vi.fn().mockResolvedValue(undefined);
    const app = await buildServer(
      { createOrder, getOrder, dependencyChecks: checks },
      { closeResources, logger: false },
    );

    const specification = await app.inject({ method: 'GET', url: ROUTE.OPENAPI });
    expect(specification.statusCode).toBe(200);
    expect(specification.json()).toMatchObject({
      openapi: '3.1.0',
      paths: {
        [ROUTE.ORDERS]: {
          post: { summary: 'Submit an order for asynchronous reservation and payment' },
        },
      },
    });

    const documentation = await app.inject({ method: 'GET', url: `${ROUTE.DOCUMENTATION}/` });
    expect(documentation.statusCode).toBe(200);
    expect(documentation.headers['content-type']).toContain('text/html');

    const health = await app.inject({ method: 'GET', url: ROUTE.LIVENESS });
    expect(health.headers['x-content-type-options']).toBe('nosniff');
    expect(health.headers['content-security-policy']).toBeDefined();

    await app.close();
    expect(closeResources).toHaveBeenCalledTimes(1);
  }, 15_000);

  it('uses route schemas and the centralized validation error response', async () => {
    const app = await buildServer(
      { createOrder, getOrder, dependencyChecks: checks },
      { logger: false },
    );
    const response = await app.inject({ method: 'POST', url: ROUTE.ORDERS, payload: {} });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: ERROR_MESSAGE.INVALID_REQUEST });
    expect(createOrder.execute).not.toHaveBeenCalled();
    await app.close();
  });

  it('rate limits only the order creation endpoint', async () => {
    const app = await buildServer(
      { createOrder, getOrder, dependencyChecks: checks },
      { logger: false },
    );
    for (let request = 0; request < LIMIT.ORDER_RATE_LIMIT_MAX; request += 1) {
      const response = await app.inject({ method: 'POST', url: ROUTE.ORDERS, payload: {} });
      expect(response.statusCode).toBe(400);
    }

    const limited = await app.inject({ method: 'POST', url: ROUTE.ORDERS, payload: {} });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: ERROR_MESSAGE.RATE_LIMIT_EXCEEDED });

    const health = await app.inject({ method: 'GET', url: ROUTE.LIVENESS });
    expect(health.statusCode).toBe(200);
    await app.close();
  });
});
