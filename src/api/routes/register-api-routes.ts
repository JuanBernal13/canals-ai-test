import type { FastifyInstance } from 'fastify';
import type { IdempotentCreateOrder } from '../../application/use-cases/idempotent-create-order.js';
import type { GetOrder } from '../../application/use-cases/get-order.js';
import type { DependencyChecks } from '../../application/ports/dependency-checks.js';
import { healthRoutes } from './health.routes.js';
import { openApiAliasRoutes } from './openapi.routes.js';
import { orderRoutes } from './order.routes.js';

export type ApiRouteDependencies = {
  createOrder: IdempotentCreateOrder;
  getOrder: GetOrder;
  dependencyChecks: DependencyChecks;
};

export async function registerApiRoutes(
  app: FastifyInstance,
  dependencies: ApiRouteDependencies,
): Promise<void> {
  await app.register(healthRoutes, { checks: dependencies.dependencyChecks });
  await app.register(orderRoutes, {
    createOrder: dependencies.createOrder,
    getOrder: dependencies.getOrder,
  });
  await app.register(openApiAliasRoutes);
}
