CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "OrderStatus" AS ENUM (
  'PENDING_RESERVATION',
  'PENDING_PAYMENT',
  'PAID',
  'PAYMENT_FAILED',
  'RESERVATION_FAILED',
  'READY_TO_FULFILL'
);

CREATE TYPE "IdempotencyStatus" AS ENUM ('PROCESSING', 'COMPLETED');

CREATE TABLE "Customer" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL
);

CREATE TABLE "Product" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sku" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "unit_price_minor" BIGINT NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  CONSTRAINT "Product_unit_price_minor_check" CHECK ("unit_price_minor" >= 0),
  CONSTRAINT "Product_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "Warehouse" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "Warehouse_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90),
  CONSTRAINT "Warehouse_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180)
);

CREATE TABLE "Inventory" (
  "warehouse_id" UUID NOT NULL REFERENCES "Warehouse"("id"),
  "product_id" UUID NOT NULL REFERENCES "Product"("id"),
  "on_hand" INTEGER NOT NULL,
  "reserved" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("warehouse_id", "product_id"),
  CONSTRAINT "Inventory_on_hand_check" CHECK ("on_hand" >= 0),
  CONSTRAINT "Inventory_reserved_check" CHECK ("reserved" >= 0),
  CONSTRAINT "Inventory_reserved_on_hand_check" CHECK ("reserved" <= "on_hand")
);

CREATE INDEX "Inventory_product_id_idx" ON "Inventory"("product_id");

CREATE TABLE "Order" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "customer_id" UUID NOT NULL REFERENCES "Customer"("id"),
  "warehouse_id" UUID REFERENCES "Warehouse"("id"),
  "status" "OrderStatus" NOT NULL,
  "total_minor" BIGINT NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "shipping_address" JSONB NOT NULL,
  "payment_reference" TEXT,
  "payment_key" VARCHAR(128) NOT NULL,
  "payment_card_number" VARCHAR(19) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reservation_expires_at" TIMESTAMP(3),
  CONSTRAINT "Order_total_minor_check" CHECK ("total_minor" >= 0),
  CONSTRAINT "Order_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX "Order_payment_reference_key" ON "Order"("payment_reference");
CREATE UNIQUE INDEX "Order_payment_key_key" ON "Order"("payment_key");
CREATE INDEX "Order_customer_id_created_at_idx" ON "Order"("customer_id", "created_at");
CREATE INDEX "Order_status_reservation_expires_at_idx" ON "Order"("status", "reservation_expires_at");

CREATE TABLE "OrderItem" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL REFERENCES "Order"("id") ON DELETE CASCADE,
  "product_id" UUID NOT NULL REFERENCES "Product"("id"),
  "quantity" INTEGER NOT NULL,
  "unit_price_minor" BIGINT NOT NULL,
  UNIQUE ("order_id", "product_id"),
  CONSTRAINT "OrderItem_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "OrderItem_unit_price_minor_check" CHECK ("unit_price_minor" >= 0)
);

CREATE TABLE "OutboxEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMP(3),
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "claimed_by" UUID,
  "claim_until" TIMESTAMP(3),
  CONSTRAINT "OutboxEvent_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "OutboxEvent_claim_check" CHECK (
    ("claimed_by" IS NULL AND "claim_until" IS NULL)
    OR
    ("claimed_by" IS NOT NULL AND "claim_until" IS NOT NULL)
  )
);

CREATE INDEX "OutboxEvent_published_at_available_at_created_at_idx"
  ON "OutboxEvent"("published_at", "available_at", "created_at");

CREATE TABLE "InboxMessage" (
  "event_id" UUID PRIMARY KEY,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "IdempotencyKey" (
  "key" VARCHAR(128) PRIMARY KEY,
  "customer_id" UUID NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "status" "IdempotencyStatus" NOT NULL DEFAULT 'PROCESSING',
  "response" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IdempotencyKey_completed_response_check" CHECK (
    ("status" = 'PROCESSING' AND "response" IS NULL AND "completed_at" IS NULL)
    OR
    ("status" = 'COMPLETED' AND "response" IS NOT NULL AND "completed_at" IS NOT NULL)
  )
);

CREATE INDEX "IdempotencyKey_expires_at_idx" ON "IdempotencyKey"("expires_at");

INSERT INTO "Customer" ("id", "email", "name") VALUES
  ('00000000-0000-4000-8000-000000000001', 'demo@canals.local', 'Demo Customer');

INSERT INTO "Product" ("id", "sku", "name", "unit_price_minor", "currency") VALUES
  ('00000000-0000-4000-8000-000000000101', 'BACKPACK', 'Everyday Backpack', 12900, 'USD'),
  ('00000000-0000-4000-8000-000000000102', 'BOTTLE', 'Steel Bottle', 3500, 'USD'),
  ('00000000-0000-4000-8000-000000000103', 'HEADPHONES', 'Wireless Headphones', 7900, 'USD'),
  ('00000000-0000-4000-8000-000000000104', 'MUG', 'Travel Mug', 4500, 'USD'),
  ('00000000-0000-4000-8000-000000000105', 'KEYBOARD', 'Mechanical Keyboard', 18500, 'USD');

INSERT INTO "Warehouse" ("id", "name", "latitude", "longitude") VALUES
  ('00000000-0000-4000-8000-000000000201', 'Bogota', 4.676, -74.055);

INSERT INTO "Inventory" ("warehouse_id", "product_id", "on_hand", "reserved") VALUES
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 100, 0),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000102', 100, 0),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000103', 100, 0),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000104', 100, 0),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000105', 100, 0);
