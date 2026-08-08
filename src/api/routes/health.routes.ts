import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { HEALTH_STATUS, HTTP_STATUS, ROUTE } from '../../shared/constants.js';
import { livenessRouteSchema, readinessRouteSchema } from '../schemas/health.schemas.js';
import type { DependencyChecks } from '../../application/ports/dependency-checks.js';

export type { DependencyChecks } from '../../application/ports/dependency-checks.js';

type DependencyStatus = {
  status: typeof HEALTH_STATUS.UP | typeof HEALTH_STATUS.DOWN;
  responseTimeMs: number;
};

type HealthRoutesOptions = { checks: DependencyChecks };

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (app, options) => {
  app.get(ROUTE.LIVENESS, { schema: livenessRouteSchema }, async () => ({
    status: HEALTH_STATUS.OK,
  }));

  const statusHandler = async (_request: FastifyRequest, reply: FastifyReply) => {
    const dependencies = await checkDependencies(options.checks);
    const ready = Object.values(dependencies).every(
      (dependency) => dependency.status === HEALTH_STATUS.UP,
    );
    return reply.code(ready ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE).send({
      status: ready ? HEALTH_STATUS.READY : HEALTH_STATUS.NOT_READY,
      checkedAt: new Date().toISOString(),
      dependencies,
    });
  };

  app.get(ROUTE.READINESS, { schema: readinessRouteSchema }, statusHandler);
  app.get(ROUTE.STATUS, { schema: readinessRouteSchema }, statusHandler);
};

async function checkDependencies(
  checks: DependencyChecks,
): Promise<Record<keyof DependencyChecks, DependencyStatus>> {
  const entries = await Promise.all(
    Object.entries(checks).map(async ([name, check]) => {
      const startedAt = performance.now();
      try {
        await check();
        return [name, { status: HEALTH_STATUS.UP, responseTimeMs: elapsed(startedAt) }] as const;
      } catch {
        return [name, { status: HEALTH_STATUS.DOWN, responseTimeMs: elapsed(startedAt) }] as const;
      }
    }),
  );
  return Object.fromEntries(entries) as Record<keyof DependencyChecks, DependencyStatus>;
}

function elapsed(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}
