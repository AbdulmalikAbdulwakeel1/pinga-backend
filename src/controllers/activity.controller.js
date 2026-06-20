const { query } = require('../config/database');
const { paginate, buildPaginationMeta } = require('../utils/helpers');

// ─── Get Activity Logs ─────────────────────────────────────────
exports.getActivity = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { action, user_id, entity_type, start_date, end_date } = req.query;
    const { page, limit, offset } = paginate(req.query.page, req.query.limit);

    const conditions = ['al.business_id = $1'];
    const params = [businessId];
    let idx = 2;

    if (action) {
      conditions.push(`al.action = $${idx++}`);
      params.push(action);
    }
    if (user_id) {
      conditions.push(`al.user_id = $${idx++}`);
      params.push(user_id);
    }
    if (entity_type) {
      conditions.push(`al.entity_type = $${idx++}`);
      params.push(entity_type);
    }
    if (start_date) {
      conditions.push(`al.created_at >= $${idx++}`);
      params.push(start_date);
    }
    if (end_date) {
      conditions.push(`al.created_at <= $${idx++}`);
      params.push(end_date);
    }

    const where = conditions.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*) AS total FROM activity_logs al WHERE ${where}`,
      params
    );

    const result = await query(
      `SELECT
         al.id, al.action, al.description, al.entity_type, al.entity_id,
         al.metadata, al.ip_address, al.user_agent, al.created_at,
         u.id AS user_id,
         u.first_name AS user_first_name,
         u.last_name AS user_last_name,
         u.email AS user_email,
         u.role AS user_role,
         u.avatar_url AS user_avatar
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.id AND u.deleted_at IS NULL
       WHERE ${where}
       ORDER BY al.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    const total = parseInt(countResult.rows[0].total);
    res.status(200).json({
      success: true,
      data: result.rows.map(r => ({
        id: r.id,
        action: r.action,
        description: r.description,
        entityType: r.entity_type,
        entityId: r.entity_id,
        metadata: r.metadata,
        ipAddress: r.ip_address,
        userAgent: r.user_agent,
        createdAt: r.created_at,
        user: r.user_id ? {
          id: r.user_id,
          name: `${r.user_first_name} ${r.user_last_name}`,
          email: r.user_email,
          role: r.user_role,
          avatarUrl: r.user_avatar
        } : null
      })),
      pagination: buildPaginationMeta(total, page, limit)
    });
  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch activity logs' });
  }
};
