const { query } = require('../config/database');
const { percentageChange } = require('../utils/helpers');

// ─── Dashboard Stats ──────────────────────────────────────────
exports.getDashboardStats = async (req, res) => {
  try {
    const businessId = req.user.businessId;

    // Current month vs previous month revenue
    const revenueResult = await query(
      `WITH current_month AS (
         SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orders
         FROM orders
         WHERE business_id = $1
           AND deleted_at IS NULL
           AND status != 'cancelled'
           AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
       ),
       prev_month AS (
         SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orders
         FROM orders
         WHERE business_id = $1
           AND deleted_at IS NULL
           AND status != 'cancelled'
           AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')
       )
       SELECT
         cm.revenue AS current_revenue,
         pm.revenue AS prev_revenue,
         cm.orders AS current_orders,
         pm.orders AS prev_orders
       FROM current_month cm, prev_month pm`,
      [businessId]
    );

    // Conversations this month vs prev
    const convoResult = await query(
      `WITH current_month AS (
         SELECT COUNT(*) AS cnt
         FROM conversations
         WHERE business_id = $1
           AND deleted_at IS NULL
           AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
       ),
       prev_month AS (
         SELECT COUNT(*) AS cnt
         FROM conversations
         WHERE business_id = $1
           AND deleted_at IS NULL
           AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')
       )
       SELECT cm.cnt AS current_cnt, pm.cnt AS prev_cnt
       FROM current_month cm, prev_month pm`,
      [businessId]
    );

    // Leads this month vs prev
    const leadsResult = await query(
      `WITH current_month AS (
         SELECT COUNT(*) AS cnt
         FROM leads
         WHERE business_id = $1
           AND deleted_at IS NULL
           AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
       ),
       prev_month AS (
         SELECT COUNT(*) AS cnt
         FROM leads
         WHERE business_id = $1
           AND deleted_at IS NULL
           AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')
       )
       SELECT cm.cnt AS current_cnt, pm.cnt AS prev_cnt
       FROM current_month cm, prev_month pm`,
      [businessId]
    );

    // AI response rate
    const aiResult = await query(
      `WITH total_msgs AS (
         SELECT COUNT(*) AS total
         FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE c.business_id = $1
           AND m.created_at >= NOW() - INTERVAL '30 days'
       ),
       ai_msgs AS (
         SELECT COUNT(*) AS cnt
         FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE c.business_id = $1
           AND m.sender = 'ai'
           AND m.created_at >= NOW() - INTERVAL '30 days'
       )
       SELECT
         CASE WHEN tm.total > 0 THEN ROUND((am.cnt::numeric / tm.total) * 100, 1) ELSE 0 END AS ai_rate
       FROM total_msgs tm, ai_msgs am`,
      [businessId]
    );

    const prevAiResult = await query(
      `WITH total_msgs AS (
         SELECT COUNT(*) AS total
         FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE c.business_id = $1
           AND m.created_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days'
       ),
       ai_msgs AS (
         SELECT COUNT(*) AS cnt
         FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE c.business_id = $1
           AND m.sender = 'ai'
           AND m.created_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days'
       )
       SELECT
         CASE WHEN tm.total > 0 THEN ROUND((am.cnt::numeric / tm.total) * 100, 1) ELSE 0 END AS ai_rate
       FROM total_msgs tm, ai_msgs am`,
      [businessId]
    );

    // Recent conversations
    const recentConvos = await query(
      `SELECT
         c.id, c.platform, c.status, c.last_message, c.last_message_at,
         c.unread_count, c.is_ai_enabled,
         ct.name AS contact_name, ct.avatar_url AS contact_avatar
       FROM conversations c
       LEFT JOIN contacts ct ON c.contact_id = ct.id AND ct.deleted_at IS NULL
       WHERE c.business_id = $1 AND c.deleted_at IS NULL
       ORDER BY c.last_message_at DESC NULLS LAST
       LIMIT 5`,
      [businessId]
    );

    // Top products
    const topProducts = await query(
      `SELECT id, name, price, sales_count, view_count
       FROM products
       WHERE business_id = $1 AND deleted_at IS NULL AND is_active = true
       ORDER BY sales_count DESC
       LIMIT 5`,
      [businessId]
    );

    // Recent orders
    const recentOrders = await query(
      `SELECT
         o.id, o.order_number, o.platform, o.total, o.status,
         o.payment_status, o.created_at,
         ct.name AS customer_name
       FROM orders o
       LEFT JOIN contacts ct ON o.contact_id = ct.id AND ct.deleted_at IS NULL
       WHERE o.business_id = $1 AND o.deleted_at IS NULL
       ORDER BY o.created_at DESC
       LIMIT 5`,
      [businessId]
    );

    const rv = revenueResult.rows[0];
    const cv = convoResult.rows[0];
    const lv = leadsResult.rows[0];
    const currentAi = parseFloat(aiResult.rows[0]?.ai_rate || 0);
    const prevAi = parseFloat(prevAiResult.rows[0]?.ai_rate || 0);

    res.status(200).json({
      success: true,
      data: {
        revenue: {
          value: parseFloat(rv.current_revenue),
          change: percentageChange(parseFloat(rv.current_revenue), parseFloat(rv.prev_revenue)),
          period: 'vs last month'
        },
        conversations: {
          value: parseInt(cv.current_cnt),
          change: percentageChange(parseInt(cv.current_cnt), parseInt(cv.prev_cnt)),
          period: 'vs last month'
        },
        leads: {
          value: parseInt(lv.current_cnt),
          change: percentageChange(parseInt(lv.current_cnt), parseInt(lv.prev_cnt)),
          period: 'vs last month'
        },
        orders: {
          value: parseInt(rv.current_orders),
          change: percentageChange(parseInt(rv.current_orders), parseInt(rv.prev_orders)),
          period: 'vs last month'
        },
        aiResponseRate: {
          value: currentAi,
          change: percentageChange(currentAi, prevAi),
          period: 'vs last month'
        },
        recentConversations: recentConvos.rows.map(r => ({
          id: r.id,
          platform: r.platform,
          status: r.status,
          lastMessage: r.last_message,
          lastMessageAt: r.last_message_at,
          unreadCount: r.unread_count,
          isAiEnabled: r.is_ai_enabled,
          contactName: r.contact_name,
          contactAvatar: r.contact_avatar
        })),
        topProducts: topProducts.rows.map(r => ({
          id: r.id,
          name: r.name,
          price: parseFloat(r.price),
          salesCount: r.sales_count,
          viewCount: r.view_count,
          revenue: parseFloat(r.price) * r.sales_count
        })),
        recentOrders: recentOrders.rows.map(r => ({
          id: r.id,
          orderNumber: r.order_number,
          platform: r.platform,
          total: parseFloat(r.total),
          status: r.status,
          paymentStatus: r.payment_status,
          customerName: r.customer_name,
          createdAt: r.created_at
        }))
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats' });
  }
};

// ─── Revenue Analytics ─────────────────────────────────────────
exports.getRevenue = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 30));

    const revenueByDay = await query(
      `SELECT
         DATE(created_at) AS date,
         COALESCE(SUM(total), 0) AS revenue,
         COUNT(*) AS orders
       FROM orders
       WHERE business_id = $1
         AND deleted_at IS NULL
         AND status != 'cancelled'
         AND created_at >= NOW() - INTERVAL '1 day' * $2
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [businessId, days]
    );

    const revenueByPlatform = await query(
      `SELECT
         platform,
         COALESCE(SUM(total), 0) AS revenue,
         COUNT(*) AS orders
       FROM orders
       WHERE business_id = $1
         AND deleted_at IS NULL
         AND status != 'cancelled'
         AND created_at >= NOW() - INTERVAL '1 day' * $2
       GROUP BY platform`,
      [businessId, days]
    );

    const totalsResult = await query(
      `SELECT
         COALESCE(SUM(total), 0) AS total_revenue,
         COUNT(*) AS total_orders,
         CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(total) / COUNT(*), 2) ELSE 0 END AS avg_order_value
       FROM orders
       WHERE business_id = $1
         AND deleted_at IS NULL
         AND status != 'cancelled'
         AND created_at >= NOW() - INTERVAL '1 day' * $2`,
      [businessId, days]
    );

    const totalRevenue = parseFloat(totalsResult.rows[0].total_revenue);
    const platformRows = revenueByPlatform.rows.map(r => ({
      platform: r.platform,
      revenue: parseFloat(r.revenue),
      orders: parseInt(r.orders),
      percentage: totalRevenue > 0
        ? Math.round((parseFloat(r.revenue) / totalRevenue) * 100)
        : 0
    }));

    res.status(200).json({
      success: true,
      data: {
        revenueByDay: revenueByDay.rows.map(r => ({
          date: r.date,
          revenue: parseFloat(r.revenue),
          orders: parseInt(r.orders)
        })),
        revenueByPlatform: platformRows,
        totalRevenue,
        totalOrders: parseInt(totalsResult.rows[0].total_orders),
        avgOrderValue: parseFloat(totalsResult.rows[0].avg_order_value),
        period: `Last ${days} days`
      }
    });
  } catch (error) {
    console.error('Revenue analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch revenue analytics' });
  }
};

// ─── Conversation Analytics ────────────────────────────────────
exports.getConversationAnalytics = async (req, res) => {
  try {
    const businessId = req.user.businessId;

    const byDay = await query(
      `SELECT
         DATE(c.created_at) AS date,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE c.is_ai_enabled = true) AS ai,
         COUNT(*) FILTER (WHERE c.is_ai_enabled = false) AS human
       FROM conversations c
       WHERE c.business_id = $1
         AND c.deleted_at IS NULL
         AND c.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(c.created_at)
       ORDER BY date ASC`,
      [businessId]
    );

    const platformBreakdown = await query(
      `SELECT
         c.platform,
         COUNT(DISTINCT c.id) AS conversations,
         COUNT(DISTINCT l.id) AS leads,
         COUNT(DISTINCT o.id) AS orders
       FROM conversations c
       LEFT JOIN leads l ON l.business_id = c.business_id AND l.platform = c.platform AND l.deleted_at IS NULL
       LEFT JOIN orders o ON o.business_id = c.business_id AND o.platform = c.platform AND o.deleted_at IS NULL
       WHERE c.business_id = $1 AND c.deleted_at IS NULL
       GROUP BY c.platform`,
      [businessId]
    );

    const aiRateResult = await query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE is_ai_enabled = true) AS ai_handled
       FROM conversations
       WHERE business_id = $1 AND deleted_at IS NULL`,
      [businessId]
    );

    const { total, ai_handled } = aiRateResult.rows[0];
    const aiHandlingRate = total > 0 ? Math.round((ai_handled / total) * 100) : 0;

    res.status(200).json({
      success: true,
      data: {
        conversationsByDay: byDay.rows.map(r => ({
          date: r.date,
          total: parseInt(r.total),
          ai: parseInt(r.ai),
          human: parseInt(r.human)
        })),
        platformBreakdown: platformBreakdown.rows.map(r => ({
          platform: r.platform,
          conversations: parseInt(r.conversations),
          leads: parseInt(r.leads),
          orders: parseInt(r.orders)
        })),
        aiHandlingRate,
        avgResponseTime: '< 5 seconds'
      }
    });
  } catch (error) {
    console.error('Conversation analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch conversation analytics' });
  }
};

