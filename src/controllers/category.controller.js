const { query } = require('../config/database');
const { logActivity } = require('../utils/activityLogger');
const { slugify } = require('../utils/helpers');

// ─── Get Categories ───────────────────────────────────────────
exports.getCategories = async (req, res) => {
  try {
    const businessId = req.user.businessId;

    const result = await query(
      `SELECT id, name, slug, image_url, description, product_count, created_at, updated_at
       FROM categories
       WHERE business_id = $1 AND deleted_at IS NULL
       ORDER BY name ASC`,
      [businessId]
    );

    res.status(200).json({
      success: true,
      data: {
        categories: result.rows
      }
    });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch categories' });
  }
};

// ─── Create Category ──────────────────────────────────────────
exports.createCategory = async (req, res) => {
  try {
    const { name, image_url, description } = req.body;
    const businessId = req.user.businessId;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Category name is required' });
    }

    const slug = slugify(name.trim());

    // Check slug uniqueness for this business
    const existing = await query(
      'SELECT id FROM categories WHERE business_id = $1 AND slug = $2 AND deleted_at IS NULL',
      [businessId, slug]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'A category with this name already exists' });
    }

    const result = await query(
      `INSERT INTO categories (business_id, name, slug, image_url, description, product_count)
       VALUES ($1, $2, $3, $4, $5, 0)
       RETURNING id, name, slug, image_url, description, product_count, created_at`,
      [businessId, name.trim(), slug, image_url || null, description || null]
    );

    await logActivity(
      businessId, req.user.id,
      'CREATE_CATEGORY',
      `Created category: ${name}`,
      'category', result.rows[0].id, null, req
    );

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ success: false, error: 'Failed to create category' });
  }
};

// ─── Update Category ──────────────────────────────────────────
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, image_url, description } = req.body;
    const businessId = req.user.businessId;

    const existing = await query(
      'SELECT id FROM categories WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
      [id, businessId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    let slug = undefined;
    if (name && name.trim()) {
      slug = slugify(name.trim());

      // Check slug uniqueness (excluding current category)
      const slugCheck = await query(
        'SELECT id FROM categories WHERE business_id = $1 AND slug = $2 AND deleted_at IS NULL AND id != $3',
        [businessId, slug, id]
      );

      if (slugCheck.rows.length > 0) {
        return res.status(409).json({ success: false, error: 'A category with this name already exists' });
      }
    }

    const result = await query(
      `UPDATE categories
       SET name        = COALESCE($1, name),
           slug        = COALESCE($2, slug),
           image_url   = COALESCE($3, image_url),
           description = COALESCE($4, description),
           updated_at  = NOW()
       WHERE id = $5 AND business_id = $6 AND deleted_at IS NULL
       RETURNING id, name, slug, image_url, description, product_count, updated_at`,
      [
        name ? name.trim() : null,
        slug || null,
        image_url !== undefined ? (image_url || null) : null,
        description !== undefined ? (description || null) : null,
        id, businessId
      ]
    );

    await logActivity(
      businessId, req.user.id,
      'UPDATE_CATEGORY',
      `Updated category: ${result.rows[0].name}`,
      'category', id, null, req
    );

    res.status(200).json({
      success: true,
      message: 'Category updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ success: false, error: 'Failed to update category' });
  }
};

// ─── Delete Category ──────────────────────────────────────────
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.user.businessId;

    const existing = await query(
      'SELECT id, name FROM categories WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
      [id, businessId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    // Check no active products in this category
    const activeProducts = await query(
      `SELECT COUNT(*) as count
       FROM products
       WHERE category_id = $1 AND business_id = $2 AND deleted_at IS NULL`,
      [id, businessId]
    );

    if (parseInt(activeProducts.rows[0].count) > 0) {
      return res.status(409).json({
        success: false,
        error: 'Cannot delete category with active products. Remove or reassign products first.'
      });
    }

    await query(
      'UPDATE categories SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND business_id = $2',
      [id, businessId]
    );

    await logActivity(
      businessId, req.user.id,
      'DELETE_CATEGORY',
      `Deleted category: ${existing.rows[0].name}`,
      'category', id, null, req
    );

    res.status(200).json({
      success: true,
      message: 'Category deleted successfully'
    });

  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete category' });
  }
};
