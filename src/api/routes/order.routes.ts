import type { FastifyPluginAsync } from 'fastify';
import type { IdempotentCreateOrder } from '../../application/use-cases/idempotent-create-order.js';
import type { GetOrder } from '../../application/use-cases/get-order.js';
import type { CreateOrderInput } from '../../domain/orders/order.types.js';
import { HEADER, LIMIT, ROUTE } from '../../shared/constants.js';
import { createOrderRouteSchema, getOrderRouteSchema } from '../schemas/order.schemas.js';

type OrderRoutesOptions = {
  createOrder: IdempotentCreateOrder;
  getOrder: GetOrder;
};

export const orderRoutes: FastifyPluginAsync<OrderRoutesOptions> = async (app, options) => {
  app.post<{
    Body: CreateOrderInput;
    Headers: { 'idempotency-key': string };
  }>(
    ROUTE.ORDERS,
    {
      schema: createOrderRouteSchema,
      config: {
        rateLimit: {
          max: LIMIT.ORDER_RATE_LIMIT_MAX,
          timeWindow: LIMIT.ORDER_RATE_LIMIT_WINDOW_MS,
        },
      },
    },
    async (request, reply) => {
      const key = request.headers[HEADER.IDEMPOTENCY_KEY];
      const outcome = await options.createOrder.execute(request.body, key);
      if (outcome.replayed) reply.header(HEADER.IDEMPOTENCY_REPLAYED, 'true');
      return reply.code(outcome.statusCode).send(outcome.body);
    },
  );

  app.get<{ Params: { orderId: string } }>(
    ROUTE.ORDER_BY_ID,
    {
      schema: getOrderRouteSchema,
    },
    async (request) => {
      return options.getOrder.execute(request.params.orderId);
    },
  );
};
