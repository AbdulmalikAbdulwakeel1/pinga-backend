const { query } = require('../config/database');
const { createNotification } = require('./notification.controller');
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SUPPORTED_PLATFORMS = ['twitter', 'reddit', 'instagram', 'facebook', 'linkedin', 'tiktok'];

// ─── CRUD ──────────────────────────────────────────────────────

exports.getMonitors = async (req, res) => {
  try {
    const { businessId } = req.user;
    const result = await query(
      `SELECT id, platform, name, keywords, context, ai_prompt, is_active, last_polled_at, created_at
       FROM keyword_monitors WHERE business_id = $1 ORDER BY created_at DESC`,
      [businessId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('getMonitors error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch monitors' });
  }
};

exports.createMonitor = async (req, res) => {
  try {
    const { businessId } = req.user;
    const { platform, name, keywords, context, ai_prompt } = req.body;

    if (!platform || !name || !keywords?.length) {
      return res.status(400).json({ success: false, message: 'platform, name, and keywords are required' });
    }
    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      return res.status(400).json({ success: false, message: `platform must be one of: ${SUPPORTED_PLATFORMS.join(', ')}` });
    }
    if (platform === 'reddit' && !context) {
      return res.status(400).json({ success: false, message: 'context (subreddit name) is required for Reddit monitors' });
    }

    const result = await query(
      `INSERT INTO keyword_monitors (business_id, platform, name, keywords, context, ai_prompt)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, platform, name, keywords, context, ai_prompt, is_active, last_polled_at, created_at`,
      [businessId, platform, name, JSON.stringify(keywords), context || null, ai_prompt || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('createMonitor error:', err);
    res.status(500).json({ success: false, message: 'Failed to create monitor' });
  }
};

exports.updateMonitor = async (req, res) => {
  try {
    const { businessId } = req.user;
    const { id } = req.params;
    const { name, keywords, context, ai_prompt, is_active } = req.body;

    const result = await query(
      `UPDATE keyword_monitors
       SET name = COALESCE($1, name),
           keywords = COALESCE($2, keywords),
           context = COALESCE($3, context),
           ai_prompt = COALESCE($4, ai_prompt),
           is_active = COALESCE($5, is_active),
           updated_at = NOW()
       WHERE id = $6 AND business_id = $7
       RETURNING id, platform, name, keywords, context, ai_prompt, is_active, last_polled_at`,
      [name || null, keywords ? JSON.stringify(keywords) : null, context || null, ai_prompt || null, is_active ?? null, id, businessId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Monitor not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('updateMonitor error:', err);
    res.status(500).json({ success: false, message: 'Failed to update monitor' });
  }
};

exports.deleteMonitor = async (req, res) => {
  try {
    const { businessId } = req.user;
    const { id } = req.params;
    const result = await query(
      `DELETE FROM keyword_monitors WHERE id = $1 AND business_id = $2 RETURNING id`,
      [id, businessId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Monitor not found' });
    res.json({ success: true, message: 'Monitor deleted' });
  } catch (err) {
    console.error('deleteMonitor error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete monitor' });
  }
};

// ─── Mentions ──────────────────────────────────────────────────

exports.getMentions = async (req, res) => {
  try {
    const { businessId } = req.user;
    const { platform, is_read, monitor_id } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const conditions = ['km.business_id = $1'];
    const params = [businessId];
    let idx = 2;

    if (platform) { conditions.push(`km.platform = $${idx++}`); params.push(platform); }
    if (monitor_id) { conditions.push(`km.monitor_id = $${idx++}`); params.push(monitor_id); }
    if (is_read !== undefined && is_read !== '') {
      conditions.push(`km.is_read = $${idx++}`);
      params.push(is_read === 'true');
    }

    const where = conditions.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*) FROM keyword_mentions km WHERE ${where}`,
      params
    );

    const rows = await query(
      `SELECT km.id, km.platform, km.title, km.content, km.url, km.author,
              km.matched_keywords, km.is_read, km.created_at,
              m.name AS monitor_name, m.context
       FROM keyword_mentions km
       JOIN keyword_monitors m ON m.id = km.monitor_id
       WHERE ${where}
       ORDER BY km.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: rows.rows,
      meta: { total: parseInt(countResult.rows[0].count), page, limit }
    });
  } catch (err) {
    console.error('getMentions error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch mentions' });
  }
};

exports.markMentionRead = async (req, res) => {
  try {
    const { businessId } = req.user;
    const { id } = req.params;
    await query(
      `UPDATE keyword_mentions SET is_read = true WHERE id = $1 AND business_id = $2`,
      [id, businessId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to mark mention as read' });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    const { businessId } = req.user;
    await query(
      `UPDATE keyword_mentions SET is_read = true WHERE business_id = $1 AND is_read = false`,
      [businessId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to mark all as read' });
  }
};

// ─── Manual sync ───────────────────────────────────────────────

exports.syncMonitor = async (req, res) => {
  try {
    const { businessId } = req.user;
    const { id } = req.params;

    const monResult = await query(
      `SELECT km.*, pc.access_token, pc.account_id, pc.page_id, b.name AS business_name
       FROM keyword_monitors km
       JOIN platform_connections pc
         ON pc.business_id = km.business_id
         AND pc.platform = km.platform
         AND pc.is_active = true
         AND pc.deleted_at IS NULL
       JOIN businesses b ON b.id = km.business_id
       WHERE km.id = $1 AND km.business_id = $2`,
      [id, businessId]
    );

    if (!monResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Monitor not found or platform not connected' });
    }

    const newMentions = await pollMonitor(monResult.rows[0]);
    res.json({ success: true, message: `Sync complete. Found ${newMentions} new mention(s).`, newMentions });
  } catch (err) {
    console.error('syncMonitor error:', err);
    res.status(500).json({ success: false, message: 'Sync failed: ' + err.message });
  }
};

// ─── Cron entry ────────────────────────────────────────────────

exports.pollAllMonitors = async () => {
  try {
    const result = await query(
      `SELECT km.*, pc.access_token, pc.account_id, pc.page_id, b.name AS business_name
       FROM keyword_monitors km
       JOIN platform_connections pc
         ON pc.business_id = km.business_id
         AND pc.platform = km.platform
         AND pc.is_active = true
         AND pc.deleted_at IS NULL
       JOIN businesses b ON b.id = km.business_id
       WHERE km.is_active = true
       ORDER BY km.last_polled_at ASC NULLS FIRST`,
      []
    );

    for (const monitor of result.rows) {
      try {
        await pollMonitor(monitor);
      } catch (err) {
        console.error(`Poll failed [${monitor.platform}] monitor ${monitor.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('pollAllMonitors error:', err);
  }
};

// ─── Dispatcher ────────────────────────────────────────────────

async function pollMonitor(monitor) {
  const keywords = Array.isArray(monitor.keywords)
    ? monitor.keywords
    : JSON.parse(monitor.keywords || '[]');

  let newCount = 0;
  switch (monitor.platform) {
    case 'twitter':    newCount = await pollTwitter(monitor, keywords);   break;
    case 'reddit':     newCount = await pollReddit(monitor, keywords);    break;
    case 'instagram':  newCount = await pollInstagram(monitor, keywords); break;
    case 'facebook':   newCount = await pollFacebook(monitor, keywords);  break;
    case 'linkedin':   newCount = await pollLinkedIn(monitor, keywords);  break;
    case 'tiktok':     newCount = await pollTikTok(monitor, keywords);    break;
  }

  await query(`UPDATE keyword_monitors SET last_polled_at = NOW() WHERE id = $1`, [monitor.id]);
  return newCount;
}

// ─── Twitter ────────────────────────────────────────────────────
// Uses Twitter API v2 search/recent — searches ALL public tweets.

async function pollTwitter(monitor, keywords) {
  if (!keywords.length) return 0;

  const searchQuery = keywords.map(k => `"${k}"`).join(' OR ');
  const url = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(searchQuery)}&max_results=10&tweet.fields=author_id,created_at,text`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${monitor.access_token}` } });
  if (!res.ok) throw new Error(`Twitter API ${res.status}: ${await res.text()}`);

  const tweets = (await res.json()).data ?? [];
  return await saveMentions(monitor, keywords, tweets, t => ({
    externalId: t.id,
    title: null,
    content: t.text,
    url: `https://twitter.com/i/web/status/${t.id}`,
    author: t.author_id,
    matchedKeywords: keywords.filter(k => t.text.toLowerCase().includes(k.toLowerCase())),
    checkText: t.text,
  }));
}

// ─── Reddit ─────────────────────────────────────────────────────
// Watches new posts in a specific subreddit for keyword matches.

async function pollReddit(monitor, keywords) {
  if (!keywords.length || !monitor.context) return 0;

  // Use app-level token if configured (more reliable than user token for public reads)
  let accessToken = monitor.access_token;
  if (process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET) {
    const tr = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Pinga/1.0',
      },
      body: 'grant_type=client_credentials',
    });
    const td = await tr.json();
    if (td.access_token) accessToken = td.access_token;
  }

  const res = await fetch(`https://oauth.reddit.com/r/${monitor.context}/new?limit=15`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Pinga/1.0' },
  });
  if (!res.ok) throw new Error(`Reddit API ${res.status}`);

  const posts = (await res.json()).data?.children ?? [];
  const matching = posts.filter(p => {
    const text = `${p.data.title} ${p.data.selftext ?? ''}`.toLowerCase();
    return keywords.some(k => text.includes(k.toLowerCase()));
  });

  return await saveMentions(monitor, keywords, matching, p => {
    const d = p.data;
    const text = `${d.title} ${d.selftext ?? ''}`;
    return {
      externalId: d.id,
      title: d.title,
      content: (d.selftext ?? '').slice(0, 500),
      url: `https://www.reddit.com${d.permalink}`,
      author: d.author,
      matchedKeywords: keywords.filter(k => text.toLowerCase().includes(k.toLowerCase())),
      checkText: text,
      checkTitle: d.title,
    };
  });
}

// ─── Instagram ──────────────────────────────────────────────────
// Uses Instagram Graph API hashtag search.
// Each keyword is treated as a hashtag. Rate-limited to 30 unique hashtags/7 days per IG account.

async function pollInstagram(monitor, keywords) {
  if (!keywords.length || !monitor.account_id) return 0;

  const igUserId = monitor.account_id;
  const token = monitor.access_token;
  let newCount = 0;

  for (const keyword of keywords) {
    try {
      // Resolve hashtag ID
      const hashRes = await fetch(
        `https://graph.facebook.com/v19.0/ig_hashtag_search?user_id=${igUserId}&q=${encodeURIComponent(keyword)}&access_token=${token}`
      );
      const hashData = await hashRes.json();
      const hashId = hashData.data?.[0]?.id;
      if (!hashId) continue;

      // Get recent media for that hashtag
      const mediaRes = await fetch(
        `https://graph.facebook.com/v19.0/${hashId}/recent_media?user_id=${igUserId}&fields=id,caption,permalink,timestamp&access_token=${token}`
      );
      if (!mediaRes.ok) continue;
      const posts = (await mediaRes.json()).data ?? [];

      for (const post of posts) {
        const caption = post.caption ?? '';
        const relevant = await checkRelevanceWithAI(caption, '', [keyword], monitor.ai_prompt, monitor.business_name);
        if (!relevant) continue;

        const inserted = await upsertMention({
          businessId: monitor.business_id,
          monitorId: monitor.id,
          platform: 'instagram',
          externalId: post.id,
          title: null,
          content: caption.slice(0, 500),
          url: post.permalink,
          author: null,
          matchedKeywords: [keyword],
        });

        if (inserted) {
          await notify(monitor, 'Instagram', `#${keyword}`, caption.slice(0, 120));
          newCount++;
        }
      }
    } catch (err) {
      console.error(`Instagram hashtag poll failed for "${keyword}":`, err.message);
    }
  }
  return newCount;
}

// ─── Facebook ───────────────────────────────────────────────────
// Monitors the connected Facebook Page's feed (posts from visitors + tagged posts)
// and filters for keyword matches. Note: Facebook's API does NOT allow searching
// all public posts — this only covers your own page's activity.

async function pollFacebook(monitor, keywords) {
  if (!keywords.length || !monitor.page_id) return 0;

  const pageId = monitor.page_id;
  const token = monitor.access_token;

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${pageId}/feed?fields=id,message,story,from,created_time&limit=20&access_token=${token}`
  );
  if (!res.ok) throw new Error(`Facebook API ${res.status}`);

  const posts = (await res.json()).data ?? [];
  const matching = posts.filter(p => {
    const text = `${p.message ?? ''} ${p.story ?? ''}`.toLowerCase();
    return keywords.some(k => text.includes(k.toLowerCase()));
  });

  return await saveMentions(monitor, keywords, matching, p => {
    const text = `${p.message ?? ''} ${p.story ?? ''}`;
    return {
      externalId: p.id,
      title: null,
      content: text.slice(0, 500),
      url: `https://facebook.com/${p.id.replace('_', '/posts/')}`,
      author: p.from?.name ?? null,
      matchedKeywords: keywords.filter(k => text.toLowerCase().includes(k.toLowerCase())),
      checkText: text,
    };
  });
}

