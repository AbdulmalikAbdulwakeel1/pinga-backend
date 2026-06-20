const { query } = require('../config/database');
const { logActivity } = require('../utils/activityLogger');
const { paginate, buildPaginationMeta } = require('../utils/helpers');

// ─── Get Broadcasts ────────────────────────────────────────────
exports.getBroadcasts = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { status } = req.query;
    const { page, limit, offset } = paginate(req.query.page, req.query.limit);

    const conditions = ['b.business_id = $1', 'b.deleted_at IS NULL'];
    const params = [businessId];
    let idx = 2;

    if (status) {
      conditions.push(`b.status = $${idx++}`);
      params.push(status);
    }

    const where = conditions.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*) AS total FROM broadcasts b WHERE ${where}`,
      params
    );

    const result = await query(
      `SELECT
         b.id, b.title, b.message, b.audience, b.recipient_count,
         b.sent_count, b.status, b.scheduled_at, b.sent_at,
         b.created_at, b.created_by,
         u.first_name AS creator_first_name, u.last_name AS creator_last_name
       FROM broadcasts b
       LEFT JOIN users u ON b.created_by = u.id AND u.deleted_at IS NULL
       WHERE ${where}
       ORDER BY b.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    const total = parseInt(countResult.rows[0].total);
    res.status(200).json({
      success: true,
      data: result.rows.map(r => ({
        id: r.id,
        title: r.title,
        message: r.message,
        audience: r.audience,
        recipientCount: r.recipient_count,
        sentCount: r.sent_count,
        status: r.status,
        scheduledAt: r.scheduled_at,
        sentAt: r.sent_at,
        createdAt: r.created_at,
        createdBy: {
          id: r.created_by,
          name: r.creator_first_name ? `${r.creator_first_name} ${r.creator_last_name}` : null
        }
      })),
      pagination: buildPaginationMeta(total, page, limit)
    });
  } catch (error) {
    console.error('Get broadcasts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch broadcasts' });
  }
};

// ─── Get Single Broadcast ──────────────────────────────────────
exports.getBroadcast = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { id } = req.params;

    const result = await query(
      `SELECT
         b.id, b.title, b.message, b.audience, b.recipient_count,
         b.sent_count, b.status, b.scheduled_at, b.sent_at,
         b.created_at, b.created_by,
         u.first_name AS creator_first_name, u.last_name AS creator_last_name
       FROM broadcasts b
       LEFT JOIN users u ON b.created_by = u.id AND u.deleted_at IS NULL
       WHERE b.id = $1 AND b.business_id = $2 AND b.deleted_at IS NULL`,
      [id, businessId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Broadcast not found' });
    }

    const r = result.rows[0];
    res.status(200).json({
      success: true,
      data: {
        id: r.id,
        title: r.title,
        message: r.message,
        audience: r.audience,
        recipientCount: r.recipient_count,
        sentCount: r.sent_count,
        status: r.status,
        scheduledAt: r.scheduled_at,
        sentAt: r.sent_at,
        createdAt: r.created_at,
        createdBy: {
          id: r.created_by,
          name: r.creator_first_name ? `${r.creator_first_name} ${r.creator_last_name}` : null
        }
      }
    });
  } catch (error) {
    console.error('Get broadcast error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch broadcast' });
  }
};

// ─── Create Broadcast ─────────────────────────────────────────
exports.createBroadcast = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { title, message, audience, scheduledAt } = req.body;

    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message are required' });
    }

    // Count potential recipients from contacts
    const audienceFilter = audience || 'all';
    let recipientCount = 0;

    if (audienceFilter === 'all') {
      const countResult = await query(
        `SELECT COUNT(*) AS cnt FROM contacts WHERE business_id = $1 AND deleted_at IS NULL`,
        [businessId]
      );
      recipientCount = parseInt(countResult.rows[0].cnt);
    } else {
      const countResult = await query(
        `SELECT COUNT(*) AS cnt FROM contacts WHERE business_id = $1 AND platform = $2 AND deleted_at IS NULL`,
        [businessId, audienceFilter]
      );
      recipientCount = parseInt(countResult.rows[0].cnt);
    }

    const result = await query(
      `INSERT INTO broadcasts (
         business_id, title, message, audience, recipient_count,
         sent_count, status, scheduled_at, created_by
       ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8)
       RETURNING *`,
      [
        businessId,
        title,
        message,
        audienceFilter,
        recipientCount,
        scheduledAt ? 'scheduled' : 'draft',
        scheduledAt || null,
        req.user.id
      ]
    );

    logActivity(businessId, req.user.id, 'CREATE_BROADCAST', `Created broadcast: ${title}`, 'broadcast', result.rows[0].id, null, req).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'Broadcast created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Create broadcast error:', error);
    res.status(500).json({ success: false, message: 'Failed to create broadcast' });
  }
};

