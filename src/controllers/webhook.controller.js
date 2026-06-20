const { query, transaction } = require('../config/database');
const { generateAIResponse } = require('../services/ai.service');

// ─── Helpers ──────────────────────────────────────────────────

const findOrCreateContact = async (client, businessId, platform, platformUserId, name, username) => {
  const existing = await client.query(
    `SELECT id FROM contacts
     WHERE business_id = $1 AND platform = $2 AND platform_user_id = $3 AND deleted_at IS NULL`,
    [businessId, platform, platformUserId]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const result = await client.query(
    `INSERT INTO contacts (business_id, name, platform, platform_user_id, platform_username)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [businessId, name || username || `${platform} User`, platform, platformUserId, username || null]
  );

  return result.rows[0].id;
};

const findOrCreateConversation = async (client, businessId, contactId, platform, platformConversationId) => {
  const existing = await client.query(
    `SELECT id, is_ai_enabled FROM conversations
     WHERE business_id = $1 AND contact_id = $2 AND platform = $3 AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [businessId, contactId, platform]
  );

  if (existing.rows.length > 0) {
    return { id: existing.rows[0].id, isAiEnabled: existing.rows[0].is_ai_enabled };
  }

  // Check if AI is enabled by default from ai_settings
  const aiSettings = await client.query(
    `SELECT is_active FROM ai_settings WHERE business_id = $1`,
    [businessId]
  );
  const isAiEnabled = aiSettings.rows.length > 0 ? aiSettings.rows[0].is_active : true;

  const result = await client.query(
    `INSERT INTO conversations (
       business_id, contact_id, platform, platform_conversation_id,
       status, is_ai_enabled, unread_count, last_message_at
     ) VALUES ($1, $2, $3, $4, 'open', $5, 0, NOW())
     RETURNING id, is_ai_enabled`,
    [businessId, contactId, platform, platformConversationId || null, isAiEnabled]
  );

  return { id: result.rows[0].id, isAiEnabled: result.rows[0].is_ai_enabled };
};

const insertMessage = async (client, conversationId, businessId, content, platform, senderType) => {
  const result = await client.query(
    `INSERT INTO messages (conversation_id, business_id, content, sender, platform, is_read, timestamp)
     VALUES ($1, $2, $3, $4, $5, false, NOW())
     RETURNING id`,
    [conversationId, businessId, content, senderType, platform]
  );
  return result.rows[0].id;
};

const updateConversationLastMessage = async (client, conversationId, content) => {
  await client.query(
    `UPDATE conversations SET
       last_message = $1,
       last_message_at = NOW(),
       unread_count = unread_count + 1,
       updated_at = NOW()
     WHERE id = $2`,
    [content.substring(0, 255), conversationId]
  );
};

const processAIResponse = async (io, businessId, conversationId, platform, messageText) => {
  try {
    const bizResult = await query(
      `SELECT name FROM businesses WHERE id = $1`,
      [businessId]
    );
    const businessName = bizResult.rows[0]?.name || 'this business';

    // Get recent conversation history (last 10 messages)
    const historyResult = await query(
      `SELECT content, sender FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [conversationId]
    );
    const history = historyResult.rows.reverse();

    const { response, handoff } = await generateAIResponse(businessId, history, messageText, businessName);

    if (handoff) {
      // Update conversation to disable AI and set status for human handoff
      await query(
        `UPDATE conversations SET is_ai_enabled = false, status = 'open', updated_at = NOW() WHERE id = $1`,
        [conversationId]
      );
      if (io) {
        io.to(`business:${businessId}`).emit('conversation:handoff', { conversationId, businessId });
      }
      return;
    }

    // Insert AI response message
    await query(
      `INSERT INTO messages (conversation_id, business_id, content, sender, platform, is_read, timestamp)
       VALUES ($1, $2, $3, 'ai', $4, true, NOW())`,
      [conversationId, businessId, response, platform]
    );

    await query(
      `UPDATE conversations SET
         last_message = $1,
         last_message_at = NOW(),
         updated_at = NOW()
       WHERE id = $2`,
      [response.substring(0, 255), conversationId]
    );

    // Update AI settings message count
    await query(
      `UPDATE ai_settings SET messages_handled = messages_handled + 1 WHERE business_id = $1`,
      [businessId]
    );

    // Emit AI response to socket room
    if (io) {
      io.to(`conversation:${conversationId}`).emit('message:new', {
        conversationId,
        content: response,
        sender: 'ai',
        platform,
        timestamp: new Date()
      });
      io.to(`business:${businessId}`).emit('conversation:updated', { conversationId, businessId });
    }
  } catch (err) {
    console.error('AI response processing error:', err);
  }
};

// ─── Verify Meta Webhook ───────────────────────────────────────
exports.verifyMetaWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log('Meta webhook verified');
    res.status(200).send(challenge);
  } else {
    console.warn('Meta webhook verification failed');
    res.sendStatus(403);
  }
};

// ─── Handle Meta Webhook ───────────────────────────────────────
exports.handleMetaWebhook = (req, res) => {
  // Always acknowledge immediately
  res.sendStatus(200);

  // Parse body (may be Buffer if raw middleware used)
  let body;
  try {
    body = typeof req.body === 'string' || Buffer.isBuffer(req.body)
      ? JSON.parse(req.body.toString())
      : req.body;
  } catch (e) {
    console.error('Webhook body parse error:', e);
    return;
  }

  const io = req.app.get('io');

  // Process asynchronously
  setImmediate(async () => {
    try {
      if (!body || !body.entry) return;

      for (const entry of body.entry) {
        const pageId = entry.id;

        // Find business by page_id
        const connResult = await query(
          `SELECT business_id, platform FROM platform_connections
           WHERE page_id = $1 AND is_active = true AND deleted_at IS NULL
           LIMIT 1`,
          [pageId]
        );

        if (connResult.rows.length === 0) continue;

        const { business_id: businessId, platform } = connResult.rows[0];

        // Handle Facebook Messenger format
        const messaging = entry.messaging || [];
        for (const event of messaging) {
          if (!event.message || event.message.is_echo) continue;

          const senderId = event.sender?.id;
          const messageText = event.message?.text || '';
          if (!senderId || !messageText) continue;

          await transaction(async (client) => {
            const contactId = await findOrCreateContact(
              client, businessId, 'facebook', senderId, null, null
            );
            const { id: conversationId, isAiEnabled } = await findOrCreateConversation(
              client, businessId, contactId, 'facebook', event.sender?.id
            );
            await insertMessage(client, conversationId, businessId, messageText, 'facebook', 'customer');
            await updateConversationLastMessage(client, conversationId, messageText);

            if (io) {
              io.to(`conversation:${conversationId}`).emit('message:new', {
                conversationId, content: messageText, sender: 'customer', platform: 'facebook', timestamp: new Date()
              });
              io.to(`business:${businessId}`).emit('conversation:updated', { conversationId, businessId });
            }

            if (isAiEnabled) {
              processAIResponse(io, businessId, conversationId, 'facebook', messageText).catch(console.error);
            }
          });
        }

        // Handle Instagram format
        const changes = entry.changes || [];
        for (const change of changes) {
          if (change.field !== 'messages') continue;

          const value = change.value;
          const messages = value?.messages || [];

          for (const msg of messages) {
            if (msg.from === pageId) continue; // Skip own messages

            const senderId = msg.from;
            const messageText = msg.text?.body || msg.text || '';
            if (!senderId || !messageText) continue;

            await transaction(async (client) => {
              const contactId = await findOrCreateContact(
                client, businessId, 'instagram', senderId, null, null
              );
              const { id: conversationId, isAiEnabled } = await findOrCreateConversation(
                client, businessId, contactId, 'instagram', senderId
              );
              await insertMessage(client, conversationId, businessId, messageText, 'instagram', 'customer');
              await updateConversationLastMessage(client, conversationId, messageText);

              if (io) {
                io.to(`conversation:${conversationId}`).emit('message:new', {
                  conversationId, content: messageText, sender: 'customer', platform: 'instagram', timestamp: new Date()
                });
                io.to(`business:${businessId}`).emit('conversation:updated', { conversationId, businessId });
              }

              if (isAiEnabled) {
                processAIResponse(io, businessId, conversationId, 'instagram', messageText).catch(console.error);
              }
            });
          }
        }
      }
    } catch (err) {
      console.error('Meta webhook processing error:', err);
    }
  });
};

// ─── Verify WhatsApp Webhook ───────────────────────────────────
exports.verifyWhatsAppWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === (process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN)) {
    console.log('WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    console.warn('WhatsApp webhook verification failed');
    res.sendStatus(403);
  }
};

// ─── Handle WhatsApp Webhook ───────────────────────────────────
exports.handleWhatsAppWebhook = (req, res) => {
  // Always acknowledge immediately
  res.sendStatus(200);

  let body;
  try {
    body = typeof req.body === 'string' || Buffer.isBuffer(req.body)
      ? JSON.parse(req.body.toString())
      : req.body;
  } catch (e) {
    console.error('WhatsApp webhook body parse error:', e);
    return;
  }

  const io = req.app.get('io');

  setImmediate(async () => {
    try {
      if (!body || !body.entry) return;

      for (const entry of body.entry) {
        const changes = entry.changes || [];

        for (const change of changes) {
          const value = change.value;
          const messages = value?.messages || [];
          const phoneNumberId = value?.metadata?.phone_number_id;

          if (!phoneNumberId || messages.length === 0) continue;

          // Find business by phone_number_id
          const connResult = await query(
            `SELECT business_id FROM platform_connections
             WHERE phone_number_id = $1 AND platform = 'whatsapp' AND is_active = true AND deleted_at IS NULL
             LIMIT 1`,
            [phoneNumberId]
          );

          if (connResult.rows.length === 0) continue;

          const businessId = connResult.rows[0].business_id;

          for (const msg of messages) {
            // Only handle text messages for now
            if (msg.type !== 'text') continue;

            const fromPhone = msg.from;
            const messageText = msg.text?.body || '';
            if (!fromPhone || !messageText) continue;

            const contactName = value?.contacts?.[0]?.profile?.name || fromPhone;

            await transaction(async (client) => {
              const contactId = await findOrCreateContact(
                client, businessId, 'whatsapp', fromPhone, contactName, fromPhone
              );
              const { id: conversationId, isAiEnabled } = await findOrCreateConversation(
                client, businessId, contactId, 'whatsapp', fromPhone
              );
              await insertMessage(client, conversationId, businessId, messageText, 'whatsapp', 'customer');
              await updateConversationLastMessage(client, conversationId, messageText);

              if (io) {
                io.to(`conversation:${conversationId}`).emit('message:new', {
                  conversationId, content: messageText, sender: 'customer', platform: 'whatsapp', timestamp: new Date()
                });
                io.to(`business:${businessId}`).emit('conversation:updated', { conversationId, businessId });
              }

              if (isAiEnabled) {
                processAIResponse(io, businessId, conversationId, 'whatsapp', messageText).catch(console.error);
              }
            });
          }
        }
      }
    } catch (err) {
      console.error('WhatsApp webhook processing error:', err);
    }
  });
};
