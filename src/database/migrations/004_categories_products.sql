-- Migration: 004_categories_products
-- Created: 2026-05-18
-- Product catalog: categories and products with variant/image JSONB support.

-- ─────────────────────────────────────────────
-- categories
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID         NOT NULL
                  REFERENCES businesses(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  slug          VARCHAR(100) NOT NULL,
  image_url     TEXT,
  description   TEXT,
  product_count INTEGER      DEFAULT 0,
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,

  UNIQUE (business_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_categories_business
  ON categories(business_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_categories_updated_at ON categories;
CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- products
-- ─────────────────────────────────────────────
-- images  : [{url, alt, is_primary}]
-- variants: [{name, options:[{label, price_adj, stock}]}]
-- platforms: subset of ["instagram","facebook","whatsapp"] — controls where
--            the product appears in AI replies / product shares
CREATE TABLE IF NOT EXISTS products (
  id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID           NOT NULL
                  REFERENCES businesses(id) ON DELETE CASCADE,
  category_id   UUID           REFERENCES categories(id) ON DELETE SET NULL,
  name          VARCHAR(255)   NOT NULL,
  description   TEXT,
  price         DECIMAL(12, 2) NOT NULL,
  compare_price DECIMAL(12, 2),
  images        JSONB          DEFAULT '[]',
  stock         INTEGER        DEFAULT 0,
  sku           VARCHAR(100),
  variants      JSONB          DEFAULT '[]',
  platforms     JSONB          DEFAULT '["instagram","facebook","whatsapp"]',
  is_active     BOOLEAN        DEFAULT true,
  sales_count   INTEGER        DEFAULT 0,
  view_count    INTEGER        DEFAULT 0,
  created_at    TIMESTAMPTZ    DEFAULT NOW(),
  updated_at    TIMESTAMPTZ    DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_products_business
  ON products(business_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_category
  ON products(category_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_active
  ON products(business_id, is_active)
  WHERE deleted_at IS NULL;

-- SKU lookup within a business
CREATE INDEX IF NOT EXISTS idx_products_sku
  ON products(business_id, sku)
  WHERE sku IS NOT NULL AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
