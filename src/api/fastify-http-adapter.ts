import type { FastifyInstance } from 'fastify';
import { buildServer, type BuildServerOptions } from './server.js';
import type { ApiRouteDependencies } from './routes/register-api-routes.js';

export class FastifyHttpAdapter {
  constructor(private readonly dependencies: ApiRouteDependencies) {}

  build(options: BuildServerOptions = {}): Promise<FastifyInstance> {
    return buildServer(this.dependencies, options);
  }
}
