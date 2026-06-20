const { query, transaction } = require('../config/database');
const { logActivity } = require('../utils/activityLogger');
const { paginate, buildPaginationMeta } = require('../utils/helpers');
const { generateAIResponse } = require('../services/ai.service');

// ─── Get AI Settings ──────────────────────────────────────────
exports.getSettings = async (req, res) => {
  try {
    const businessId = req.user.businessId;

    let result = await query(
      `SELECT * FROM ai_settings WHERE business_id = $1`,
      [businessId]
    );

    if (result.rows.length === 0) {
      // Create default settings
      result = await query(
        `INSERT INTO ai_settings (
           business_id, personality, languages, greeting_message, away_message,
           min_price_percentage, max_discount, max_negotiation_rounds,
           handoff_keywords, business_hours, auto_follow_up, follow_up_delay,
           is_active, knowledge_base, qa_pairs, messages_handled, satisfaction_score
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING *`,
        [
          businessId,
          'friendly',
          JSON.stringify(['English']),
          'Hi! Welcome. How can I help you today?',
          'We are currently away. We will respond as soon as possible.',
          80,
          10,
          3,
          JSON.stringify(['speak to human', 'agent', 'representative', 'manager']),
          JSON.stringify({ mon: '08:00-18:00', tue: '08:00-18:00', wed: '08:00-18:00', thu: '08:00-18:00', fri: '08:00-18:00', sat: 'closed', sun: 'closed' }),
          true,
          24,
          true,
          '',
          JSON.stringify([]),
          0,
          0
        ]
      );
    }

    const s = result.rows[0];
    res.status(200).json({
      success: true,
      data: {
        id: s.id,
        businessId: s.business_id,
        personality: s.personality,
        languages: s.languages,
        greetingMessage: s.greeting_message,
        awayMessage: s.away_message,
        minPricePercentage: s.min_price_percentage,
        maxDiscount: s.max_discount,
        maxNegotiationRounds: s.max_negotiation_rounds,
        handoffKeywords: s.handoff_keywords,
        businessHours: s.business_hours,
        autoFollowUp: s.auto_follow_up,
        followUpDelay: s.follow_up_delay,
        isActive: s.is_active,
        knowledgeBase: s.knowledge_base,
        qaPairs: s.qa_pairs,
        messagesHandled: s.messages_handled,
        satisfactionScore: s.satisfaction_score
      }
    });
  } catch (error) {
    console.error('Get AI settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch AI settings' });
  }
};

