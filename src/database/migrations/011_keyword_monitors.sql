-- Migration: 011_keyword_monitors
-- Keyword monitoring: users subscribe to terms/subreddits across platforms.
-- When the polling job finds a match and AI deems it relevant, a mention is stored
-- and an in-app notification is created.

CREATE TABLE IF NOT EXISTS keyword_monitors (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  platform        VARCHAR(20)   NOT NULL
                    CHECK (platform IN ('twitter', 'reddit')),
  name            VARCHAR(255)  NOT NULL,
  -- JSON array of keyword strings e.g. ["barbing","haircut","barbershop"]
  keywords        JSONB         NOT NULL DEFAULT '[]',
  -- For Reddit only: which subreddit to watch (e.g. "lagos" or "naijabusiness")
  subreddit       VARCHAR(100),
  -- Optional AI prompt to describe relevant leads for this monitor
  ai_prompt       TEXT,
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  last_polled_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_keyword_monitors_business
  ON keyword_monitors(business_id);

CREATE INDEX IF NOT EXISTS idx_keyword_monitors_platform_active
  ON keyword_monitors(platform, is_active)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS keyword_mentions (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  monitor_id       UUID         NOT NULL REFERENCES keyword_monitors(id) ON DELETE CASCADE,
  platform         VARCHAR(20)  NOT NULL,
  -- Original post/tweet ID from the platform
  external_id      VARCHAR(255) NOT NULL,
  title            TEXT,
  content          TEXT,
  url              TEXT,
  author           VARCHAR(255),
  -- JSON array of which keywords were matched
  matched_keywords JSONB        DEFAULT '[]',
  is_read          BOOLEAN      NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Prevent duplicate mentions per business+platform
  UNIQUE (business_id, platform, external_id)
);

CREATE INDEX IF NOT EXISTS idx_keyword_mentions_business
  ON keyword_mentions(business_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_keyword_mentions_monitor
  ON keyword_mentions(monitor_id);

DROP TRIGGER IF EXISTS update_keyword_monitors_updated_at ON keyword_monitors;
CREATE TRIGGER update_keyword_monitors_updated_at
  BEFORE UPDATE ON keyword_monitors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
