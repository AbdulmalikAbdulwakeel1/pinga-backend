const { query } = require('../config/database');
const { logActivity } = require('../utils/activityLogger');

const ALL_PLATFORMS = ['instagram', 'facebook', 'whatsapp', 'twitter', 'linkedin', 'tiktok', 'reddit'];

// ─── Get Integrations ──────────────────────────────────────────
exports.getIntegrations = async (req, res) => {
  try {
    const businessId = req.user.businessId;

    const result = await query(
      `SELECT platform, account_id, account_name, phone_number_id, waba_id,
              is_active, webhook_verified, connected_at
       FROM platform_connections
       WHERE business_id = $1 AND deleted_at IS NULL`,
      [businessId]
    );

    const connected = {};
    for (const row of result.rows) {
      connected[row.platform] = row;
    }

    const integrations = ALL_PLATFORMS.map(platform => {
      const conn = connected[platform];
      if (conn && conn.is_active) {
        return {
          platform,
          connected: true,
          accountName: conn.account_name,
          accountId: conn.account_id,
          phoneNumberId: conn.phone_number_id || undefined,
          wabaId: conn.waba_id || undefined,
          webhookVerified: conn.webhook_verified,
          connectedAt: conn.connected_at
        };
      }
      return { platform, connected: false };
    });

    res.status(200).json({ success: true, data: integrations });
  } catch (error) {
    console.error('Get integrations error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch integrations' });
  }
};

// ─── Connect Instagram ─────────────────────────────────────────
exports.connectInstagram = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { code, redirectUri } = req.body;

    if (!code || !redirectUri) {
      return res.status(400).json({ success: false, message: 'OAuth code and redirectUri are required' });
    }

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      return res.status(503).json({
        success: false,
        message: 'Instagram OAuth not configured. Set META_APP_ID and META_APP_SECRET environment variables.'
      });
    }

    // Exchange code for access token
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;

    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return res.status(400).json({
        success: false,
        message: 'Failed to exchange OAuth code for access token',
        details: tokenData.error?.message
      });
    }

    const accessToken = tokenData.access_token;

    // Get Facebook user profile
    const profileRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${accessToken}`);
    const profileData = await profileRes.json();

    // Get pages to find Instagram Business Account
    const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`);
    const pagesData = await pagesRes.json();

    let instagramAccountId = null;
    let pageId = null;
    let accountName = profileData.name || 'Instagram Account';

    if (pagesData.data && pagesData.data.length > 0) {
      const page = pagesData.data[0];
      pageId = page.id;

      // Get Instagram Business Account linked to this page
      const igRes = await fetch(`https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token || accessToken}`);
      const igData = await igRes.json();

      if (igData.instagram_business_account) {
        instagramAccountId = igData.instagram_business_account.id;

        // Get Instagram account details
        const igProfileRes = await fetch(`https://graph.facebook.com/v19.0/${instagramAccountId}?fields=name,username&access_token=${accessToken}`);
        const igProfile = await igProfileRes.json();
        accountName = igProfile.username || igProfile.name || accountName;
      }
    }

    // Upsert platform connection
    const result = await query(
      `INSERT INTO platform_connections (
         business_id, platform, account_id, account_name, access_token,
         page_id, is_active, webhook_verified, connected_at
       ) VALUES ($1, 'instagram', $2, $3, $4, $5, true, false, NOW())
       ON CONFLICT (business_id, platform) DO UPDATE SET
         account_id = EXCLUDED.account_id,
         account_name = EXCLUDED.account_name,
         access_token = EXCLUDED.access_token,
         page_id = EXCLUDED.page_id,
         is_active = true,
         deleted_at = NULL,
         connected_at = NOW(),
         updated_at = NOW()
       RETURNING id, platform, account_name, connected_at`,
      [businessId, instagramAccountId || profileData.id, accountName, accessToken, pageId]
    );

    logActivity(businessId, req.user.id, 'CONNECT_INSTAGRAM', `Connected Instagram account: ${accountName}`, 'integration', null, null, req).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'Instagram connected successfully',
      data: {
        platform: 'instagram',
        connected: true,
        accountName,
        connectedAt: result.rows[0].connected_at
      }
    });
  } catch (error) {
    console.error('Connect Instagram error:', error);
    res.status(500).json({ success: false, message: 'Failed to connect Instagram' });
  }
};

