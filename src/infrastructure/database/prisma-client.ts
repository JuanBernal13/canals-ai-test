import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { config } from '../../config/index.js';

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: config.database.url, max: config.database.poolMax }),
});