// ─── LinkedIn ───────────────────────────────────────────────────
// Scans your LinkedIn company page's recent shares for keyword mentions
// in the posts and their comments.
// Note: broad LinkedIn public search requires Marketing Developer Platform approval.

async function pollLinkedIn(monitor, keywords) {
  if (!keywords.length || !monitor.account_id) return 0;

  const orgId = monitor.account_id; // stored as account_id during LinkedIn connect
  const token = monitor.access_token;

  // Get org shares
  const sharesRes = await fetch(
    `https://api.linkedin.com/v2/shares?q=owners&owners=urn:li:organization:${orgId}&count=10`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!sharesRes.ok) throw new Error(`LinkedIn shares API ${sharesRes.status}`);

  const shares = (await sharesRes.json()).elements ?? [];
  let newCount = 0;

  for (const share of shares) {
    const shareUrn = share.activity ?? share.id;

    // Get comments on this share
    const commentsRes = await fetch(
      `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(shareUrn)}/comments?count=20`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!commentsRes.ok) continue;

    const comments = (await commentsRes.json()).elements ?? [];
    for (const comment of comments) {
      const text = comment.message?.text ?? '';
      const matchedKeywords = keywords.filter(k => text.toLowerCase().includes(k.toLowerCase()));
      if (!matchedKeywords.length) continue;

      const relevant = await checkRelevanceWithAI(text, '', matchedKeywords, monitor.ai_prompt, monitor.business_name);
      if (!relevant) continue;

      const commentId = comment.id ?? comment['$URN'] ?? String(Date.now());
      const inserted = await upsertMention({
        businessId: monitor.business_id,
        monitorId: monitor.id,
        platform: 'linkedin',
        externalId: commentId,
        title: null,
        content: text.slice(0, 500),
        url: `https://www.linkedin.com/feed/update/${encodeURIComponent(shareUrn)}/`,
        author: comment.actor ?? null,
        matchedKeywords,
      });

      if (inserted) {
        await notify(monitor, 'LinkedIn', matchedKeywords.join(', '), text.slice(0, 120));
        newCount++;
      }
    }
  }
  return newCount;
}