// ─── Connect Facebook ──────────────────────────────────────────
exports.connectFacebook = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { code, redirectUri } = req.body;

    if (!code || !redirectUri) {
      return res.status(400).json({ success: false, message: 'OAuth code and redirectUri are required' });
    }

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      return res.status(503).json({
        success: false,
        message: 'Facebook OAuth not configured. Set META_APP_ID and META_APP_SECRET environment variables.'
      });
    }

    // Exchange code for access token
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;

    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return res.status(400).json({
        success: false,
        message: 'Failed to exchange OAuth code for access token',
        details: tokenData.error?.message
      });
    }

    const accessToken = tokenData.access_token;

    // Get pages (for Messenger)
    const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`);
    const pagesData = await pagesRes.json();

    let pageId = null;
    let pageAccessToken = accessToken;
    let accountName = 'Facebook Page';

    if (pagesData.data && pagesData.data.length > 0) {
      const page = pagesData.data[0];
      pageId = page.id;
      pageAccessToken = page.access_token || accessToken;
      accountName = page.name;
    } else {
      // Fallback: get user profile
      const profileRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${accessToken}`);
      const profileData = await profileRes.json();
      accountName = profileData.name || 'Facebook';
      pageId = profileData.id;
    }

    // Upsert platform connection
    const result = await query(
      `INSERT INTO platform_connections (
         business_id, platform, account_id, account_name, access_token,
         page_id, is_active, webhook_verified, connected_at
       ) VALUES ($1, 'facebook', $2, $3, $4, $5, true, false, NOW())
       ON CONFLICT (business_id, platform) DO UPDATE SET
         account_id = EXCLUDED.account_id,
         account_name = EXCLUDED.account_name,
         access_token = EXCLUDED.access_token,
         page_id = EXCLUDED.page_id,
         is_active = true,
         deleted_at = NULL,
         connected_at = NOW(),
         updated_at = NOW()
       RETURNING id, platform, account_name, connected_at`,
      [businessId, pageId, accountName, pageAccessToken, pageId]
    );

    logActivity(businessId, req.user.id, 'CONNECT_FACEBOOK', `Connected Facebook page: ${accountName}`, 'integration', null, null, req).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'Facebook connected successfully',
      data: {
        platform: 'facebook',
        connected: true,
        accountName,
        connectedAt: result.rows[0].connected_at
      }
    });
  } catch (error) {
    console.error('Connect Facebook error:', error);
    res.status(500).json({ success: false, message: 'Failed to connect Facebook' });
  }
};

