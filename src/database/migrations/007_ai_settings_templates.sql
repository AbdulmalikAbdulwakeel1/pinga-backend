-- Migration: 007_ai_settings_templates
-- Created: 2026-05-18
-- Per-business AI agent configuration and reusable response templates.
--
-- ai_settings  : one row per business (UNIQUE business_id)
-- templates    : library of quick-reply / broadcast templates

-- ─────────────────────────────────────────────
-- ai_settings
-- ─────────────────────────────────────────────
-- business_hours format:
--   [{"day":"Monday","open":"09:00","close":"18:00","enabled":true}, …]
-- handoff_keywords: ["human","agent","speak to someone","real person"]
-- qa_pairs: [{"question":"...","answer":"..."}]

CREATE TABLE IF NOT EXISTS ai_settings (
  id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           UUID           UNIQUE NOT NULL
                          REFERENCES businesses(id) ON DELETE CASCADE,

  -- Personality & language
  personality           VARCHAR(20)    DEFAULT 'friendly'
                          CHECK (personality IN ('friendly', 'professional', 'casual', 'pidgin')),
  languages             JSONB          DEFAULT '["English"]',

  -- Standard messages
  greeting_message      TEXT           DEFAULT 'Hello! Welcome to our store. How can I help you today?',
  away_message          TEXT           DEFAULT 'Hi! We are currently unavailable. We will get back to you soon!',

  -- Negotiation guardrails
  min_price_percentage  INTEGER        DEFAULT 80,
  max_discount          INTEGER        DEFAULT 20,
  max_negotiation_rounds INTEGER       DEFAULT 3,

  -- Human handoff
  handoff_keywords      JSONB          DEFAULT '["human","agent","speak to someone","real person"]',

  -- Business hours (array of day objects)
  business_hours        JSONB          DEFAULT '[
    {"day":"Monday","open":"09:00","close":"18:00","enabled":true},
    {"day":"Tuesday","open":"09:00","close":"18:00","enabled":true},
    {"day":"Wednesday","open":"09:00","close":"18:00","enabled":true},
    {"day":"Thursday","open":"09:00","close":"18:00","enabled":true},
    {"day":"Friday","open":"09:00","close":"18:00","enabled":true},
    {"day":"Saturday","open":"10:00","close":"16:00","enabled":true},
    {"day":"Sunday","open":"12:00","close":"16:00","enabled":false}
  ]',

  -- Follow-up automation
  auto_follow_up        BOOLEAN        DEFAULT true,
  follow_up_delay       INTEGER        DEFAULT 24,   -- hours

  -- Agent state
  is_active             BOOLEAN        DEFAULT true,

  -- Knowledge base (free-text or markdown)
  knowledge_base        TEXT,

  -- Custom Q&A pairs trained per business
  qa_pairs              JSONB          DEFAULT '[]',

  -- Rolling counters (updated by application logic)
  messages_handled      INTEGER        DEFAULT 0,
  satisfaction_score    DECIMAL(3, 1)  DEFAULT 0,

  created_at            TIMESTAMPTZ    DEFAULT NOW(),
  updated_at            TIMESTAMPTZ    DEFAULT NOW()
  -- No deleted_at: settings are always present; deactivate via is_active
);

DROP TRIGGER IF EXISTS update_ai_settings_updated_at ON ai_settings;
CREATE TRIGGER update_ai_settings_updated_at
  BEFORE UPDATE ON ai_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- templates
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS templates (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID         NOT NULL
                REFERENCES businesses(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  category    VARCHAR(100),
  content     TEXT         NOT NULL,
  language    VARCHAR(50)  DEFAULT 'English',
  usage_count INTEGER      DEFAULT 0,
  is_active   BOOLEAN      DEFAULT true,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_templates_business
  ON templates(business_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_templates_category
  ON templates(business_id, category)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_templates_updated_at ON templates;
CREATE TRIGGER update_templates_updated_at
  BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
