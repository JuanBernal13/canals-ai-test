import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { LIMIT } from '../src/shared/constants.js';
import { CURRENCY } from '../src/shared/constants.js';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://canals:canals@localhost:5432/canals';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const customer = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'demo@canals.local',
  name: 'Demo Customer',
};
const products = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    sku: 'BACKPACK',
    name: 'Everyday Backpack',
    unitPriceMinor: 12900n,
    currency: CURRENCY.USD,
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    sku: 'BOTTLE',
    name: 'Steel Bottle',
    unitPriceMinor: 3500n,
    currency: CURRENCY.USD,
  },
  {
    id: '00000000-0000-4000-8000-000000000103',
    sku: 'HEADPHONES',
    name: 'Wireless Headphones',
    unitPriceMinor: 7900n,
    currency: CURRENCY.USD,
  },
  {
    id: '00000000-0000-4000-8000-000000000104',
    sku: 'MUG',
    name: 'Travel Mug',
    unitPriceMinor: 4500n,
    currency: CURRENCY.USD,
  },
  {
    id: '00000000-0000-4000-8000-000000000105',
    sku: 'KEYBOARD',
    name: 'Mechanical Keyboard',
    unitPriceMinor: 18500n,
    currency: CURRENCY.USD,
  },
];
const warehouses = [
  {
    id: '00000000-0000-4000-8000-000000000201',
    name: 'Bogota',
    latitude: 4.676,
    longitude: -74.055,
  },
  {
    id: '00000000-0000-4000-8000-000000000202',
    name: 'Cali',
    latitude: 3.4516,
    longitude: -76.532,
  },
  {
    id: '00000000-0000-4000-8000-000000000203',
    name: 'New York',
    latitude: 40.7128,
    longitude: -74.006,
  },
  {
    id: '00000000-0000-4000-8000-000000000204',
    name: 'Chicago',
    latitude: 41.8781,
    longitude: -87.6298,
  },
  {
    id: '00000000-0000-4000-8000-000000000205',
    name: 'Dallas',
    latitude: 32.7767,
    longitude: -96.797,
  },
  {
    id: '00000000-0000-4000-8000-000000000206',
    name: 'Los Angeles',
    latitude: 34.0522,
    longitude: -118.2437,
  },
  {
    id: '00000000-0000-4000-8000-000000000207',
    name: 'Miami',
    latitude: 25.7617,
    longitude: -80.1918,
  },
];

async function seed(): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    await transaction.customer.upsert({
      where: { id: customer.id },
      create: customer,
      update: { email: customer.email, name: customer.name },
    });

    for (const product of products) {
      await transaction.product.upsert({
        where: { id: product.id },
        create: product,
        update: {
          sku: product.sku,
          name: product.name,
          unitPriceMinor: product.unitPriceMinor,
          currency: product.currency,
        },
      });
    }

    for (const warehouse of warehouses) {
      await transaction.warehouse.upsert({
        where: { id: warehouse.id },
        create: warehouse,
        update: {
          name: warehouse.name,
          latitude: warehouse.latitude,
          longitude: warehouse.longitude,
        },
      });
      for (const product of products) {
        const inventoryKey = {
          warehouseId: warehouse.id,
          productId: product.id,
        };
        await transaction.inventory.upsert({
          where: { warehouseId_productId: inventoryKey },
          create: {
            ...inventoryKey,
            onHand: LIMIT.INITIAL_INVENTORY,
            reserved: 0,
          },
          update: {},
        });
        await transaction.inventory.updateMany({
          where: { ...inventoryKey, reserved: 0 },
          data: { onHand: LIMIT.INITIAL_INVENTORY },
        });
      }
    }
  });
}

try {
  await seed();
  console.log('Seed completed');
} finally {
  await prisma.$disconnect();
}
