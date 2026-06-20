const { query, transaction } = require('../config/database');
const { logActivity } = require('../utils/activityLogger');
const { paginate, buildPaginationMeta } = require('../utils/helpers');
const { v4: uuidv4 } = require('uuid');

// ─── Get Conversations ────────────────────────────────────────
exports.getConversations = async (req, res) => {
  try {
    const { platform, status, assigned_to, search } = req.query;
    const { page, limit, offset } = paginate(req.query.page, req.query.limit);
    const businessId = req.user.businessId;

    const conditions = ['c.business_id = $1', 'c.deleted_at IS NULL'];
    const params = [businessId];
    let idx = 2;

    if (platform) {
      conditions.push(`c.platform = $${idx++}`);
      params.push(platform);
    }
    if (status) {
      conditions.push(`c.status = $${idx++}`);
      params.push(status);
    }
    if (assigned_to) {
      conditions.push(`c.assigned_to = $${idx++}`);
      params.push(assigned_to);
    }
    if (search) {
      conditions.push(`(ct.name ILIKE $${idx} OR ct.email ILIKE $${idx} OR ct.phone ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM conversations c
       LEFT JOIN contacts ct ON c.contact_id = ct.id AND ct.deleted_at IS NULL
       WHERE ${where}`,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    const result = await query(
      `SELECT
         c.id, c.platform, c.platform_conversation_id, c.status,
         c.is_ai_enabled, c.assigned_to, c.last_message, c.last_message_at,
         c.unread_count, c.lead_id, c.created_at, c.updated_at,
         ct.id as contact_id, ct.name as contact_name, ct.email as contact_email,
         ct.phone as contact_phone, ct.avatar_url as contact_avatar,
         ct.platform_username as contact_username,
         u.first_name as agent_first_name, u.last_name as agent_last_name
       FROM conversations c
       LEFT JOIN contacts ct ON c.contact_id = ct.id AND ct.deleted_at IS NULL
       LEFT JOIN users u ON c.assigned_to = u.id AND u.deleted_at IS NULL
       WHERE ${where}
       ORDER BY c.last_message_at DESC NULLS LAST, c.updated_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    const conversations = result.rows.map(row => ({
      id: row.id,
      platform: row.platform,
      platformConversationId: row.platform_conversation_id,
      status: row.status,
      isAiEnabled: row.is_ai_enabled,
      lastMessage: row.last_message,
      lastMessageAt: row.last_message_at,
      unreadCount: row.unread_count,
      leadId: row.lead_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      contact: {
        id: row.contact_id,
        name: row.contact_name,
        email: row.contact_email,
        phone: row.contact_phone,
        avatarUrl: row.contact_avatar,
        username: row.contact_username
      },
      assignedTo: row.assigned_to
        ? {
            id: row.assigned_to,
            name: `${row.agent_first_name || ''} ${row.agent_last_name || ''}`.trim()
          }
        : null
    }));

    res.status(200).json({
      success: true,
      data: {
        conversations,
        pagination: buildPaginationMeta(total, page, limit)
      }
    });

  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch conversations' });
  }
};

// ─── Get Single Conversation ──────────────────────────────────
exports.getConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.user.businessId;

    const convResult = await query(
      `SELECT
         c.id, c.platform, c.platform_conversation_id, c.status,
         c.is_ai_enabled, c.assigned_to, c.last_message, c.last_message_at,
         c.unread_count, c.lead_id, c.created_at, c.updated_at,
         ct.id as contact_id, ct.name as contact_name, ct.email as contact_email,
         ct.phone as contact_phone, ct.avatar_url as contact_avatar,
         ct.platform_username as contact_username, ct.platform as contact_platform,
         ct.platform_user_id, ct.notes as contact_notes, ct.tags as contact_tags,
         u.first_name as agent_first_name, u.last_name as agent_last_name
       FROM conversations c
       LEFT JOIN contacts ct ON c.contact_id = ct.id AND ct.deleted_at IS NULL
       LEFT JOIN users u ON c.assigned_to = u.id AND u.deleted_at IS NULL
       WHERE c.id = $1 AND c.business_id = $2 AND c.deleted_at IS NULL`,
      [id, businessId]
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const row = convResult.rows[0];

    // Get last 50 messages
    const msgResult = await query(
      `SELECT id, content, sender, platform, platform_message_id, is_read,
              message_type, attachments, product_share, timestamp, created_at
       FROM messages
       WHERE conversation_id = $1 AND business_id = $2
       ORDER BY timestamp DESC, created_at DESC
       LIMIT 50`,
      [id, businessId]
    );

    const conversation = {
      id: row.id,
      platform: row.platform,
      platformConversationId: row.platform_conversation_id,
      status: row.status,
      isAiEnabled: row.is_ai_enabled,
      lastMessage: row.last_message,
      lastMessageAt: row.last_message_at,
      unreadCount: row.unread_count,
      leadId: row.lead_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      contact: {
        id: row.contact_id,
        name: row.contact_name,
        email: row.contact_email,
        phone: row.contact_phone,
        avatarUrl: row.contact_avatar,
        username: row.contact_username,
        platform: row.contact_platform,
        platformUserId: row.platform_user_id,
        notes: row.contact_notes,
        tags: row.contact_tags
      },
      assignedTo: row.assigned_to
        ? {
            id: row.assigned_to,
            name: `${row.agent_first_name || ''} ${row.agent_last_name || ''}`.trim()
          }
        : null,
      messages: msgResult.rows.reverse()
    };

    res.status(200).json({ success: true, data: conversation });

  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch conversation' });
  }
};

// ─── Update Conversation ──────────────────────────────────────
exports.updateConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, assigned_to } = req.body;
    const businessId = req.user.businessId;

    const existing = await query(
      'SELECT id FROM conversations WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
      [id, businessId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const result = await query(
      `UPDATE conversations
       SET status      = COALESCE($1, status),
           assigned_to = COALESCE($2, assigned_to),
           updated_at  = NOW()
       WHERE id = $3 AND business_id = $4 AND deleted_at IS NULL
       RETURNING id, status, assigned_to, updated_at`,
      [status || null, assigned_to || null, id, businessId]
    );

    await logActivity(
      businessId, req.user.id,
      'UPDATE_CONVERSATION',
      `Updated conversation ${id}`,
      'conversation', id,
      { status, assigned_to }, req
    );

    res.status(200).json({
      success: true,
      message: 'Conversation updated',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Update conversation error:', error);
    res.status(500).json({ success: false, error: 'Failed to update conversation' });
  }
};

// ─── Toggle AI ────────────────────────────────────────────────
exports.toggleAI = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.user.businessId;

    const existing = await query(
      'SELECT id, is_ai_enabled FROM conversations WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
      [id, businessId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const currentAI = existing.rows[0].is_ai_enabled;

    const result = await query(
      `UPDATE conversations
       SET is_ai_enabled = $1, updated_at = NOW()
       WHERE id = $2 AND business_id = $3
       RETURNING id, is_ai_enabled`,
      [!currentAI, id, businessId]
    );

    res.status(200).json({
      success: true,
      message: `AI ${!currentAI ? 'enabled' : 'disabled'} for conversation`,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Toggle AI error:', error);
    res.status(500).json({ success: false, error: 'Failed to toggle AI' });
  }
};

// ─── Get Messages ─────────────────────────────────────────────
exports.getMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const { before_id } = req.query;
    const { limit } = paginate(1, req.query.limit || 30);
    const businessId = req.user.businessId;

    // Verify conversation belongs to business
    const convCheck = await query(
      'SELECT id FROM conversations WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
      [id, businessId]
    );

    if (convCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const conditions = ['conversation_id = $1', 'business_id = $2'];
    const params = [id, businessId];
    let idx = 3;

    if (before_id) {
      // Cursor-based pagination: get messages before a specific message id
      const cursorResult = await query(
        'SELECT created_at FROM messages WHERE id = $1',
        [before_id]
      );
      if (cursorResult.rows.length > 0) {
        conditions.push(`(timestamp < $${idx} OR (timestamp = $${idx} AND id < $${idx + 1}))`);
        params.push(cursorResult.rows[0].created_at, before_id);
        idx += 2;
      }
    }

    const where = conditions.join(' AND ');

    const result = await query(
      `SELECT id, content, sender, platform, platform_message_id, is_read,
              message_type, attachments, product_share, timestamp, created_at
       FROM messages
       WHERE ${where}
       ORDER BY timestamp DESC, created_at DESC
       LIMIT $${idx}`,
      [...params, limit]
    );

    const messages = result.rows.reverse();

    res.status(200).json({
      success: true,
      data: {
        messages,
        hasMore: result.rows.length === limit
      }
    });

  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch messages' });
  }
};

// ─── Send Message ─────────────────────────────────────────────
exports.sendMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { content, message_type = 'text', attachments = null, product_share = null, sender = 'business' } = req.body;
    const businessId = req.user.businessId;

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'Message content is required' });
    }

    // Verify conversation
    const convCheck = await query(
      'SELECT id, platform FROM conversations WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
      [id, businessId]
    );

    if (convCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const platform = convCheck.rows[0].platform;
    const now = new Date();

    const result = await transaction(async (client) => {
      // Insert message
      const msgResult = await client.query(
        `INSERT INTO messages
           (conversation_id, business_id, content, sender, platform, is_read,
            message_type, attachments, product_share, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, conversation_id, content, sender, platform, is_read,
                   message_type, attachments, product_share, timestamp, created_at`,
        [
          id, businessId, content.trim(), sender, platform, true,
          message_type,
          attachments ? JSON.stringify(attachments) : null,
          product_share ? JSON.stringify(product_share) : null,
          now
        ]
      );

      const message = msgResult.rows[0];

      // Update conversation last_message
      await client.query(
        `UPDATE conversations
         SET last_message = $1,
             last_message_at = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [content.trim().substring(0, 500), now, id]
      );

      return message;
    });

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      const payload = { conversationId: id, message: result };
      io.to(`business:${businessId}`).emit('message:new', payload);
      io.to(`conversation:${id}`).emit('message:new', payload);
    }

    res.status(201).json({
      success: true,
      message: 'Message sent',
      data: result
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
};

// ─── Mark All as Read ─────────────────────────────────────────
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.user.businessId;

    const convCheck = await query(
      'SELECT id FROM conversations WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
      [id, businessId]
    );

    if (convCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    await transaction(async (client) => {
      await client.query(
        `UPDATE messages SET is_read = true
         WHERE conversation_id = $1 AND business_id = $2 AND is_read = false`,
        [id, businessId]
      );

      await client.query(
        `UPDATE conversations SET unread_count = 0, updated_at = NOW()
         WHERE id = $1 AND business_id = $2`,
        [id, businessId]
      );
    });

    res.status(200).json({
      success: true,
      message: 'All messages marked as read'
    });

  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ success: false, error: 'Failed to mark messages as read' });
  }
};
