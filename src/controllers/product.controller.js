const { query, transaction } = require('../config/database');
const { logActivity } = require('../utils/activityLogger');
const { paginate, buildPaginationMeta } = require('../utils/helpers');
const { v4: uuidv4 } = require('uuid');

// ─── Get Products ─────────────────────────────────────────────
exports.getProducts = async (req, res) => {
  try {
    const { category_id, is_active, platform, search } = req.query;
    const { page, limit, offset } = paginate(req.query.page, req.query.limit);
    const businessId = req.user.businessId;

    const conditions = ['p.business_id = $1', 'p.deleted_at IS NULL'];
    const params = [businessId];
    let idx = 2;

    if (category_id) {
      conditions.push(`p.category_id = $${idx++}`);
      params.push(category_id);
    }
    if (is_active !== undefined && is_active !== '') {
      conditions.push(`p.is_active = $${idx++}`);
      params.push(is_active === 'true' || is_active === true);
    }
    if (platform) {
      // Products store platforms as a JSONB array; check if array contains value
      conditions.push(`p.platforms @> $${idx++}::jsonb`);
      params.push(JSON.stringify([platform]));
    }
    if (search) {
      conditions.push(`(p.name ILIKE $${idx} OR p.description ILIKE $${idx} OR p.sku ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM products p
       WHERE ${where}`,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    const result = await query(
      `SELECT
         p.id, p.business_id, p.category_id, p.name, p.description,
         p.price, p.compare_price, p.images, p.stock, p.sku,
         p.variants, p.platforms, p.is_active, p.sales_count, p.view_count,
         p.created_at, p.updated_at,
         cat.name as category_name, cat.slug as category_slug
       FROM products p
       LEFT JOIN categories cat ON p.category_id = cat.id AND cat.deleted_at IS NULL
       WHERE ${where}
       ORDER BY p.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    const products = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      price: parseFloat(row.price),
      comparePrice: row.compare_price ? parseFloat(row.compare_price) : null,
      images: row.images,
      stock: row.stock,
      sku: row.sku,
      variants: row.variants,
      platforms: row.platforms,
      isActive: row.is_active,
      salesCount: row.sales_count,
      viewCount: row.view_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      category: row.category_id
        ? { id: row.category_id, name: row.category_name, slug: row.category_slug }
        : null
    }));

    res.status(200).json({
      success: true,
      data: {
        products,
        pagination: buildPaginationMeta(total, page, limit)
      }
    });

  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch products' });
  }
};

// ─── Get Single Product ───────────────────────────────────────
exports.getProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.user.businessId;

    const result = await query(
      `SELECT
         p.id, p.business_id, p.category_id, p.name, p.description,
         p.price, p.compare_price, p.images, p.stock, p.sku,
         p.variants, p.platforms, p.is_active, p.sales_count, p.view_count,
         p.created_at, p.updated_at,
         cat.name as category_name, cat.slug as category_slug
       FROM products p
       LEFT JOIN categories cat ON p.category_id = cat.id AND cat.deleted_at IS NULL
       WHERE p.id = $1 AND p.business_id = $2 AND p.deleted_at IS NULL`,
      [id, businessId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const row = result.rows[0];

    res.status(200).json({
      success: true,
      data: {
        id: row.id,
        name: row.name,
        description: row.description,
        price: parseFloat(row.price),
        comparePrice: row.compare_price ? parseFloat(row.compare_price) : null,
        images: row.images,
        stock: row.stock,
        sku: row.sku,
        variants: row.variants,
        platforms: row.platforms,
        isActive: row.is_active,
        salesCount: row.sales_count,
        viewCount: row.view_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        category: row.category_id
          ? { id: row.category_id, name: row.category_name, slug: row.category_slug }
          : null
      }
    });

  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch product' });
  }
};

// ─── Create Product ───────────────────────────────────────────
exports.createProduct = async (req, res) => {
  try {
    const {
      name, description, price, compare_price,
      images, stock = 0, sku, variants,
      platforms, category_id, is_active = true
    } = req.body;
    const businessId = req.user.businessId;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Product name is required' });
    }
    if (!price || isNaN(price) || parseFloat(price) < 0) {
      return res.status(400).json({ success: false, error: 'Valid price is required' });
    }

    // Validate category belongs to business if provided
    if (category_id) {
      const catCheck = await query(
        'SELECT id FROM categories WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
        [category_id, businessId]
      );
      if (catCheck.rows.length === 0) {
        return res.status(400).json({ success: false, error: 'Category not found' });
      }
    }

    // Auto-generate SKU if not provided
    const finalSku = sku && sku.trim()
      ? sku.trim().toUpperCase()
      : `SKU-${Date.now().toString(36).toUpperCase()}`;

    const result = await transaction(async (client) => {
      const prodResult = await client.query(
        `INSERT INTO products
           (business_id, category_id, name, description, price, compare_price,
            images, stock, sku, variants, platforms, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id, name, price, compare_price, images, stock, sku,
                   variants, platforms, is_active, category_id, created_at`,
        [
          businessId,
          category_id || null,
          name.trim(),
          description || null,
          parseFloat(price),
          compare_price ? parseFloat(compare_price) : null,
          images ? JSON.stringify(images) : JSON.stringify([]),
          parseInt(stock) || 0,
          finalSku,
          variants ? JSON.stringify(variants) : null,
          platforms ? JSON.stringify(platforms) : JSON.stringify([]),
          is_active !== false
        ]
      );

      const product = prodResult.rows[0];

      // Increment category product_count
      if (category_id) {
        await client.query(
          'UPDATE categories SET product_count = product_count + 1 WHERE id = $1',
          [category_id]
        );
      }

      return product;
    });

    await logActivity(
      businessId, req.user.id,
      'CREATE_PRODUCT',
      `Created product: ${name}`,
      'product', result.id,
      { name, price }, req
    );

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: result
    });

  } catch (error) {
    console.error('Create product error:', error);
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'A product with this SKU already exists' });
    }
    res.status(500).json({ success: false, error: 'Failed to create product' });
  }
};

// ─── Update Product ───────────────────────────────────────────
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, description, price, compare_price,
      images, stock, sku, variants,
      platforms, category_id, is_active
    } = req.body;
    const businessId = req.user.businessId;

    const existing = await query(
      'SELECT id, category_id FROM products WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
      [id, businessId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const oldCategoryId = existing.rows[0].category_id;

    if (category_id && category_id !== oldCategoryId) {
      const catCheck = await query(
        'SELECT id FROM categories WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
        [category_id, businessId]
      );
      if (catCheck.rows.length === 0) {
        return res.status(400).json({ success: false, error: 'Category not found' });
      }
    }

    const result = await transaction(async (client) => {
      const prodResult = await client.query(
        `UPDATE products
         SET name          = COALESCE($1, name),
             description   = COALESCE($2, description),
             price         = COALESCE($3, price),
             compare_price = COALESCE($4, compare_price),
             images        = COALESCE($5, images),
             stock         = COALESCE($6, stock),
             sku           = COALESCE($7, sku),
             variants      = COALESCE($8, variants),
             platforms     = COALESCE($9, platforms),
             category_id   = COALESCE($10, category_id),
             is_active     = COALESCE($11, is_active),
             updated_at    = NOW()
         WHERE id = $12 AND business_id = $13 AND deleted_at IS NULL
         RETURNING id, name, price, compare_price, images, stock, sku,
                   variants, platforms, is_active, category_id, updated_at`,
        [
          name ? name.trim() : null,
          description !== undefined ? description : null,
          price ? parseFloat(price) : null,
          compare_price !== undefined ? (compare_price ? parseFloat(compare_price) : null) : undefined,
          images ? JSON.stringify(images) : null,
          stock !== undefined ? parseInt(stock) : null,
          sku ? sku.trim().toUpperCase() : null,
          variants ? JSON.stringify(variants) : null,
          platforms ? JSON.stringify(platforms) : null,
          category_id || null,
          is_active !== undefined ? is_active : null,
          id, businessId
        ]
      );

      const product = prodResult.rows[0];

      // Update category product_count if category changed
      if (category_id && category_id !== oldCategoryId) {
        if (oldCategoryId) {
          await client.query(
            'UPDATE categories SET product_count = GREATEST(0, product_count - 1) WHERE id = $1',
            [oldCategoryId]
          );
        }
        await client.query(
          'UPDATE categories SET product_count = product_count + 1 WHERE id = $1',
          [category_id]
        );
      }

      return product;
    });

    await logActivity(
      businessId, req.user.id,
      'UPDATE_PRODUCT',
      `Updated product: ${result.name}`,
      'product', id, null, req
    );

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: result
    });

  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ success: false, error: 'Failed to update product' });
  }
};

// ─── Delete Product ───────────────────────────────────────────
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.user.businessId;

    const existing = await query(
      'SELECT id, name, category_id FROM products WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
      [id, businessId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const { category_id, name } = existing.rows[0];

    await transaction(async (client) => {
      await client.query(
        'UPDATE products SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND business_id = $2',
        [id, businessId]
      );

      if (category_id) {
        await client.query(
          'UPDATE categories SET product_count = GREATEST(0, product_count - 1) WHERE id = $1',
          [category_id]
        );
      }
    });

    await logActivity(
      businessId, req.user.id,
      'DELETE_PRODUCT',
      `Deleted product: ${name}`,
      'product', id, null, req
    );

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });

  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete product' });
  }
};

// ─── Get Orders Containing Product ───────────────────────────
exports.getProductOrders = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.user.businessId;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    // Verify product belongs to business
    const prodCheck = await query(
      'SELECT id FROM products WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
      [id, businessId]
    );
    if (prodCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    // items JSONB format: [{product_id, name, price, qty, variant}]
    const result = await query(
      `SELECT o.id, o.order_number, o.customer_name, o.platform,
              o.status, o.total, o.items, o.created_at,
              (
                SELECT SUM((item->>'qty')::int)
                FROM jsonb_array_elements(o.items) AS item
                WHERE item->>'product_id' = $1
              ) AS qty
       FROM orders o
       WHERE o.business_id = $2
         AND o.deleted_at IS NULL
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(o.items) AS item
           WHERE item->>'product_id' = $1
         )
       ORDER BY o.created_at DESC
       LIMIT $3`,
      [id, businessId, limit]
    );

    res.status(200).json({
      success: true,
      data: {
        orders: result.rows.map(r => ({
          id: r.id,
          orderNumber: r.order_number,
          customerName: r.customer_name,
          platform: r.platform,
          status: r.status,
          total: parseFloat(r.total),
          qty: parseInt(r.qty) || 1,
          createdAt: r.created_at,
        }))
      }
    });
  } catch (error) {
    console.error('Get product orders error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch product orders' });
  }
};

// ─── Toggle Active ────────────────────────────────────────────
exports.toggleActive = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.user.businessId;

    const existing = await query(
      'SELECT id, is_active, name FROM products WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
      [id, businessId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const { is_active } = existing.rows[0];

    const result = await query(
      `UPDATE products SET is_active = $1, updated_at = NOW()
       WHERE id = $2 AND business_id = $3
       RETURNING id, is_active, name`,
      [!is_active, id, businessId]
    );

    res.status(200).json({
      success: true,
      message: `Product ${!is_active ? 'activated' : 'deactivated'}`,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Toggle product active error:', error);
    res.status(500).json({ success: false, error: 'Failed to toggle product status' });
  }
};
