const { query, transaction } = require('../config/database');
const { logActivity } = require('../utils/activityLogger');
const { paginate, buildPaginationMeta, generateOrderNumber } = require('../utils/helpers');
const { v4: uuidv4 } = require('uuid');

const VALID_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
const VALID_PAYMENT_STATUSES = ['pending', 'paid', 'partial', 'refunded', 'failed'];

// ─── Get Orders ───────────────────────────────────────────────
exports.getOrders = async (req, res) => {
  try {
    const { status, payment_status, platform, search } = req.query;
    const { page, limit, offset } = paginate(req.query.page, req.query.limit);
    const businessId = req.user.businessId;

    const conditions = ['o.business_id = $1', 'o.deleted_at IS NULL'];
    const params = [businessId];
    let idx = 2;

    if (status) {
      conditions.push(`o.status = $${idx++}`);
      params.push(status);
    }
    if (payment_status) {
      conditions.push(`o.payment_status = $${idx++}`);
      params.push(payment_status);
    }
    if (platform) {
      conditions.push(`o.platform = $${idx++}`);
      params.push(platform);
    }
    if (search) {
      conditions.push(
        `(o.order_number ILIKE $${idx} OR o.customer_name ILIKE $${idx} OR o.customer_phone ILIKE $${idx} OR o.customer_email ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*) as total FROM orders o WHERE ${where}`,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    const result = await query(
      `SELECT
         o.id, o.order_number, o.customer_name, o.customer_phone, o.customer_email,
         o.platform, o.status, o.payment_method, o.payment_status,
         o.subtotal, o.delivery_fee, o.total,
         o.delivery_address, o.notes, o.assigned_to,
         o.contact_id, o.lead_id, o.conversation_id,
         o.created_at, o.updated_at,
         jsonb_array_length(COALESCE(o.items, '[]'::jsonb)) as items_count
       FROM orders o
       WHERE ${where}
       ORDER BY o.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    res.status(200).json({
      success: true,
      data: {
        orders: result.rows.map(row => ({
          ...row,
          subtotal: parseFloat(row.subtotal || 0),
          deliveryFee: parseFloat(row.delivery_fee || 0),
          total: parseFloat(row.total || 0),
          itemsCount: row.items_count
        })),
        pagination: buildPaginationMeta(total, page, limit)
      }
    });

  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
};

// ─── Get Single Order ─────────────────────────────────────────
exports.getOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.user.businessId;

    const result = await query(
      `SELECT
         o.id, o.order_number, o.customer_name, o.customer_phone, o.customer_email,
         o.platform, o.status, o.payment_method, o.payment_status,
         o.subtotal, o.delivery_fee, o.total,
         o.items, o.timeline, o.delivery_address, o.notes,
         o.assigned_to, o.contact_id, o.lead_id, o.conversation_id,
         o.created_at, o.updated_at,
         u.first_name as agent_first_name, u.last_name as agent_last_name
       FROM orders o
       LEFT JOIN users u ON o.assigned_to = u.id AND u.deleted_at IS NULL
       WHERE o.id = $1 AND o.business_id = $2 AND o.deleted_at IS NULL`,
      [id, businessId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const row = result.rows[0];

    res.status(200).json({
      success: true,
      data: {
        id: row.id,
        orderNumber: row.order_number,
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        customerEmail: row.customer_email,
        platform: row.platform,
        status: row.status,
        paymentMethod: row.payment_method,
        paymentStatus: row.payment_status,
        subtotal: parseFloat(row.subtotal || 0),
        deliveryFee: parseFloat(row.delivery_fee || 0),
        total: parseFloat(row.total || 0),
        items: row.items || [],
        timeline: row.timeline || [],
        deliveryAddress: row.delivery_address,
        notes: row.notes,
        contactId: row.contact_id,
        leadId: row.lead_id,
        conversationId: row.conversation_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        assignedTo: row.assigned_to
          ? { id: row.assigned_to, name: `${row.agent_first_name || ''} ${row.agent_last_name || ''}`.trim() }
          : null
      }
    });

  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch order' });
  }
};

// ─── Create Order ─────────────────────────────────────────────
exports.createOrder = async (req, res) => {
  try {
    const {
      customerName, customerPhone, customerEmail,
      platform, items, subtotal, deliveryFee = 0, total,
      paymentMethod = 'transfer', deliveryAddress, notes,
      contactId, leadId, conversationId, assignedTo
    } = req.body;
    const businessId = req.user.businessId;

    const orderNumber = await generateOrderNumber(query, businessId);

    const initialTimeline = [
      {
        id: uuidv4(),
        status: 'Order Created',
        description: 'Order was created',
        timestamp: new Date().toISOString(),
        actor: req.user.email || 'System'
      }
    ];

    const result = await query(
      `INSERT INTO orders
         (business_id, order_number, customer_name, customer_phone, customer_email,
          platform, items, subtotal, delivery_fee, total,
          status, payment_method, payment_status,
          delivery_address, notes, timeline,
          contact_id, lead_id, conversation_id, assigned_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       RETURNING id, order_number, customer_name, customer_phone, status,
                 payment_status, total, created_at`,
      [
        businessId,
        orderNumber,
        customerName.trim(),
        customerPhone.trim(),
        customerEmail || null,
        platform || null,
        JSON.stringify(items),
        subtotal ? parseFloat(subtotal) : parseFloat(total) - parseFloat(deliveryFee),
        parseFloat(deliveryFee),
        parseFloat(total),
        'Pending',
        paymentMethod,
        'pending',
        deliveryAddress.trim(),
        notes || null,
        JSON.stringify(initialTimeline),
        contactId || null,
        leadId || null,
        conversationId || null,
        assignedTo || null
      ]
    );

    await logActivity(
      businessId, req.user.id,
      'CREATE_ORDER',
      `Created order ${orderNumber} for ${customerName}`,
      'order', result.rows[0].id,
      { orderNumber, total }, req
    );

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ success: false, error: 'Failed to create order' });
  }
};

// ─── Update Order Status ──────────────────────────────────────
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, description, actor } = req.body;
    const businessId = req.user.businessId;

    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Status must be one of: ${VALID_STATUSES.join(', ')}`
      });
    }

    const existing = await query(
      'SELECT id, status, timeline, order_number FROM orders WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
      [id, businessId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const currentTimeline = existing.rows[0].timeline || [];

    const newEntry = {
      id: uuidv4(),
      status: status.charAt(0).toUpperCase() + status.slice(1),
      description: description || `Order status changed to ${status}`,
      timestamp: new Date().toISOString(),
      actor: actor || req.user.email || 'System'
    };

    const updatedTimeline = [...currentTimeline, newEntry];

    // Set timestamp fields based on status
    const statusTimestamps = {
      confirmed: ', confirmed_at = NOW()',
      shipped: ', shipped_at = NOW()',
      delivered: ', delivered_at = NOW()',
      cancelled: ', cancelled_at = NOW()'
    };

    const timestampClause = statusTimestamps[status] || '';

    const result = await query(
      `UPDATE orders
       SET status     = $1,
           timeline   = $2::jsonb,
           updated_at = NOW()${timestampClause}
       WHERE id = $3 AND business_id = $4 AND deleted_at IS NULL
       RETURNING id, order_number, status, timeline, updated_at`,
      [status, JSON.stringify(updatedTimeline), id, businessId]
    );

    await logActivity(
      businessId, req.user.id,
      'UPDATE_ORDER_STATUS',
      `Updated order ${existing.rows[0].order_number} status to ${status}`,
      'order', id,
      { fromStatus: existing.rows[0].status, toStatus: status }, req
    );

    res.status(200).json({
      success: true,
      message: `Order status updated to ${status}`,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update order status' });
  }
};

// ─── Update Payment Status ────────────────────────────────────
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus: payment_status } = req.body;
    const businessId = req.user.businessId;

    if (!payment_status) {
      return res.status(400).json({ success: false, error: 'Payment status is required' });
    }

    if (!VALID_PAYMENT_STATUSES.includes(payment_status)) {
      return res.status(400).json({
        success: false,
        error: `Payment status must be one of: ${VALID_PAYMENT_STATUSES.join(', ')}`
      });
    }

    const existing = await query(
      'SELECT id, order_number FROM orders WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
      [id, businessId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const result = await query(
      `UPDATE orders
       SET payment_status = $1, updated_at = NOW()
       WHERE id = $2 AND business_id = $3
       RETURNING id, order_number, payment_status, updated_at`,
      [payment_status, id, businessId]
    );

    await logActivity(
      businessId, req.user.id,
      'UPDATE_ORDER_PAYMENT',
      `Updated payment status for order ${existing.rows[0].order_number} to ${payment_status}`,
      'order', id, { payment_status }, req
    );

    res.status(200).json({
      success: true,
      message: `Payment status updated to ${payment_status}`,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Update payment status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update payment status' });
  }
};

// ─── Add Timeline Entry ───────────────────────────────────────
exports.addTimelineEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, description, actor } = req.body;
    const businessId = req.user.businessId;

    if (!status || !description) {
      return res.status(400).json({ success: false, error: 'Status and description are required' });
    }

    const existing = await query(
      'SELECT id, timeline FROM orders WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
      [id, businessId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const currentTimeline = existing.rows[0].timeline || [];

    const newEntry = {
      id: uuidv4(),
      status,
      description,
      timestamp: new Date().toISOString(),
      actor: actor || req.user.email || 'System'
    };

    const updatedTimeline = [...currentTimeline, newEntry];

    const result = await query(
      `UPDATE orders
       SET timeline = $1::jsonb, updated_at = NOW()
       WHERE id = $2 AND business_id = $3
       RETURNING id, timeline, updated_at`,
      [JSON.stringify(updatedTimeline), id, businessId]
    );

    res.status(200).json({
      success: true,
      message: 'Timeline entry added',
      data: {
        id: result.rows[0].id,
        timeline: result.rows[0].timeline,
        newEntry
      }
    });

  } catch (error) {
    console.error('Add timeline entry error:', error);
    res.status(500).json({ success: false, error: 'Failed to add timeline entry' });
  }
};
