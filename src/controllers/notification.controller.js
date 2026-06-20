const { query } = require('../config/database');
const { paginate, buildPaginationMeta } = require('../utils/helpers');
const { emitToRoom } = require('../utils/socket');

// ─── Helper: Create Notification ─────────────────────────────
const createNotification = async (businessId, userId, title, message, type, category, link, metadata) => {
  try {
    const result = await query(
      `INSERT INTO notifications (business_id, user_id, title, message, type, category, is_read, link, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8)
       RETURNING id, title, message, type, category, is_read, link, metadata, created_at`,
      [
        businessId,
        userId || null,
        title,
        message,
        type || 'info',
        category || 'general',
        link || null,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
    const notification = result.rows[0];
    // Push to all clients in this business room in real-time
    emitToRoom(`business:${businessId}`, 'notification:new', notification);
    return notification;
  } catch (err) {
    console.error('Create notification error (non-critical):', err.message);
    return null;
  }
};

module.exports.createNotification = createNotification;

// ─── Get Notifications ─────────────────────────────────────────
exports.getNotifications = async (req, res) => {
  try {
    const { id: userId, businessId } = req.user;
    const { is_read, category } = req.query;
    const { page, limit, offset } = paginate(req.query.page, req.query.limit);

    const conditions = [
      'business_id = $1',
      '(user_id = $2 OR user_id IS NULL)'
    ];
    const params = [businessId, userId];
    let idx = 3;

    if (is_read !== undefined && is_read !== '') {
      conditions.push(`is_read = $${idx++}`);
      params.push(is_read === 'true' || is_read === true);
    }
    if (category) {
      conditions.push(`category = $${idx++}`);
      params.push(category);
    }

    const where = conditions.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*) AS total FROM notifications WHERE ${where}`,
      params
    );

    const result = await query(
      `SELECT id, title, message, type, category, is_read, link, metadata, created_at
       FROM notifications
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    const total = parseInt(countResult.rows[0].total);
    res.status(200).json({
      success: true,
      data: result.rows,
      pagination: buildPaginationMeta(total, page, limit)
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
};

// ─── Mark As Read ─────────────────────────────────────────────
exports.markAsRead = async (req, res) => {
  try {
    const { id: userId, businessId } = req.user;
    const { id } = req.params;

    const result = await query(
      `UPDATE notifications
       SET is_read = true
       WHERE id = $1 AND business_id = $2 AND (user_id = $3 OR user_id IS NULL)
       RETURNING id`,
      [id, businessId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.status(200).json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark notification as read' });
  }
};

// ─── Mark All As Read ─────────────────────────────────────────
exports.markAllAsRead = async (req, res) => {
  try {
    const { id: userId, businessId } = req.user;

    const result = await query(
      `UPDATE notifications
       SET is_read = true
       WHERE business_id = $1 AND (user_id = $2 OR user_id IS NULL) AND is_read = false`,
      [businessId, userId]
    );

    res.status(200).json({
      success: true,
      message: `Marked ${result.rowCount} notifications as read`
    });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark all notifications as read' });
  }
};

// ─── Get Unread Count ──────────────────────────────────────────
exports.getUnreadCount = async (req, res) => {
  try {
    const { id: userId, businessId } = req.user;

    const result = await query(
      `SELECT COUNT(*) AS count
       FROM notifications
       WHERE business_id = $1
         AND (user_id = $2 OR user_id IS NULL)
         AND is_read = false`,
      [businessId, userId]
    );

    res.status(200).json({
      success: true,
      data: { count: parseInt(result.rows[0].count) }
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch unread count' });
  }
};

// ─── Delete Notification ──────────────────────────────────────
exports.deleteNotification = async (req, res) => {
  try {
    const { id: userId, businessId } = req.user;
    const { id } = req.params;

    const result = await query(
      `DELETE FROM notifications
       WHERE id = $1 AND business_id = $2 AND (user_id = $3 OR user_id IS NULL)
       RETURNING id`,
      [id, businessId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.status(200).json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete notification' });
  }
};
