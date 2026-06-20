-- Migration: 006_orders
-- Created: 2026-05-18
-- Orders placed through social platforms, including items snapshot (JSONB),
-- payment status, delivery tracking, and a JSONB audit timeline.
--
-- items   : [{product_id, name, price, qty, variant}]
-- timeline: [{status, note, timestamp, user_id}]

CREATE TABLE IF NOT EXISTS orders (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID           NOT NULL
                     REFERENCES businesses(id) ON DELETE CASCADE,
  order_number     VARCHAR(50)    UNIQUE NOT NULL,
  contact_id       UUID           REFERENCES contacts(id) ON DELETE SET NULL,
  lead_id          UUID           REFERENCES leads(id) ON DELETE SET NULL,
  conversation_id  UUID           REFERENCES conversations(id) ON DELETE SET NULL,
  customer_name    VARCHAR(255)   NOT NULL,
  customer_phone   VARCHAR(50),
  customer_email   VARCHAR(255),
  platform         VARCHAR(20)
                     CHECK (platform IN ('instagram', 'facebook', 'whatsapp')),
  items            JSONB          DEFAULT '[]',
  subtotal         DECIMAL(12, 2) DEFAULT 0,
  delivery_fee     DECIMAL(12, 2) DEFAULT 0,
  total            DECIMAL(12, 2) DEFAULT 0,
  status           VARCHAR(20)    DEFAULT 'Pending'
                     CHECK (status IN ('Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled')),
  payment_method   VARCHAR(20)    DEFAULT 'transfer'
                     CHECK (payment_method IN ('transfer', 'cod', 'card')),
  payment_status   VARCHAR(20)    DEFAULT 'pending'
                     CHECK (payment_status IN ('pending', 'paid', 'failed')),
  delivery_address TEXT,
  notes            TEXT,
  timeline         JSONB          DEFAULT '[]',
  assigned_to      UUID           REFERENCES users(id),
  confirmed_at     TIMESTAMPTZ,
  shipped_at       TIMESTAMPTZ,
  delivered_at     TIMESTAMPTZ,
  cancelled_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ    DEFAULT NOW(),
  updated_at       TIMESTAMPTZ    DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_business
  ON orders(business_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_status
  ON orders(business_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_payment
  ON orders(business_id, payment_status)
  WHERE deleted_at IS NULL;

-- Direct order_number lookups (used for search / webhooks)
CREATE INDEX IF NOT EXISTS idx_orders_number
  ON orders(order_number);

-- Dashboard / analytics: recent orders first
CREATE INDEX IF NOT EXISTS idx_orders_created
  ON orders(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_platform
  ON orders(business_id, platform)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
