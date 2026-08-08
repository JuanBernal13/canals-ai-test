import type { FastifyPluginAsync } from 'fastify';
import { ROUTE } from '../../shared/constants.js';

export const openApiAliasRoutes: FastifyPluginAsync = async (app) => {
  app.get(ROUTE.OPENAPI, { schema: { hide: true } }, async () => app.swagger());
};
