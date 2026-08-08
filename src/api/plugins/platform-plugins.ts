import type { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ROUTE } from '../../shared/constants.js';

export async function registerPlatformPlugins(app: FastifyInstance): Promise<void> {
  await registerDocumentation(app);
  await registerSecurity(app);
  await app.register(rateLimit, { global: false });
}

async function registerDocumentation(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Canals Order API',
        description: 'Minimal production-ready order management service',
        version: '1.0.0',
      },
      tags: [
        { name: 'orders', description: 'Order creation and retrieval' },
        { name: 'health', description: 'Process and dependency health' },
      ],
    },
  });
  await app.register(swaggerUi, {
    routePrefix: ROUTE.DOCUMENTATION,
    staticCSP: true,
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });
}

async function registerSecurity(app: FastifyInstance): Promise<void> {
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: {
      directives: {
        formAction: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'", ...app.swaggerCSP.script],
        styleSrc: ["'self'", 'https:', ...app.swaggerCSP.style],
      },
    },
  });
}