// ─── Update AI Settings ───────────────────────────────────────
exports.updateSettings = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const {
      personality, languages, greetingMessage, awayMessage,
      minPricePercentage, maxDiscount, maxNegotiationRounds,
      handoffKeywords, businessHours, autoFollowUp, followUpDelay,
      isActive, knowledgeBase
    } = req.body;

    const result = await query(
      `INSERT INTO ai_settings (
         business_id, personality, languages, greeting_message, away_message,
         min_price_percentage, max_discount, max_negotiation_rounds,
         handoff_keywords, business_hours, auto_follow_up, follow_up_delay,
         is_active, knowledge_base, qa_pairs, messages_handled, satisfaction_score
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (business_id) DO UPDATE SET
         personality = COALESCE(EXCLUDED.personality, ai_settings.personality),
         languages = COALESCE(EXCLUDED.languages, ai_settings.languages),
         greeting_message = COALESCE(EXCLUDED.greeting_message, ai_settings.greeting_message),
         away_message = COALESCE(EXCLUDED.away_message, ai_settings.away_message),
         min_price_percentage = COALESCE(EXCLUDED.min_price_percentage, ai_settings.min_price_percentage),
         max_discount = COALESCE(EXCLUDED.max_discount, ai_settings.max_discount),
         max_negotiation_rounds = COALESCE(EXCLUDED.max_negotiation_rounds, ai_settings.max_negotiation_rounds),
         handoff_keywords = COALESCE(EXCLUDED.handoff_keywords, ai_settings.handoff_keywords),
         business_hours = COALESCE(EXCLUDED.business_hours, ai_settings.business_hours),
         auto_follow_up = COALESCE(EXCLUDED.auto_follow_up, ai_settings.auto_follow_up),
         follow_up_delay = COALESCE(EXCLUDED.follow_up_delay, ai_settings.follow_up_delay),
         is_active = COALESCE(EXCLUDED.is_active, ai_settings.is_active),
         knowledge_base = COALESCE(EXCLUDED.knowledge_base, ai_settings.knowledge_base),
         updated_at = NOW()
       RETURNING *`,
      [
        businessId,
        personality || 'friendly',
        languages ? JSON.stringify(languages) : JSON.stringify(['English']),
        greetingMessage || 'Hi! Welcome. How can I help you today?',
        awayMessage || 'We are currently away.',
        minPricePercentage || 80,
        maxDiscount || 10,
        maxNegotiationRounds || 3,
        handoffKeywords ? JSON.stringify(handoffKeywords) : JSON.stringify([]),
        businessHours ? JSON.stringify(businessHours) : JSON.stringify({}),
        autoFollowUp !== undefined ? autoFollowUp : true,
        followUpDelay || 24,
        isActive !== undefined ? isActive : true,
        knowledgeBase || '',
        JSON.stringify([]),
        0,
        0
      ]
    );

    logActivity(businessId, req.user.id, 'UPDATE_AI_SETTINGS', 'Updated AI agent settings', 'ai_settings', null, null, req).catch(() => {});

    const s = result.rows[0];
    res.status(200).json({
      success: true,
      message: 'AI settings updated successfully',
      data: {
        id: s.id,
        personality: s.personality,
        languages: s.languages,
        greetingMessage: s.greeting_message,
        awayMessage: s.away_message,
        minPricePercentage: s.min_price_percentage,
        maxDiscount: s.max_discount,
        maxNegotiationRounds: s.max_negotiation_rounds,
        handoffKeywords: s.handoff_keywords,
        businessHours: s.business_hours,
        autoFollowUp: s.auto_follow_up,
        followUpDelay: s.follow_up_delay,
        isActive: s.is_active,
        knowledgeBase: s.knowledge_base
      }
    });
  } catch (error) {
    console.error('Update AI settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update AI settings' });
  }
};