// ─── TikTok ─────────────────────────────────────────────────────
// Uses TikTok Research API (video keyword search).
// Requires Research API access: https://developers.tiktok.com/products/research-api/
// Falls back gracefully if access not yet approved.

async function pollTikTok(monitor, keywords) {
  if (!keywords.length) return 0;

  const token = monitor.access_token;
  let newCount = 0;

  for (const keyword of keywords) {
    try {
      const res = await fetch('https://open.tiktokapis.com/v2/research/video/query/', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: {
            and: [{ operation: 'IN', field_name: 'keyword', field_values: [keyword] }],
          },
          start_date: getYesterdayDate(),
          end_date: getTodayDate(),
          max_count: 10,
          fields: 'id,create_time,username,video_description,share_url',
        }),
      });

      // Research API returns 403/401 if not approved — skip gracefully
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        if (res.status === 401 || res.status === 403) {
          console.warn(`TikTok Research API not approved for this app (${res.status}). Skipping TikTok monitor.`);
          break;
        }
        throw new Error(`TikTok API ${res.status}: ${JSON.stringify(errBody)}`);
      }

      const videos = (await res.json()).data?.videos ?? [];
      for (const video of videos) {
        const description = video.video_description ?? '';
        const relevant = await checkRelevanceWithAI(description, '', [keyword], monitor.ai_prompt, monitor.business_name);
        if (!relevant) continue;

        const inserted = await upsertMention({
          businessId: monitor.business_id,
          monitorId: monitor.id,
          platform: 'tiktok',
          externalId: String(video.id),
          title: null,
          content: description.slice(0, 500),
          url: video.share_url ?? `https://www.tiktok.com/@${video.username}/video/${video.id}`,
          author: video.username ?? null,
          matchedKeywords: [keyword],
        });

        if (inserted) {
          await notify(monitor, 'TikTok', keyword, description.slice(0, 120));
          newCount++;
        }
      }
    } catch (err) {
      console.error(`TikTok poll failed for "${keyword}":`, err.message);
    }
  }
  return newCount;
}

