const { query, transaction } = require('../config/database');
const { logActivity } = require('../utils/activityLogger');
const { paginate, buildPaginationMeta } = require('../utils/helpers');

const VALID_STAGES = ['New', 'Contacted', 'Qualified', 'Negotiating', 'Won', 'Lost'];
const VALID_SCORES = ['hot', 'warm', 'cold'];

// ─── Get Leads ────────────────────────────────────────────────
exports.getLeads = async (req, res) => {
  try {
    const { stage, score, platform, search, assigned_to } = req.query;
    const { page, limit, offset } = paginate(req.query.page, req.query.limit);
    const businessId = req.user.businessId;

    const conditions = ['l.business_id = $1', 'l.deleted_at IS NULL'];
    const params = [businessId];
    let idx = 2;

    if (stage) {
      conditions.push(`l.stage = $${idx++}`);
      params.push(stage);
    }
    if (score) {
      conditions.push(`l.score = $${idx++}`);
      params.push(score);
    }
    if (platform) {
      conditions.push(`l.platform = $${idx++}`);
      params.push(platform);
    }
    if (assigned_to) {
      conditions.push(`l.assigned_to = $${idx++}`);
      params.push(assigned_to);
    }
    if (search) {
      conditions.push(`(l.name ILIKE $${idx} OR l.email ILIKE $${idx} OR l.phone ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*) as total FROM leads l WHERE ${where}`,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    const result = await query(
      `SELECT
         l.id, l.name, l.email, l.phone, l.platform, l.stage, l.score,
         l.value, l.source, l.notes, l.last_interaction, l.assigned_to,
         l.won_at, l.lost_at, l.lost_reason, l.contact_id, l.conversation_id,
         l.created_at, l.updated_at,
         u.first_name as agent_first_name, u.last_name as agent_last_name,
         ct.name as contact_name, ct.avatar_url as contact_avatar
       FROM leads l
       LEFT JOIN users u ON l.assigned_to = u.id AND u.deleted_at IS NULL
       LEFT JOIN contacts ct ON l.contact_id = ct.id AND ct.deleted_at IS NULL
       WHERE ${where}
       ORDER BY l.last_interaction DESC NULLS LAST, l.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    const leads = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      platform: row.platform,
      stage: row.stage,
      score: row.score,
      value: row.value ? parseFloat(row.value) : null,
      source: row.source,
      notes: row.notes,
      lastInteraction: row.last_interaction,
      wonAt: row.won_at,
      lostAt: row.lost_at,
      lostReason: row.lost_reason,
      contactId: row.contact_id,
      conversationId: row.conversation_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      contact: row.contact_id ? { id: row.contact_id, name: row.contact_name, avatarUrl: row.contact_avatar } : null,
      assignedTo: row.assigned_to
        ? { id: row.assigned_to, name: `${row.agent_first_name || ''} ${row.agent_last_name || ''}`.trim() }
        : null
    }));

    res.status(200).json({
      success: true,
      data: {
        leads,
        pagination: buildPaginationMeta(total, page, limit)
      }
    });

  } catch (error) {
    console.error('Get leads error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch leads' });
  }
};

// ─── Get Single Lead ──────────────────────────────────────────
exports.getLead = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.user.businessId;

    const result = await query(
      `SELECT
         l.id, l.name, l.email, l.phone, l.platform, l.stage, l.score,
         l.value, l.source, l.notes, l.last_interaction, l.assigned_to,
         l.won_at, l.lost_at, l.lost_reason, l.contact_id, l.conversation_id,
         l.created_at, l.updated_at,
         u.first_name as agent_first_name, u.last_name as agent_last_name,
         ct.name as contact_name, ct.email as contact_email,
         ct.phone as contact_phone, ct.avatar_url as contact_avatar,
         ct.platform_username as contact_username
       FROM leads l
       LEFT JOIN users u ON l.assigned_to = u.id AND u.deleted_at IS NULL
       LEFT JOIN contacts ct ON l.contact_id = ct.id AND ct.deleted_at IS NULL
       WHERE l.id = $1 AND l.business_id = $2 AND l.deleted_at IS NULL`,
      [id, businessId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const row = result.rows[0];

    // Conversation history summary (last 5 messages)
    let conversationSummary = null;
    if (row.conversation_id) {
      const convResult = await query(
        `SELECT c.id, c.platform, c.status, c.last_message, c.last_message_at,
                COUNT(m.id) as message_count
         FROM conversations c
         LEFT JOIN messages m ON m.conversation_id = c.id
         WHERE c.id = $1 AND c.business_id = $2 AND c.deleted_at IS NULL
         GROUP BY c.id`,
        [row.conversation_id, businessId]
      );

      if (convResult.rows.length > 0) {
        conversationSummary = convResult.rows[0];
      }
    }

    const lead = {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      platform: row.platform,
      stage: row.stage,
      score: row.score,
      value: row.value ? parseFloat(row.value) : null,
      source: row.source,
      notes: row.notes,
      lastInteraction: row.last_interaction,
      wonAt: row.won_at,
      lostAt: row.lost_at,
      lostReason: row.lost_reason,
      contactId: row.contact_id,
      conversationId: row.conversation_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      contact: row.contact_id
        ? {
            id: row.contact_id,
            name: row.contact_name,
            email: row.contact_email,
            phone: row.contact_phone,
            avatarUrl: row.contact_avatar,
            username: row.contact_username
          }
        : null,
      assignedTo: row.assigned_to
        ? { id: row.assigned_to, name: `${row.agent_first_name || ''} ${row.agent_last_name || ''}`.trim() }
        : null,
      conversationSummary
    };

    res.status(200).json({ success: true, data: lead });

  } catch (error) {
    console.error('Get lead error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lead' });
  }
};

// ─── Create Lead ──────────────────────────────────────────────
exports.createLead = async (req, res) => {
  try {
    const {
      name, email, phone, platform, stage = 'New', score,
      value, source, notes, contact_id, conversation_id, assigned_to
    } = req.body;
    const businessId = req.user.businessId;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Lead name is required' });
    }

    if (stage && !VALID_STAGES.includes(stage)) {
      return res.status(400).json({ success: false, error: `Stage must be one of: ${VALID_STAGES.join(', ')}` });
    }

    if (score && !VALID_SCORES.includes(score)) {
      return res.status(400).json({ success: false, error: `Score must be one of: ${VALID_SCORES.join(', ')}` });
    }

    // Validate contact belongs to business if provided
    if (contact_id) {
      const ctCheck = await query(
        'SELECT id FROM contacts WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
        [contact_id, businessId]
      );
      if (ctCheck.rows.length === 0) {
        return res.status(400).json({ success: false, error: 'Contact not found' });
      }
    }

    // Validate conversation belongs to business if provided
    if (conversation_id) {
      const convCheck = await query(
        'SELECT id FROM conversations WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
        [conversation_id, businessId]
      );
      if (convCheck.rows.length === 0) {
        return res.status(400).json({ success: false, error: 'Conversation not found' });
      }
    }

    const result = await query(
      `INSERT INTO leads
         (business_id, name, email, phone, platform, stage, score, value,
          source, notes, contact_id, conversation_id, assigned_to, last_interaction)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
       RETURNING id, name, email, phone, platform, stage, score, value,
                 source, notes, contact_id, conversation_id, assigned_to,
                 last_interaction, created_at`,
      [
        businessId,
        name.trim(),
        email || null,
        phone || null,
        platform || null,
        stage,
        score || null,
        value ? parseFloat(value) : null,
        source || null,
        notes || null,
        contact_id || null,
        conversation_id || null,
        assigned_to || null
      ]
    );

    await logActivity(
      businessId, req.user.id,
      'CREATE_LEAD',
      `Created lead: ${name}`,
      'lead', result.rows[0].id, { stage, score }, req
    );

    res.status(201).json({
      success: true,
      message: 'Lead created successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Create lead error:', error);
    res.status(500).json({ success: false, error: 'Failed to create lead' });
  }
};

// ─── Update Lead ──────────────────────────────────────────────
exports.updateLead = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, email, phone, platform, score,
      value, source, notes, assigned_to
    } = req.body;
    const businessId = req.user.businessId;

    const existing = await query(
      'SELECT id FROM leads WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
      [id, businessId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (score && !VALID_SCORES.includes(score)) {
      return res.status(400).json({ success: false, error: `Score must be one of: ${VALID_SCORES.join(', ')}` });
    }

    const result = await query(
      `UPDATE leads
       SET name             = COALESCE($1, name),
           email            = COALESCE($2, email),
           phone            = COALESCE($3, phone),
           platform         = COALESCE($4, platform),
           score            = COALESCE($5, score),
           value            = COALESCE($6, value),
           source           = COALESCE($7, source),
           notes            = COALESCE($8, notes),
           assigned_to      = COALESCE($9, assigned_to),
           last_interaction = NOW(),
           updated_at       = NOW()
       WHERE id = $10 AND business_id = $11 AND deleted_at IS NULL
       RETURNING id, name, email, phone, platform, stage, score, value,
                 source, notes, assigned_to, last_interaction, updated_at`,
      [
        name ? name.trim() : null,
        email || null,
        phone || null,
        platform || null,
        score || null,
        value ? parseFloat(value) : null,
        source || null,
        notes || null,
        assigned_to || null,
        id, businessId
      ]
    );

    await logActivity(
      businessId, req.user.id,
      'UPDATE_LEAD',
      `Updated lead: ${result.rows[0].name}`,
      'lead', id, null, req
    );

    res.status(200).json({
      success: true,
      message: 'Lead updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Update lead error:', error);
    res.status(500).json({ success: false, error: 'Failed to update lead' });
  }
};

// ─── Update Stage ─────────────────────────────────────────────
exports.updateStage = async (req, res) => {
  try {
    const { id } = req.params;
    const { stage, lost_reason } = req.body;
    const businessId = req.user.businessId;

    if (!stage) {
      return res.status(400).json({ success: false, error: 'Stage is required' });
    }

    if (!VALID_STAGES.includes(stage)) {
      return res.status(400).json({ success: false, error: `Stage must be one of: ${VALID_STAGES.join(', ')}` });
    }

    const existing = await query(
      'SELECT id, stage, name FROM leads WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
      [id, businessId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    // Determine timestamps for won/lost transitions
    let wonAt = null;
    let lostAt = null;
    const now = new Date();

    if (stage === 'Won') wonAt = now;
    if (stage === 'Lost') lostAt = now;

    const result = await query(
      `UPDATE leads
       SET stage            = $1,
           won_at           = CASE WHEN $2::boolean THEN NOW() ELSE won_at END,
           lost_at          = CASE WHEN $3::boolean THEN NOW() ELSE lost_at END,
           lost_reason      = COALESCE($4, lost_reason),
           last_interaction = NOW(),
           updated_at       = NOW()
       WHERE id = $5 AND business_id = $6 AND deleted_at IS NULL
       RETURNING id, name, stage, score, won_at, lost_at, lost_reason, updated_at`,
      [
        stage,
        stage === 'Won',
        stage === 'Lost',
        lost_reason || null,
        id, businessId
      ]
    );

    await logActivity(
      businessId, req.user.id,
      'UPDATE_LEAD_STAGE',
      `Moved lead "${existing.rows[0].name}" to stage: ${stage}`,
      'lead', id, { fromStage: existing.rows[0].stage, toStage: stage }, req
    );

    res.status(200).json({
      success: true,
      message: `Lead moved to ${stage}`,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Update lead stage error:', error);
    res.status(500).json({ success: false, error: 'Failed to update lead stage' });
  }
};

// ─── Update Score ─────────────────────────────────────────────
exports.updateScore = async (req, res) => {
  try {
    const { id } = req.params;
    const { score } = req.body;
    const businessId = req.user.businessId;

    if (!score) {
      return res.status(400).json({ success: false, error: 'Score is required' });
    }

    if (!VALID_SCORES.includes(score)) {
      return res.status(400).json({ success: false, error: `Score must be one of: ${VALID_SCORES.join(', ')}` });
    }

    const existing = await query(
      'SELECT id FROM leads WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
      [id, businessId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const result = await query(
      `UPDATE leads SET score = $1, updated_at = NOW()
       WHERE id = $2 AND business_id = $3
       RETURNING id, name, score, updated_at`,
      [score, id, businessId]
    );

    res.status(200).json({
      success: true,
      message: `Lead score updated to ${score}`,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Update lead score error:', error);
    res.status(500).json({ success: false, error: 'Failed to update lead score' });
  }
};

// ─── Delete Lead ──────────────────────────────────────────────
exports.deleteLead = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.user.businessId;

    const existing = await query(
      'SELECT id, name FROM leads WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
      [id, businessId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    await query(
      'UPDATE leads SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND business_id = $2',
      [id, businessId]
    );

    await logActivity(
      businessId, req.user.id,
      'DELETE_LEAD',
      `Deleted lead: ${existing.rows[0].name}`,
      'lead', id, null, req
    );

    res.status(200).json({
      success: true,
      message: 'Lead deleted successfully'
    });

  } catch (error) {
    console.error('Delete lead error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete lead' });
  }
};

// ─── Get Kanban ───────────────────────────────────────────────
exports.getKanban = async (req, res) => {
  try {
    const businessId = req.user.businessId;

    const result = await query(
      `SELECT
         l.id, l.name, l.email, l.phone, l.platform, l.stage, l.score,
         l.value, l.source, l.last_interaction, l.assigned_to,
         l.contact_id, l.conversation_id, l.created_at,
         ct.name as contact_name, ct.avatar_url as contact_avatar,
         u.first_name as agent_first_name, u.last_name as agent_last_name
       FROM leads l
       LEFT JOIN contacts ct ON l.contact_id = ct.id AND ct.deleted_at IS NULL
       LEFT JOIN users u ON l.assigned_to = u.id AND u.deleted_at IS NULL
       WHERE l.business_id = $1 AND l.deleted_at IS NULL
       ORDER BY l.last_interaction DESC NULLS LAST, l.created_at DESC`,
      [businessId]
    );

    // Group by stage
    const kanban = {};
    for (const stage of VALID_STAGES) {
      kanban[stage] = [];
    }

    for (const row of result.rows) {
      const stage = row.stage || 'New';
      if (!kanban[stage]) kanban[stage] = [];

      kanban[stage].push({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        platform: row.platform,
        score: row.score,
        value: row.value ? parseFloat(row.value) : null,
        source: row.source,
        lastInteraction: row.last_interaction,
        contactId: row.contact_id,
        conversationId: row.conversation_id,
        createdAt: row.created_at,
        contact: row.contact_id
          ? { id: row.contact_id, name: row.contact_name, avatarUrl: row.contact_avatar }
          : null,
        assignedTo: row.assigned_to
          ? { id: row.assigned_to, name: `${row.agent_first_name || ''} ${row.agent_last_name || ''}`.trim() }
          : null
      });
    }

    // Build summary counts
    const summary = {};
    for (const stage of VALID_STAGES) {
      summary[stage] = {
        count: kanban[stage].length,
        totalValue: kanban[stage].reduce((sum, l) => sum + (l.value || 0), 0)
      };
    }

    res.status(200).json({
      success: true,
      data: {
        kanban,
        summary
      }
    });

  } catch (error) {
    console.error('Get kanban error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch kanban board' });
  }
};
