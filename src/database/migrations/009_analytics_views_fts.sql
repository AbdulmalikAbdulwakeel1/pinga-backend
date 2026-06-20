-- Migration: 009_analytics_views_fts
-- Created: 2026-05-18
-- Read-optimised views for the dashboard analytics API and
-- full-text search (GIN) indexes for messages and products.

-- ─────────────────────────────────────────────
-- Daily revenue by business + platform
-- (excludes cancelled and unpaid orders)
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW orders_revenue_daily AS
SELECT
  business_id,
  DATE_TRUNC('day', created_at)   AS day,
  COUNT(*)                        AS order_count,
  SUM(total)                      AS revenue,
  platform
FROM orders
WHERE deleted_at IS NULL
  AND status        != 'Cancelled'
  AND payment_status = 'paid'
GROUP BY
  business_id,
  DATE_TRUNC('day', created_at),
  platform;

-- ─────────────────────────────────────────────
-- Daily conversations breakdown by business + platform
-- (AI-handled vs human-handled)
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW conversations_daily AS
SELECT
  business_id,
  DATE_TRUNC('day', created_at)                       AS day,
  COUNT(*)                                            AS total,
  COUNT(*) FILTER (WHERE is_ai_enabled  = true)       AS ai_handled,
  COUNT(*) FILTER (WHERE is_ai_enabled  = false)      AS human_handled,
  platform
FROM conversations
WHERE deleted_at IS NULL
GROUP BY
  business_id,
  DATE_TRUNC('day', created_at),
  platform;

-- ─────────────────────────────────────────────
-- Full-text search: messages content
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_content_search
  ON messages
  USING GIN (to_tsvector('english', COALESCE(content, '')));

-- ─────────────────────────────────────────────
-- Full-text search: product name + description
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_name_search
  ON products
  USING GIN (to_tsvector('english', name || ' ' || COALESCE(description, '')));