// ─── Shared helpers ───────────────────────────────────────────

async function saveMentions(monitor, keywords, items, mapper) {
  let newCount = 0;
  for (const item of items) {
    const m = mapper(item);
    if (!m.matchedKeywords?.length) continue;

    const relevant = await checkRelevanceWithAI(
      m.checkTitle ?? m.checkText ?? m.content ?? '',
      m.checkText !== m.checkTitle ? (m.checkText ?? '') : '',
      m.matchedKeywords,
      monitor.ai_prompt,
      monitor.business_name
    );
    if (!relevant) continue;

    const inserted = await upsertMention({
      businessId: monitor.business_id,
      monitorId: monitor.id,
      platform: monitor.platform,
      externalId: m.externalId,
      title: m.title ?? null,
      content: m.content ?? null,
      url: m.url ?? null,
      author: m.author ?? null,
      matchedKeywords: m.matchedKeywords,
    });

    if (inserted) {
      await notify(monitor, platformLabel(monitor.platform), m.matchedKeywords.join(', '), (m.title || m.content || '').slice(0, 120));
      newCount++;
    }
  }
  return newCount;
}

async function upsertMention({ businessId, monitorId, platform, externalId, title, content, url, author, matchedKeywords }) {
  try {
    const result = await query(
      `INSERT INTO keyword_mentions
         (business_id, monitor_id, platform, external_id, title, content, url, author, matched_keywords)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (business_id, platform, external_id) DO NOTHING
       RETURNING id`,
      [businessId, monitorId, platform, externalId, title || null, content || null, url || null, author || null, JSON.stringify(matchedKeywords)]
    );
    return result.rows.length > 0;
  } catch (err) {
    console.error('upsertMention error:', err.message);
    return false;
  }
}

