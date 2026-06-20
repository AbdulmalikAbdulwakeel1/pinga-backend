-- Migration: 001_initial_businesses_users
-- Created: 2026-05-18
-- Establishes the trigger function used by all tables, plus businesses and users.

-- ─────────────────────────────────────────────
-- Shared trigger function (idempotent)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- ─────────────────────────────────────────────
-- businesses
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS businesses (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(255) NOT NULL,
  email             VARCHAR(255) UNIQUE NOT NULL,
  phone             VARCHAR(50),
  category          VARCHAR(100),
  size              VARCHAR(50),
  city              VARCHAR(100),
  state             VARCHAR(100),
  country           VARCHAR(100) DEFAULT 'Nigeria',
  logo_url          TEXT,
  website_url       TEXT,
  description       TEXT,
  subscription      VARCHAR(50)  DEFAULT 'starter'
                      CHECK (subscription IN ('starter', 'growth', 'pro')),
  is_active         BOOLEAN      DEFAULT true,
  created_at        TIMESTAMPTZ  DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_businesses_email
  ON businesses(email);

CREATE INDEX IF NOT EXISTS idx_businesses_active
  ON businesses(is_active)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_businesses_updated_at ON businesses;
CREATE TRIGGER update_businesses_updated_at
  BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- users  (owners + agents, always tied to a business)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id                     UUID         NOT NULL
                                    REFERENCES businesses(id) ON DELETE CASCADE,
  first_name                      VARCHAR(100) NOT NULL,
  last_name                       VARCHAR(100) NOT NULL,
  email                           VARCHAR(255) UNIQUE NOT NULL,
  phone                           VARCHAR(50),
  password_hash                   VARCHAR(255) NOT NULL,
  role                            VARCHAR(20)  NOT NULL DEFAULT 'agent'
                                    CHECK (role IN ('owner', 'admin', 'agent')),
  avatar_url                      TEXT,
  is_active                       BOOLEAN      DEFAULT true,
  is_email_verified               BOOLEAN      DEFAULT false,
  email_verification_pin          VARCHAR(64),
  email_verification_pin_expires  TIMESTAMPTZ,
  password_reset_token            VARCHAR(64),
  password_reset_expires          TIMESTAMPTZ,
  failed_login_attempts           INTEGER      DEFAULT 0,
  account_locked_until            TIMESTAMPTZ,
  last_login                      TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ  DEFAULT NOW(),
  deleted_at                      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email
  ON users(email);

CREATE INDEX IF NOT EXISTS idx_users_business_id
  ON users(business_id);

CREATE INDEX IF NOT EXISTS idx_users_active
  ON users(business_id, is_active)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
