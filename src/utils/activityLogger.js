const { query } = require('../config/database');

const logActivity = async (
  businessId,
  userId,
  action,
  description,
  entityType = null,
  entityId = null,
  metadata = null,
  req = null
) => {
  try {
    await query(
      `INSERT INTO activity_logs (business_id, user_id, action, description, entity_type, entity_id, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        businessId,
        userId || null,
        action,
        description,
        entityType,
        entityId,
        metadata ? JSON.stringify(metadata) : null,
        req?.clientIp || null,
        req?.userAgent || null,
      ]
    );
  } catch (err) {
    console.error('Activity log error (non-critical):', err.message);
  }
};

module.exports = { logActivity };