async function notify(monitor, platformName, matchedTerm, preview) {
  return createNotification(
    monitor.business_id,
    null,
    `New ${platformName} mention: ${matchedTerm}`,
    preview,
    'info',
    'mention',
    `/owner/mentions`,
    { platform: monitor.platform, monitorId: monitor.id }
  );
}

async function checkRelevanceWithAI(title, content, matchedKeywords, aiPrompt, businessName) {
  if (!process.env.OPENAI_API_KEY) return true;
  try {
    const criteria = aiPrompt ||
      `Return "true" only if this post is from a potential customer or someone who could benefit from ${businessName}. Return "false" for generic discussion, news, or unrelated content.`;

    const prompt = `You are an AI filter for ${businessName}. ${criteria}\n\nMatched keywords: ${matchedKeywords.join(', ')}\n\nOutput only one word: "true" or "false". No explanation.`;
    const combined = title ? `Title: ${title}\n\nContent: ${content}` : content;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'system', content: prompt }, { role: 'user', content: combined }],
      temperature: 0.2,
      max_tokens: 5,
    });

    return (response.choices[0]?.message?.content ?? '').toLowerCase().includes('true');
  } catch (err) {
    console.error('AI relevance check failed:', err.message);
    return true;
  }
}

function platformLabel(platform) {
  const labels = { twitter: 'Twitter', reddit: 'Reddit', instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', tiktok: 'TikTok' };
  return labels[platform] ?? platform;
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function getYesterdayDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}
