const bcryptjs = require('bcryptjs');
const { query, transaction } = require('../config/database');
const { logActivity } = require('../utils/activityLogger');
const { sendTeamInviteEmail } = require('../utils/email');

// ─── Generate Temp Password ────────────────────────────────────
const generateTempPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// ─── Get Team ─────────────────────────────────────────────────
exports.getTeam = async (req, res) => {
  try {
    const businessId = req.user.businessId;

    const result = await query(
      `SELECT
         u.id, u.first_name, u.last_name, u.email, u.role,
         u.avatar_url, u.is_active, u.last_login, u.created_at,
         COUNT(DISTINCT c.id) AS assigned_conversations,
         COUNT(DISTINCT al.id) FILTER (
           WHERE al.action = 'RESOLVE_CONVERSATION'
             AND DATE(al.created_at) = CURRENT_DATE
         ) AS resolved_today
       FROM users u
       LEFT JOIN conversations c ON c.assigned_to = u.id
         AND c.business_id = $1
         AND c.deleted_at IS NULL
         AND c.status != 'closed'
       LEFT JOIN activity_logs al ON al.user_id = u.id
         AND al.business_id = $1
         AND al.action = 'RESOLVE_CONVERSATION'
         AND DATE(al.created_at) = CURRENT_DATE
       WHERE u.business_id = $1 AND u.deleted_at IS NULL
       GROUP BY u.id
       ORDER BY u.role ASC, u.first_name ASC`,
      [businessId]
    );

    res.status(200).json({
      success: true,
      data: result.rows.map(u => ({
        id: u.id,
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
        role: u.role,
        avatarUrl: u.avatar_url,
        isActive: u.is_active,
        lastLogin: u.last_login,
        createdAt: u.created_at,
        stats: {
          assignedConversations: parseInt(u.assigned_conversations),
          resolvedToday: parseInt(u.resolved_today)
        }
      }))
    });
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch team members' });
  }
};

// ─── Invite Agent ─────────────────────────────────────────────
exports.inviteAgent = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { firstName, lastName, email, role } = req.body;

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ success: false, message: 'First name, last name, and email are required' });
    }

    const allowedRoles = ['agent', 'admin'];
    const agentRole = allowedRoles.includes(role) ? role : 'agent';

    // Check email uniqueness
    const existing = await query(
      `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'A user with this email already exists' });
    }

    // Get business name for invite email
    const bizResult = await query(
      `SELECT name FROM businesses WHERE id = $1`,
      [businessId]
    );
    const businessName = bizResult.rows[0]?.name || 'your business';

    // Generate and hash temp password
    const tempPassword = generateTempPassword();
    const passwordHash = await bcryptjs.hash(tempPassword, parseInt(process.env.BCRYPT_ROUNDS) || 12);

    const result = await query(
      `INSERT INTO users (
         business_id, first_name, last_name, email, password_hash,
         role, is_active, is_email_verified
       ) VALUES ($1, $2, $3, $4, $5, $6, true, true)
       RETURNING id, first_name, last_name, email, role, is_active, created_at`,
      [businessId, firstName, lastName, email, passwordHash, agentRole]
    );

    const newUser = result.rows[0];

    // Send invite email (fire-and-forget)
    sendTeamInviteEmail(email, firstName, businessName, tempPassword).catch(err => {
      console.error('Team invite email failed:', err);
    });

    logActivity(businessId, req.user.id, 'INVITE_AGENT', `Invited agent: ${firstName} ${lastName} (${email})`, 'user', newUser.id, { role: agentRole }, req).catch(() => {});

    res.status(201).json({
      success: true,
      message: `Invitation sent to ${email}. They will receive their login credentials via email.`,
      data: {
        id: newUser.id,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        email: newUser.email,
        role: newUser.role,
        isActive: newUser.is_active,
        createdAt: newUser.created_at
      }
    });
  } catch (error) {
    console.error('Invite agent error:', error);
    res.status(500).json({ success: false, message: 'Failed to invite agent' });
  }
};

// ─── Update Team Member ────────────────────────────────────────
exports.updateTeamMember = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { id } = req.params;
    const { role, isActive } = req.body;

    const existing = await query(
      `SELECT id, role, first_name, last_name FROM users
       WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL`,
      [id, businessId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Team member not found' });
    }

    const member = existing.rows[0];

    // Cannot demote the owner
    if (member.role === 'owner' && role && role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Cannot change the role of the business owner' });
    }

    const allowedRoles = ['agent', 'admin'];
    const newRole = role && allowedRoles.includes(role) ? role : undefined;

    const result = await query(
      `UPDATE users SET
         role = COALESCE($1, role),
         is_active = COALESCE($2, is_active),
         updated_at = NOW()
       WHERE id = $3 AND business_id = $4 AND deleted_at IS NULL
       RETURNING id, first_name, last_name, email, role, is_active, updated_at`,
      [newRole || null, isActive !== undefined ? isActive : null, id, businessId]
    );

    logActivity(businessId, req.user.id, 'UPDATE_TEAM_MEMBER', `Updated team member: ${member.first_name} ${member.last_name}`, 'user', id, { role: newRole, isActive }, req).catch(() => {});

    const u = result.rows[0];
    res.status(200).json({
      success: true,
      message: 'Team member updated successfully',
      data: {
        id: u.id,
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
        role: u.role,
        isActive: u.is_active,
        updatedAt: u.updated_at
      }
    });
  } catch (error) {
    console.error('Update team member error:', error);
    res.status(500).json({ success: false, message: 'Failed to update team member' });
  }
};

// ─── Remove Team Member (Soft Delete) ─────────────────────────
exports.removeTeamMember = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { id } = req.params;

    const existing = await query(
      `SELECT id, role, first_name, last_name FROM users
       WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL`,
      [id, businessId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Team member not found' });
    }

    const member = existing.rows[0];

    // Cannot remove owner
    if (member.role === 'owner') {
      return res.status(403).json({ success: false, message: 'Cannot remove the business owner' });
    }

    // Cannot remove yourself
    if (member.id === req.user.id) {
      return res.status(403).json({ success: false, message: 'Cannot remove yourself from the team' });
    }

    await query(
      `UPDATE users SET deleted_at = NOW(), is_active = false, updated_at = NOW()
       WHERE id = $1 AND business_id = $2`,
      [id, businessId]
    );

    logActivity(businessId, req.user.id, 'REMOVE_TEAM_MEMBER', `Removed team member: ${member.first_name} ${member.last_name}`, 'user', id, null, req).catch(() => {});

    res.status(200).json({ success: true, message: 'Team member removed successfully' });
  } catch (error) {
    console.error('Remove team member error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove team member' });
  }
};
