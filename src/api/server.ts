import Fastify, { type FastifyInstance } from 'fastify';
import { LIMIT } from '../shared/constants.js';
import { config } from '../config/index.js';
import { registerErrorHandler } from './error-handler.js';
import { registerPlatformPlugins } from './plugins/platform-plugins.js';
import { registerApiRoutes, type ApiRouteDependencies } from './routes/register-api-routes.js';

export type BuildServerOptions = {
  closeResources?: () => Promise<void>;
  logger?: boolean;
};

export async function buildServer(
  dependencies: ApiRouteDependencies,
  options: BuildServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? { level: config.api.logLevel },
    bodyLimit: LIMIT.BODY_BYTES,
  });
  await registerPlatformPlugins(app);
  registerErrorHandler(app);
  if (options.closeResources) app.addHook('onClose', options.closeResources);
  await registerApiRoutes(app, dependencies);
  return app;
}
