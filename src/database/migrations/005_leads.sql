-- Migration: 005_leads
-- Created: 2026-05-18
-- CRM pipeline leads, and back-fill of the conversations.lead_id FK
-- that could not be declared in 003 because leads didn't exist yet.

-- ─────────────────────────────────────────────
-- leads
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID           NOT NULL
                    REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id      UUID           REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID           REFERENCES conversations(id) ON DELETE SET NULL,
  name            VARCHAR(255)   NOT NULL,
  email           VARCHAR(255),
  phone           VARCHAR(50),
  platform        VARCHAR(20)
                    CHECK (platform IN ('instagram', 'facebook', 'whatsapp')),
  stage           VARCHAR(20)    DEFAULT 'New'
                    CHECK (stage IN ('New', 'Contacted', 'Qualified', 'Negotiating', 'Won', 'Lost')),
  score           VARCHAR(10)    DEFAULT 'cold'
                    CHECK (score IN ('hot', 'warm', 'cold')),
  value           DECIMAL(12, 2) DEFAULT 0,
  source          VARCHAR(100),
  notes           TEXT,
  last_interaction TIMESTAMPTZ   DEFAULT NOW(),
  assigned_to     UUID           REFERENCES users(id),
  won_at          TIMESTAMPTZ,
  lost_at         TIMESTAMPTZ,
  lost_reason     TEXT,
  created_at      TIMESTAMPTZ    DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_leads_business
  ON leads(business_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_stage
  ON leads(business_id, stage)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_score
  ON leads(business_id, score)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_assigned
  ON leads(assigned_to)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_platform
  ON leads(business_id, platform)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- Back-fill FK: conversations.lead_id → leads
-- (the column was created as plain UUID in 003)
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_conversations_lead_id'
      AND table_name = 'conversations'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT fk_conversations_lead_id
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- Index for the FK (improves JOIN and SET NULL cascade)
CREATE INDEX IF NOT EXISTS idx_conversations_lead
  ON conversations(lead_id)
  WHERE lead_id IS NOT NULL;