// ─── Product Analytics ─────────────────────────────────────────
exports.getProductAnalytics = async (req, res) => {
  try {
    const businessId = req.user.businessId;

    const topProducts = await query(
      `SELECT
         p.id, p.name, p.price, p.sales_count, p.view_count, p.is_active,
         c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id AND c.deleted_at IS NULL
       WHERE p.business_id = $1 AND p.deleted_at IS NULL
       ORDER BY p.sales_count DESC
       LIMIT 10`,
      [businessId]
    );

    const lowStockResult = await query(
      `SELECT id, name, price, stock
       FROM products
       WHERE business_id = $1
         AND deleted_at IS NULL
         AND is_active = true
         AND stock IS NOT NULL
         AND stock < 5
       ORDER BY stock ASC`,
      [businessId]
    );

    const totalsResult = await query(
      `SELECT
         COUNT(*) AS total_products,
         COUNT(*) FILTER (WHERE is_active = true) AS active_products
       FROM products
       WHERE business_id = $1 AND deleted_at IS NULL`,
      [businessId]
    );

    res.status(200).json({
      success: true,
      data: {
        topProducts: topProducts.rows.map(r => ({
          id: r.id,
          name: r.name,
          price: parseFloat(r.price),
          salesCount: r.sales_count,
          viewCount: r.view_count,
          isActive: r.is_active,
          categoryName: r.category_name,
          revenue: parseFloat(r.price) * r.sales_count
        })),
        lowStock: lowStockResult.rows.map(r => ({
          id: r.id,
          name: r.name,
          price: parseFloat(r.price),
          stockQuantity: r.stock
        })),
        totalProducts: parseInt(totalsResult.rows[0].total_products),
        activeProducts: parseInt(totalsResult.rows[0].active_products)
      }
    });
  } catch (error) {
    console.error('Product analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch product analytics' });
  }
};
