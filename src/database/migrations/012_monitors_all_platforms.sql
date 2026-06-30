-- Migration: 012_monitors_all_platforms
-- Expand keyword_monitors to support Instagram, Facebook, LinkedIn, and TikTok
-- in addition to Twitter and Reddit.

ALTER TABLE keyword_monitors
  DROP CONSTRAINT IF EXISTS keyword_monitors_platform_check;

ALTER TABLE keyword_monitors
  ADD CONSTRAINT keyword_monitors_platform_check
    CHECK (platform IN ('twitter', 'reddit', 'instagram', 'facebook', 'linkedin', 'tiktok'));

-- Rename 'subreddit' to 'context' so it's usable across platforms
-- (subreddit slug for Reddit; hashtag for Instagram/TikTok; unused for others)
ALTER TABLE keyword_monitors
  RENAME COLUMN subreddit TO context;
