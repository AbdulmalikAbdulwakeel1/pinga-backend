-- Migration: 008_notifications_broadcasts_activity
-- Created: 2026-05-18
-- In-app notifications, outbound broadcast campaigns, and a full audit trail.

-- ─────────────────────────────────────────────
-- notifications
-- ─────────────────────────────────────────────
-- user_id NULL  → business-wide notification visible to all staff
-- user_id SET   → targeted to a specific user
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID         NOT NULL
                REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     UUID         REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  message     TEXT         NOT NULL,
  type        VARCHAR(20)  DEFAULT 'info'
                CHECK (type IN ('info', 'success', 'warning', 'error')),
  category    VARCHAR(20)  DEFAULT 'system'
                CHECK (category IN ('orders', 'leads', 'ai', 'system')),
  is_read     BOOLEAN      DEFAULT false,
  link        TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
  -- Notifications are immutable once created; no updated_at / deleted_at
);

CREATE INDEX IF NOT EXISTS idx_notifications_business
  ON notifications(business_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications(user_id);

-- Partial index: unread-count queries are the hot path
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(business_id, is_read)
  WHERE is_read = false;

-- Inbox ordered by recency
CREATE INDEX IF NOT EXISTS idx_notifications_created
  ON notifications(business_id, created_at DESC);

-- ─────────────────────────────────────────────
-- broadcasts
-- ─────────────────────────────────────────────
-- audience: [{type: "tag"|"platform"|"all", value: "..."}]
CREATE TABLE IF NOT EXISTS broadcasts (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID         NOT NULL
                    REFERENCES businesses(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  message         TEXT         NOT NULL,
  audience        JSONB        DEFAULT '[]',
  recipient_count INTEGER      DEFAULT 0,
  sent_count      INTEGER      DEFAULT 0,
  status          VARCHAR(20)  DEFAULT 'draft'
                    CHECK (status IN ('draft', 'scheduled', 'sent', 'failed')),
  scheduled_at    TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  created_by      UUID         REFERENCES users(id),
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_business
  ON broadcasts(business_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_broadcasts_status
  ON broadcasts(business_id, status)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_broadcasts_updated_at ON broadcasts;
CREATE TRIGGER update_broadcasts_updated_at
  BEFORE UPDATE ON broadcasts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- activity_logs  (immutable audit trail)
-- ─────────────────────────────────────────────
-- entity_type: 'order' | 'lead' | 'contact' | 'product' | 'user' | ...
-- metadata   : arbitrary JSON payload for the specific action
CREATE TABLE IF NOT EXISTS activity_logs (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID         NOT NULL
                REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,
  description TEXT,
  entity_type VARCHAR(50),
  entity_id   UUID,
  metadata    JSONB,
  ip_address  VARCHAR(50),
  user_agent  TEXT,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
  -- Audit logs are immutable: no updated_at / deleted_at
);

CREATE INDEX IF NOT EXISTS idx_activity_business
  ON activity_logs(business_id);

CREATE INDEX IF NOT EXISTS idx_activity_user
  ON activity_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_activity_action
  ON activity_logs(business_id, action);

-- Recency-ordered access (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_activity_created
  ON activity_logs(business_id, created_at DESC);

-- Entity-level lookup (e.g. "show all events for order X")
CREATE INDEX IF NOT EXISTS idx_activity_entity
  ON activity_logs(entity_type, entity_id);