// ─── Get Templates ─────────────────────────────────────────────
exports.getTemplates = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { category, search } = req.query;
    const { page, limit, offset } = paginate(req.query.page, req.query.limit);

    const conditions = ['business_id = $1', 'deleted_at IS NULL'];
    const params = [businessId];
    let idx = 2;

    if (category) {
      conditions.push(`category = $${idx++}`);
      params.push(category);
    }
    if (search) {
      conditions.push(`(name ILIKE $${idx} OR content ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*) AS total FROM templates WHERE ${where}`,
      params
    );

    const result = await query(
      `SELECT id, name, category, content, language, usage_count, is_active, created_at
       FROM templates
       WHERE ${where}
       ORDER BY usage_count DESC, created_at DESC
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
    console.error('Get templates error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch templates' });
  }
};

// ─── Create Template ───────────────────────────────────────────
exports.createTemplate = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { name, category, content, language } = req.body;

    if (!name || !content) {
      return res.status(400).json({ success: false, message: 'Name and content are required' });
    }

    const result = await query(
      `INSERT INTO templates (business_id, name, category, content, language, usage_count, is_active)
       VALUES ($1, $2, $3, $4, $5, 0, true)
       RETURNING *`,
      [businessId, name, category || 'general', content, language || 'English']
    );

    logActivity(businessId, req.user.id, 'CREATE_TEMPLATE', `Created template: ${name}`, 'template', result.rows[0].id, null, req).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'Template created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ success: false, message: 'Failed to create template' });
  }
};

// ─── Update Template ───────────────────────────────────────────
exports.updateTemplate = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { id } = req.params;
    const { name, category, content, language, isActive } = req.body;

    const existing = await query(
      `SELECT id FROM templates WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL`,
      [id, businessId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    const result = await query(
      `UPDATE templates SET
         name = COALESCE($1, name),
         category = COALESCE($2, category),
         content = COALESCE($3, content),
         language = COALESCE($4, language),
         is_active = COALESCE($5, is_active),
         updated_at = NOW()
       WHERE id = $6 AND business_id = $7 AND deleted_at IS NULL
       RETURNING *`,
      [name || null, category || null, content || null, language || null, isActive !== undefined ? isActive : null, id, businessId]
    );

    logActivity(businessId, req.user.id, 'UPDATE_TEMPLATE', `Updated template: ${result.rows[0].name}`, 'template', id, null, req).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'Template updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ success: false, message: 'Failed to update template' });
  }
};

// ─── Delete Template (Soft) ────────────────────────────────────
exports.deleteTemplate = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { id } = req.params;

    const result = await query(
      `UPDATE templates SET deleted_at = NOW()
       WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL
       RETURNING id, name`,
      [id, businessId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    logActivity(businessId, req.user.id, 'DELETE_TEMPLATE', `Deleted template: ${result.rows[0].name}`, 'template', id, null, req).catch(() => {});

    res.status(200).json({ success: true, message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete template' });
  }
};

// ─── Add Training Data ─────────────────────────────────────────
exports.addTrainingData = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { question, answer } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ success: false, message: 'Question and answer are required' });
    }

    const newPair = JSON.stringify([{ question, answer, addedAt: new Date().toISOString() }]);

    const result = await query(
      `UPDATE ai_settings
       SET qa_pairs = COALESCE(qa_pairs, '[]'::jsonb) || $1::jsonb,
           updated_at = NOW()
       WHERE business_id = $2
       RETURNING qa_pairs`,
      [newPair, businessId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'AI settings not found. Please initialize settings first.' });
    }

    logActivity(businessId, req.user.id, 'ADD_TRAINING_DATA', `Added Q&A training pair: ${question.substring(0, 50)}`, 'ai_settings', null, { question }, req).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'Training data added successfully',
      data: { qaPairs: result.rows[0].qa_pairs }
    });
  } catch (error) {
    console.error('Add training data error:', error);
    res.status(500).json({ success: false, message: 'Failed to add training data' });
  }
};

// ─── Test AI ───────────────────────────────────────────────────
exports.testAI = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { message, platform } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const businessResult = await query(
      `SELECT name FROM businesses WHERE id = $1`,
      [businessId]
    );

    const businessName = businessResult.rows[0]?.name || 'this business';
    const result = await generateAIResponse(businessId, [], message, businessName);

    res.status(200).json({
      success: true,
      data: {
        response: result.response,
        handoff: result.handoff,
        platform: platform || 'test',
        testedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Test AI error:', error);
    res.status(500).json({ success: false, message: 'Failed to test AI' });
  }
};

// ─── Get Performance ───────────────────────────────────────────
exports.getPerformance = async (req, res) => {
  try {
    const businessId = req.user.businessId;

    const settingsResult = await query(
      `SELECT messages_handled, satisfaction_score FROM ai_settings WHERE business_id = $1`,
      [businessId]
    );

    const todayResult = await query(
      `SELECT COUNT(DISTINCT c.id) AS today_conversations
       FROM conversations c
       WHERE c.business_id = $1
         AND c.is_ai_enabled = true
         AND c.deleted_at IS NULL
         AND DATE(c.created_at) = CURRENT_DATE`,
      [businessId]
    );

    const aiMessagesResult = await query(
      `SELECT COUNT(*) AS ai_messages_today
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE c.business_id = $1
         AND m.sender = 'ai'
         AND DATE(m.created_at) = CURRENT_DATE`,
      [businessId]
    );

    const s = settingsResult.rows[0] || { messages_handled: 0, satisfaction_score: 0 };

    res.status(200).json({
      success: true,
      data: {
        messagesHandled: s.messages_handled,
        satisfactionScore: parseFloat(s.satisfaction_score) || 0,
        conversationsHandledToday: parseInt(todayResult.rows[0].today_conversations),
        aiMessagesToday: parseInt(aiMessagesResult.rows[0].ai_messages_today)
      }
    });
  } catch (error) {
    console.error('Get AI performance error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch AI performance data' });
  }
};
