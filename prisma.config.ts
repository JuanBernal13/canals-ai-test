import { defineConfig } from 'prisma/config';

const DEFAULT_DATABASE_URL = 'postgresql://canals:canals@localhost:5432/canals';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx scripts/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  },
});
