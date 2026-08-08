const dependencySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'responseTimeMs'],
  properties: {
    status: { type: 'string', enum: ['up', 'down'] },
    responseTimeMs: { type: 'integer', minimum: 0 },
  },
} as const;

const readinessResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'checkedAt', 'dependencies'],
  properties: {
    status: { type: 'string', enum: ['ready', 'not-ready'] },
    checkedAt: { type: 'string', format: 'date-time' },
    dependencies: {
      type: 'object',
      additionalProperties: false,
      required: ['database', 'payments', 'queue'],
      properties: {
        database: dependencySchema,
        payments: dependencySchema,
        queue: dependencySchema,
      },
    },
  },
} as const;

export const livenessRouteSchema = {
  tags: ['health'],
  summary: 'Check whether the process is alive',
  response: {
    200: {
      type: 'object',
      additionalProperties: false,
      required: ['status'],
      properties: { status: { type: 'string', enum: ['ok'] } },
    },
  },
} as const;

export const readinessRouteSchema = {
  tags: ['health'],
  summary: 'Check PostgreSQL, payment provider and SQS',
  response: {
    200: readinessResponseSchema,
    503: readinessResponseSchema,
  },
} as const;
