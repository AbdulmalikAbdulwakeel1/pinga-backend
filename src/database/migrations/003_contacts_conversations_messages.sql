-- Migration: 003_contacts_conversations_messages
-- Created: 2026-05-18
-- Unified inbox: contacts (customers from social platforms),
-- conversations (threads), and messages (individual messages).
-- NOTE: conversations.lead_id FK is added in 005_leads.sql once the
-- leads table exists; the column is created here as a plain UUID.

-- ─────────────────────────────────────────────
-- contacts
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID         NOT NULL
                        REFERENCES businesses(id) ON DELETE CASCADE,
  name                VARCHAR(255),
  email               VARCHAR(255),
  phone               VARCHAR(50),
  avatar_url          TEXT,
  platform            VARCHAR(20)  NOT NULL
                        CHECK (platform IN ('instagram', 'facebook', 'whatsapp')),
  platform_user_id    VARCHAR(255) NOT NULL,
  platform_username   VARCHAR(255),
  notes               TEXT,
  tags                JSONB        DEFAULT '[]',
  created_at          TIMESTAMPTZ  DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,

  UNIQUE (business_id, platform, platform_user_id)
);

CREATE INDEX IF NOT EXISTS idx_contacts_business
  ON contacts(business_id);

CREATE INDEX IF NOT EXISTS idx_contacts_platform
  ON contacts(business_id, platform);

CREATE INDEX IF NOT EXISTS idx_contacts_platform_user
  ON contacts(platform_user_id);

DROP TRIGGER IF EXISTS update_contacts_updated_at ON contacts;
CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- conversations
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id              UUID         NOT NULL
                             REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id               UUID         REFERENCES contacts(id),
  platform                 VARCHAR(20)  NOT NULL
                             CHECK (platform IN ('instagram', 'facebook', 'whatsapp')),
  platform_conversation_id VARCHAR(255),
  status                   VARCHAR(20)  DEFAULT 'active'
                             CHECK (status IN ('active', 'waiting', 'resolved', 'archived')),
  is_ai_enabled            BOOLEAN      DEFAULT true,
  assigned_to              UUID         REFERENCES users(id),
  -- lead_id FK is added in 005_leads.sql; the column is plain UUID here
  lead_id                  UUID,
  last_message             TEXT,
  last_message_at          TIMESTAMPTZ  DEFAULT NOW(),
  unread_count             INTEGER      DEFAULT 0,
  created_at               TIMESTAMPTZ  DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  DEFAULT NOW(),
  deleted_at               TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_conversations_business
  ON conversations(business_id);

CREATE INDEX IF NOT EXISTS idx_conversations_status
  ON conversations(business_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_platform
  ON conversations(business_id, platform)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_contact
  ON conversations(contact_id);

CREATE INDEX IF NOT EXISTS idx_conversations_assigned
  ON conversations(assigned_to);

-- Latest-first ordering index used by inbox queries
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg
  ON conversations(business_id, last_message_at DESC);

DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- messages
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id      UUID         NOT NULL
                         REFERENCES conversations(id) ON DELETE CASCADE,
  business_id          UUID         NOT NULL
                         REFERENCES businesses(id) ON DELETE CASCADE,
  content              TEXT,
  sender               VARCHAR(20)  NOT NULL
                         CHECK (sender IN ('customer', 'business', 'ai')),
  platform             VARCHAR(20)  NOT NULL
                         CHECK (platform IN ('instagram', 'facebook', 'whatsapp')),
  platform_message_id  VARCHAR(255),
  is_read              BOOLEAN      DEFAULT false,
  message_type         VARCHAR(20)  DEFAULT 'text'
                         CHECK (message_type IN ('text', 'image', 'video', 'voice', 'document', 'product')),
  attachments          JSONB        DEFAULT '[]',
  product_share        JSONB,
  timestamp            TIMESTAMPTZ  DEFAULT NOW(),
  created_at           TIMESTAMPTZ  DEFAULT NOW()
  -- messages are append-only; no updated_at / deleted_at needed
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_messages_business
  ON messages(business_id);

-- Descending timestamp for paged message history
CREATE INDEX IF NOT EXISTS idx_messages_timestamp
  ON messages(conversation_id, timestamp DESC);

-- Partial index for unread badge counts
CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON messages(conversation_id, is_read)
  WHERE is_read = false;