// ─── Connect WhatsApp ──────────────────────────────────────────
exports.connectWhatsApp = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { phoneNumberId, wabaId, accessToken, displayPhoneNumber } = req.body;

    if (!phoneNumberId || !wabaId || !accessToken) {
      return res.status(400).json({ success: false, message: 'phoneNumberId, wabaId, and accessToken are required' });
    }

    // Verify credentials by calling Meta API
    const verifyRes = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}?access_token=${accessToken}`);
    const verifyData = await verifyRes.json();

    if (verifyData.error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid WhatsApp credentials',
        details: verifyData.error.message
      });
    }

    const accountName = verifyData.display_phone_number || displayPhoneNumber || verifyData.verified_name || 'WhatsApp Business';

    // Upsert platform connection
    const result = await query(
      `INSERT INTO platform_connections (
         business_id, platform, account_id, account_name, access_token,
         phone_number_id, waba_id, is_active, webhook_verified, connected_at
       ) VALUES ($1, 'whatsapp', $2, $3, $4, $5, $6, true, false, NOW())
       ON CONFLICT (business_id, platform) DO UPDATE SET
         account_id = EXCLUDED.account_id,
         account_name = EXCLUDED.account_name,
         access_token = EXCLUDED.access_token,
         phone_number_id = EXCLUDED.phone_number_id,
         waba_id = EXCLUDED.waba_id,
         is_active = true,
         deleted_at = NULL,
         connected_at = NOW(),
         updated_at = NOW()
       RETURNING id, platform, account_name, connected_at`,
      [businessId, wabaId, accountName, accessToken, phoneNumberId, wabaId]
    );

    logActivity(businessId, req.user.id, 'CONNECT_WHATSAPP', `Connected WhatsApp number: ${accountName}`, 'integration', null, null, req).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'WhatsApp connected successfully',
      data: {
        platform: 'whatsapp',
        connected: true,
        accountName,
        phoneNumberId,
        wabaId,
        connectedAt: result.rows[0].connected_at
      }
    });
  } catch (error) {
    console.error('Connect WhatsApp error:', error);
    res.status(500).json({ success: false, message: 'Failed to connect WhatsApp' });
  }
};

// ─── Connect Twitter/X ────────────────────────────────────────
exports.connectTwitter = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { code, redirectUri, codeVerifier } = req.body;

    if (!code || !redirectUri || !codeVerifier) {
      return res.status(400).json({ success: false, message: 'code, redirectUri, and codeVerifier are required' });
    }

    const clientId = process.env.TWITTER_CLIENT_ID;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(503).json({
        success: false,
        message: 'Twitter OAuth not configured. Set TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET.'
      });
    }

    const params = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });

    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: params.toString(),
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return res.status(400).json({
        success: false,
        message: 'Failed to exchange OAuth code for Twitter access token',
        details: tokenData.error_description || tokenData.error
      });
    }

    const userRes = await fetch('https://api.twitter.com/2/users/me?user.fields=name,username', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json();
    const twitterUser = userData.data || {};
    const accountName = twitterUser.username || twitterUser.name || 'Twitter Account';
    const accountId = twitterUser.id || 'unknown';

    await query(
      `INSERT INTO platform_connections (
         business_id, platform, account_id, account_name, access_token, refresh_token,
         is_active, webhook_verified, connected_at
       ) VALUES ($1, 'twitter', $2, $3, $4, $5, true, false, NOW())
       ON CONFLICT (business_id, platform) DO UPDATE SET
         account_id = EXCLUDED.account_id,
         account_name = EXCLUDED.account_name,
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         is_active = true,
         deleted_at = NULL,
         connected_at = NOW(),
         updated_at = NOW()
       RETURNING id`,
      [businessId, accountId, accountName, tokenData.access_token, tokenData.refresh_token || null]
    );

    logActivity(businessId, req.user.id, 'CONNECT_TWITTER', `Connected Twitter: @${accountName}`, 'integration', null, null, req).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'Twitter connected successfully',
      data: { platform: 'twitter', connected: true, accountName, connectedAt: new Date() }
    });
  } catch (error) {
    console.error('Connect Twitter error:', error);
    res.status(500).json({ success: false, message: 'Failed to connect Twitter' });
  }
};

// ─── Connect LinkedIn ──────────────────────────────────────────
exports.connectLinkedIn = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { code, redirectUri } = req.body;

    if (!code || !redirectUri) {
      return res.status(400).json({ success: false, message: 'code and redirectUri are required' });
    }

    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(503).json({
        success: false,
        message: 'LinkedIn OAuth not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET.'
      });
    }

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return res.status(400).json({
        success: false,
        message: 'Failed to exchange OAuth code for LinkedIn access token',
        details: tokenData.error_description || tokenData.error
      });
    }

    const userRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json();
    const accountName = userData.name || userData.email || 'LinkedIn Account';
    const accountId = userData.sub || 'unknown';

    await query(
      `INSERT INTO platform_connections (
         business_id, platform, account_id, account_name, access_token, refresh_token,
         is_active, webhook_verified, connected_at
       ) VALUES ($1, 'linkedin', $2, $3, $4, $5, true, false, NOW())
       ON CONFLICT (business_id, platform) DO UPDATE SET
         account_id = EXCLUDED.account_id,
         account_name = EXCLUDED.account_name,
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         is_active = true,
         deleted_at = NULL,
         connected_at = NOW(),
         updated_at = NOW()
       RETURNING id`,
      [businessId, accountId, accountName, tokenData.access_token, tokenData.refresh_token || null]
    );

    logActivity(businessId, req.user.id, 'CONNECT_LINKEDIN', `Connected LinkedIn: ${accountName}`, 'integration', null, null, req).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'LinkedIn connected successfully',
      data: { platform: 'linkedin', connected: true, accountName, connectedAt: new Date() }
    });
  } catch (error) {
    console.error('Connect LinkedIn error:', error);
    res.status(500).json({ success: false, message: 'Failed to connect LinkedIn' });
  }
};

// ─── Connect TikTok ────────────────────────────────────────────
exports.connectTikTok = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { code, redirectUri, codeVerifier } = req.body;

    if (!code || !redirectUri || !codeVerifier) {
      return res.status(400).json({ success: false, message: 'code, redirectUri, and codeVerifier are required' });
    }

    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

    if (!clientKey || !clientSecret) {
      return res.status(503).json({
        success: false,
        message: 'TikTok OAuth not configured. Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET.'
      });
    }

    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }).toString(),
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return res.status(400).json({
        success: false,
        message: 'Failed to exchange OAuth code for TikTok access token',
        details: tokenData.error?.message || tokenData.error
      });
    }

    const userRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json();
    const tiktokUser = userData.data?.user || {};
    const accountName = tiktokUser.display_name || 'TikTok Account';
    const accountId = tiktokUser.open_id || 'unknown';

    await query(
      `INSERT INTO platform_connections (
         business_id, platform, account_id, account_name, access_token, refresh_token,
         is_active, webhook_verified, connected_at
       ) VALUES ($1, 'tiktok', $2, $3, $4, $5, true, false, NOW())
       ON CONFLICT (business_id, platform) DO UPDATE SET
         account_id = EXCLUDED.account_id,
         account_name = EXCLUDED.account_name,
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         is_active = true,
         deleted_at = NULL,
         connected_at = NOW(),
         updated_at = NOW()
       RETURNING id`,
      [businessId, accountId, accountName, tokenData.access_token, tokenData.refresh_token || null]
    );

    logActivity(businessId, req.user.id, 'CONNECT_TIKTOK', `Connected TikTok: ${accountName}`, 'integration', null, null, req).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'TikTok connected successfully',
      data: { platform: 'tiktok', connected: true, accountName, connectedAt: new Date() }
    });
  } catch (error) {
    console.error('Connect TikTok error:', error);
    res.status(500).json({ success: false, message: 'Failed to connect TikTok' });
  }
};

// ─── Connect Reddit ────────────────────────────────────────────
exports.connectReddit = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { code, redirectUri } = req.body;

    if (!code || !redirectUri) {
      return res.status(400).json({ success: false, message: 'code and redirectUri are required' });
    }

    const clientId = process.env.REDDIT_CLIENT_ID;
    const clientSecret = process.env.REDDIT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(503).json({
        success: false,
        message: 'Reddit OAuth not configured. Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET.'
      });
    }

    const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'User-Agent': 'Pinga/1.0',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return res.status(400).json({
        success: false,
        message: 'Failed to exchange OAuth code for Reddit access token',
        details: tokenData.error
      });
    }

    const userRes = await fetch('https://oauth.reddit.com/api/v1/me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'User-Agent': 'Pinga/1.0',
      },
    });
    const userData = await userRes.json();
    const accountName = userData.name || 'Reddit Account';
    const accountId = userData.id || 'unknown';

    await query(
      `INSERT INTO platform_connections (
         business_id, platform, account_id, account_name, access_token, refresh_token,
         is_active, webhook_verified, connected_at
       ) VALUES ($1, 'reddit', $2, $3, $4, $5, true, false, NOW())
       ON CONFLICT (business_id, platform) DO UPDATE SET
         account_id = EXCLUDED.account_id,
         account_name = EXCLUDED.account_name,
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         is_active = true,
         deleted_at = NULL,
         connected_at = NOW(),
         updated_at = NOW()
       RETURNING id`,
      [businessId, accountId, accountName, tokenData.access_token, tokenData.refresh_token || null]
    );

    logActivity(businessId, req.user.id, 'CONNECT_REDDIT', `Connected Reddit: u/${accountName}`, 'integration', null, null, req).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'Reddit connected successfully',
      data: { platform: 'reddit', connected: true, accountName, connectedAt: new Date() }
    });
  } catch (error) {
    console.error('Connect Reddit error:', error);
    res.status(500).json({ success: false, message: 'Failed to connect Reddit' });
  }
};

// ─── Disconnect Platform ───────────────────────────────────────
exports.disconnectPlatform = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { platform } = req.params;

    if (!ALL_PLATFORMS.includes(platform)) {
      return res.status(400).json({ success: false, message: `Invalid platform. Must be one of: ${ALL_PLATFORMS.join(', ')}` });
    }

    const result = await query(
      `UPDATE platform_connections
       SET is_active = false, deleted_at = NOW(), updated_at = NOW()
       WHERE business_id = $1 AND platform = $2 AND deleted_at IS NULL
       RETURNING id, platform, account_name`,
      [businessId, platform]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: `${platform} is not connected` });
    }

    logActivity(businessId, req.user.id, 'DISCONNECT_PLATFORM', `Disconnected ${platform}: ${result.rows[0].account_name}`, 'integration', null, { platform }, req).catch(() => {});

    res.status(200).json({
      success: true,
      message: `${platform} disconnected successfully`
    });
  } catch (error) {
    console.error('Disconnect platform error:', error);
    res.status(500).json({ success: false, message: 'Failed to disconnect platform' });
  }
};
