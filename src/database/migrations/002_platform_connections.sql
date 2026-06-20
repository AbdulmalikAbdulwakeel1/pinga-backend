-- Migration: 002_platform_connections
-- Created: 2026-05-18
-- Stores OAuth/API credentials for Instagram, Facebook, and WhatsApp per business.
-- One active connection per platform per business (UNIQUE constraint).

CREATE TABLE IF NOT EXISTS platform_connections (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id          UUID         NOT NULL
                         REFERENCES businesses(id) ON DELETE CASCADE,
  platform             VARCHAR(20)  NOT NULL
                         CHECK (platform IN ('instagram', 'facebook', 'whatsapp')),

  -- Generic account info
  account_id           VARCHAR(255),
  account_name         VARCHAR(255),
  account_avatar       TEXT,

  -- OAuth tokens
  access_token         TEXT,
  refresh_token        TEXT,
  token_expires_at     TIMESTAMPTZ,

  -- Webhook status
  webhook_verified     BOOLEAN      DEFAULT false,
  is_active            BOOLEAN      DEFAULT true,

  -- Facebook / Instagram specific
  page_id              VARCHAR(255),
  page_name            VARCHAR(255),
  instagram_account_id VARCHAR(255),

  -- WhatsApp Business specific
  phone_number_id      VARCHAR(255),
  waba_id              VARCHAR(255),
  display_phone_number VARCHAR(50),

  -- Timestamps
  connected_at         TIMESTAMPTZ  DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ,

  UNIQUE (business_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_platform_connections_business
  ON platform_connections(business_id);

-- Partial index used for active connections only
CREATE INDEX IF NOT EXISTS idx_platform_connections_platform
  ON platform_connections(business_id, platform)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_platform_connections_updated_at ON platform_connections;
CREATE TRIGGER update_platform_connections_updated_at
  BEFORE UPDATE ON platform_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
