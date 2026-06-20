const crypto = require('crypto');

// Generate 4-digit PIN
const generatePin = () => crypto.randomInt(1000, 9999).toString();

// Hash PIN with SHA256
const hashPin = (pin) => crypto.createHash('sha256').update(pin).digest('hex');

// Generate order number: ORD-YYYY-NNNN
const generateOrderNumber = async (query, businessId) => {
  const year = new Date().getFullYear();
  const result = await query(
    'SELECT COUNT(*) as count FROM orders WHERE business_id = $1',
    [businessId]
  );
  const count = parseInt(result.rows[0].count) + 1;
  return `ORD-${year}-${String(count).padStart(4, '0')}`;
};

// Slugify for categories
const slugify = (text) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Paginate helper
const paginate = (page = 1, limit = 20) => {
  const p = Math.max(1, parseInt(page));
  const l = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (p - 1) * l;
  return { page: p, limit: l, offset };
};

// Build pagination meta
const buildPaginationMeta = (total, page, limit) => ({
  total,
  page,
  limit,
  pages: Math.ceil(total / limit),
  hasNext: page * limit < total,
  hasPrev: page > 1,
});

// Format currency (Naira)
const formatNaira = (amount) => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2
  }).format(amount);
};

// Sanitize phone number to Nigerian format
const sanitizePhone = (phone) => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  // Convert 0XXXXXXXXXX to +234XXXXXXXXXX
  if (digits.startsWith('0') && digits.length === 11) {
    return `+234${digits.slice(1)}`;
  }
  // Already has country code
  if (digits.startsWith('234') && digits.length === 13) {
    return `+${digits}`;
  }
  // International format already
  if (phone.startsWith('+')) {
    return phone;
  }
  return phone;
};

// Generate a random alphanumeric string
const generateToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

// Calculate percentage change
const percentageChange = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
};

module.exports = {
  generatePin,
  hashPin,
  generateOrderNumber,
  slugify,
  paginate,
  buildPaginationMeta,
  formatNaira,
  sanitizePhone,
  generateToken,
  percentageChange
};
