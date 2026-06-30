-- Migration: 010_new_platforms
-- Extends platform_connections to support Twitter/X, LinkedIn, TikTok, and Reddit.

-- Drop old constraint and recreate with all 7 platforms
ALTER TABLE platform_connections
  DROP CONSTRAINT IF EXISTS platform_connections_platform_check;

ALTER TABLE platform_connections
  ADD CONSTRAINT platform_connections_platform_check
    CHECK (platform IN ('instagram', 'facebook', 'whatsapp', 'twitter', 'linkedin', 'tiktok', 'reddit'));

-- PKCE verifier storage (Twitter and TikTok require PKCE)
ALTER TABLE platform_connections
  ADD COLUMN IF NOT EXISTS oauth_verifier TEXT;