// ─── Update Broadcast ─────────────────────────────────────────
exports.updateBroadcast = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { id } = req.params;
    const { title, message, audience, scheduledAt } = req.body;

    const existing = await query(
      `SELECT id, status FROM broadcasts WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL`,
      [id, businessId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Broadcast not found' });
    }

    if (existing.rows[0].status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Only draft broadcasts can be edited' });
    }

    // Recalculate recipients if audience changed
    let recipientCount;
    if (audience) {
      if (audience === 'all') {
        const cr = await query(
          `SELECT COUNT(*) AS cnt FROM contacts WHERE business_id = $1 AND deleted_at IS NULL`,
          [businessId]
        );
        recipientCount = parseInt(cr.rows[0].cnt);
      } else {
        const cr = await query(
          `SELECT COUNT(*) AS cnt FROM contacts WHERE business_id = $1 AND platform = $2 AND deleted_at IS NULL`,
          [businessId, audience]
        );
        recipientCount = parseInt(cr.rows[0].cnt);
      }
    }

    const result = await query(
      `UPDATE broadcasts SET
         title = COALESCE($1, title),
         message = COALESCE($2, message),
         audience = COALESCE($3, audience),
         recipient_count = COALESCE($4, recipient_count),
         scheduled_at = COALESCE($5, scheduled_at),
         status = CASE WHEN $5 IS NOT NULL THEN 'scheduled' ELSE status END,
         updated_at = NOW()
       WHERE id = $6 AND business_id = $7 AND deleted_at IS NULL
       RETURNING *`,
      [title || null, message || null, audience || null, recipientCount || null, scheduledAt || null, id, businessId]
    );

    res.status(200).json({
      success: true,
      message: 'Broadcast updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Update broadcast error:', error);
    res.status(500).json({ success: false, message: 'Failed to update broadcast' });
  }
};

// ─── Delete Broadcast (Soft) ───────────────────────────────────
exports.deleteBroadcast = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { id } = req.params;

    const result = await query(
      `UPDATE broadcasts SET deleted_at = NOW()
       WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL
       RETURNING id, title`,
      [id, businessId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Broadcast not found' });
    }

    logActivity(businessId, req.user.id, 'DELETE_BROADCAST', `Deleted broadcast: ${result.rows[0].title}`, 'broadcast', id, null, req).catch(() => {});

    res.status(200).json({ success: true, message: 'Broadcast deleted successfully' });
  } catch (error) {
    console.error('Delete broadcast error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete broadcast' });
  }
};

// ─── Send Broadcast ────────────────────────────────────────────
exports.sendBroadcast = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { id } = req.params;

    const existing = await query(
      `SELECT * FROM broadcasts WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL`,
      [id, businessId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Broadcast not found' });
    }

    const broadcast = existing.rows[0];

    if (broadcast.status === 'sent') {
      return res.status(400).json({ success: false, message: 'Broadcast has already been sent' });
    }

    // Count actual recipients
    let recipientCount = 0;
    if (broadcast.audience === 'all') {
      const cr = await query(
        `SELECT COUNT(*) AS cnt FROM contacts WHERE business_id = $1 AND deleted_at IS NULL`,
        [businessId]
      );
      recipientCount = parseInt(cr.rows[0].cnt);
    } else {
      const cr = await query(
        `SELECT COUNT(*) AS cnt FROM contacts WHERE business_id = $1 AND platform = $2 AND deleted_at IS NULL`,
        [businessId, broadcast.audience]
      );
      recipientCount = parseInt(cr.rows[0].cnt);
    }

    // Update to sent (in production, this would enqueue a job)
    const result = await query(
      `UPDATE broadcasts SET
         status = 'sent',
         sent_at = NOW(),
         sent_count = $1,
         recipient_count = $1,
         updated_at = NOW()
       WHERE id = $2 AND business_id = $3
       RETURNING *`,
      [recipientCount, id, businessId]
    );

    logActivity(businessId, req.user.id, 'SEND_BROADCAST', `Sent broadcast: ${broadcast.title} to ${recipientCount} recipients`, 'broadcast', id, { recipientCount }, req).catch(() => {});

    res.status(200).json({
      success: true,
      message: `Broadcast sent to ${recipientCount} recipients`,
      data: {
        id: result.rows[0].id,
        title: result.rows[0].title,
        status: result.rows[0].status,
        sentAt: result.rows[0].sent_at,
        sentCount: result.rows[0].sent_count,
        recipientCount: result.rows[0].recipient_count
      }
    });
  } catch (error) {
    console.error('Send broadcast error:', error);
    res.status(500).json({ success: false, message: 'Failed to send broadcast' });
  }
};
