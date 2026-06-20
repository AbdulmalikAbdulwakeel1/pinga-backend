const { Resend } = require('resend');
const { wrapInTemplate } = require('./emailTemplate');

// Initialize Resend with API key
let resend = null;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
} else {
  console.warn('WARNING: RESEND_API_KEY is not set. Email sending will fail.');
}

const FROM_EMAIL = process.env.EMAIL_FROM || `${process.env.APP_NAME || 'Pinga'} <onboarding@resend.dev>`;

const sendEmail = async ({ to, subject, html }) => {
  try {
    if (!resend) {
      throw new Error('Email service not configured. RESEND_API_KEY is missing from environment variables.');
    }
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html
    });
    const messageId = result?.data?.id || result?.id || 'sent';
    console.log(`✅ Email sent [${messageId}] to: ${to}`);
    return { success: true, messageId };
  } catch (error) {
    console.error('Email send error:', error);
    throw error;
  }
};

// ─── PIN Display Helper ───────────────────────────────────────
const getPinBoxHtml = (pin) => `
  <div style="text-align: center; margin: 30px 0;">
    <div style="display: inline-block; background-color: #fff7ed; border: 2px dashed #f97316; border-radius: 12px; padding: 20px 40px;">
      <span style="font-size: 36px; font-weight: 700; letter-spacing: 12px; color: #1f2937; font-family: 'Courier New', monospace;">${pin}</span>
    </div>
  </div>
`;

// ─── Email Verification PIN (Registration) ────────────────────
const sendVerificationPinEmail = async (email, firstName, pin) => {
  const content = `
    <h2 style="color: #1f2937; margin: 0 0 10px; font-size: 22px;">Verify Your Email</h2>

    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      Hi <strong>${firstName}</strong>,
    </p>

    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      Welcome to Pinga! Use the PIN below to verify your email address and activate your account:
    </p>

    ${getPinBoxHtml(pin)}

    <p style="color: #6b7280; font-size: 14px; line-height: 1.6; text-align: center;">
      This PIN expires in <strong>10 minutes</strong>. If you didn't create an account, you can safely ignore this email.
    </p>

    <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 0 6px 6px 0; margin-top: 24px;">
      <p style="color: #92400e; font-size: 13px; margin: 0;">
        <strong>Security Tip:</strong> Never share this PIN with anyone. Pinga staff will never ask for your PIN.
      </p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `${pin} is your Pinga verification code`,
    html: wrapInTemplate(content)
  });
};

// ─── Welcome Email (after email is verified) ──────────────────
const sendWelcomeEmail = async (email, firstName, businessName) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  const content = `
    <h2 style="color: #1f2937; margin: 0 0 10px; font-size: 22px;">Welcome to Pinga!</h2>

    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      Hi <strong>${firstName}</strong>,
    </p>

    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      Your business <strong>${businessName}</strong> is now live on Pinga.
      Your AI sales agent is ready to start engaging customers on Instagram, Facebook, and WhatsApp.
    </p>

    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      Here's what to do next to get started:
    </p>

    <ul style="color: #4b5563; font-size: 15px; line-height: 2; padding-left: 20px;">
      <li>Complete your business profile</li>
      <li>Add your products or services</li>
      <li>Connect your social media accounts</li>
      <li>Train your AI sales agent</li>
      <li>Start converting leads to orders</li>
    </ul>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${frontendUrl}/dashboard"
         style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #fb923c 100%); color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 16px; font-weight: 600;">
        Go to Dashboard
      </a>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `Welcome to Pinga, ${firstName}! Your AI sales agent is ready`,
    html: wrapInTemplate(content)
  });
};

// ─── Password Reset PIN ────────────────────────────────────────
const sendPasswordResetPinEmail = async (email, firstName, pin) => {
  const content = `
    <h2 style="color: #1f2937; margin: 0 0 10px; font-size: 22px;">Password Reset Request</h2>

    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      Hi <strong>${firstName}</strong>,
    </p>

    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      We received a request to reset your Pinga password. Use the PIN below to proceed:
    </p>

    ${getPinBoxHtml(pin)}

    <p style="color: #6b7280; font-size: 14px; line-height: 1.6; text-align: center;">
      This PIN expires in <strong>10 minutes</strong>. If you didn't request this, you can safely ignore this email.
    </p>

    <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 0 6px 6px 0; margin-top: 24px;">
      <p style="color: #92400e; font-size: 13px; margin: 0;">
        <strong>Security Tip:</strong> Never share this PIN with anyone. Pinga staff will never ask for your PIN.
      </p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `${pin} is your Pinga password reset code`,
    html: wrapInTemplate(content)
  });
};

// ─── Order Confirmation Email ──────────────────────────────────
const sendOrderConfirmationEmail = async (email, customerName, order) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  const itemsHtml = order.items && order.items.length > 0
    ? order.items.map(item => `
        <tr>
          <td style="padding: 10px 0; color: #4b5563; font-size: 14px; border-bottom: 1px solid #f3f4f6;">${item.name}</td>
          <td style="padding: 10px 0; color: #4b5563; font-size: 14px; border-bottom: 1px solid #f3f4f6; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px 0; color: #1f2937; font-size: 14px; border-bottom: 1px solid #f3f4f6; text-align: right; font-weight: 600;">&#8358;${Number(item.price).toLocaleString()}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="3" style="padding: 10px 0; color: #9ca3af; font-size: 14px;">No items listed</td></tr>';

  const content = `
    <h2 style="color: #1f2937; margin: 0 0 10px; font-size: 22px;">Order Confirmed!</h2>

    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      Hi <strong>${customerName}</strong>,
    </p>

    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      Thank you for your order! We've received your order and it's being processed.
    </p>

    <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="margin: 0 0 8px; color: #374151; font-size: 14px;">
        <strong>Order Number:</strong> <span style="color: #f97316; font-weight: 700;">${order.orderNumber || order.order_number || 'N/A'}</span>
      </p>
      ${order.status ? `<p style="margin: 0; color: #374151; font-size: 14px;"><strong>Status:</strong> ${order.status}</p>` : ''}
    </div>

    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <thead>
        <tr>
          <th style="padding: 8px 0; color: #374151; font-size: 13px; text-align: left; border-bottom: 2px solid #e5e7eb;">Item</th>
          <th style="padding: 8px 0; color: #374151; font-size: 13px; text-align: center; border-bottom: 2px solid #e5e7eb;">Qty</th>
          <th style="padding: 8px 0; color: #374151; font-size: 13px; text-align: right; border-bottom: 2px solid #e5e7eb;">Price</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="padding: 12px 0 4px; color: #1f2937; font-size: 16px; font-weight: 700;">Total</td>
          <td style="padding: 12px 0 4px; color: #f97316; font-size: 16px; font-weight: 700; text-align: right;">&#8358;${Number(order.total || order.total_amount || 0).toLocaleString()}</td>
        </tr>
      </tfoot>
    </table>

    ${order.deliveryAddress || order.delivery_address ? `
    <div style="background-color: #f0fdf4; border-left: 4px solid #059669; padding: 12px 16px; border-radius: 0 6px 6px 0; margin: 24px 0;">
      <p style="color: #166534; font-size: 14px; margin: 0;">
        <strong>Delivery Address:</strong> ${order.deliveryAddress || order.delivery_address}
      </p>
    </div>
    ` : ''}

    <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 24px;">
      You will receive another update when your order is shipped. Thank you for shopping with us!
    </p>
  `;

  return sendEmail({
    to: email,
    subject: `Order Confirmed - ${order.orderNumber || order.order_number || 'Your Order'}`,
    html: wrapInTemplate(content)
  });
};

// ─── Team Invite Email ─────────────────────────────────────────
const sendTeamInviteEmail = async (email, agentName, businessName, tempPassword) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  const content = `
    <h2 style="color: #1f2937; margin: 0 0 10px; font-size: 22px;">You've been invited to join ${businessName}!</h2>

    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      Hi <strong>${agentName}</strong>,
    </p>

    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      You've been added to <strong>${businessName}</strong>'s team on <strong>Pinga</strong>, the AI Social Sales platform.
    </p>

    <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="margin: 0 0 10px; color: #374151; font-size: 15px;"><strong>Your Login Credentials:</strong></p>
      <p style="margin: 5px 0; color: #4b5563; font-size: 15px;">Email: <span style="color: #1f2937; font-weight: 600;">${email}</span></p>
      <p style="margin: 5px 0; color: #4b5563; font-size: 15px;">Temporary Password: <span style="color: #f97316; font-weight: 600;">${tempPassword}</span></p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${frontendUrl}/login"
         style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #fb923c 100%); color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 16px; font-weight: 600;">
        Login to Your Account
      </a>
    </div>

    <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
      <strong>Note:</strong> For security reasons, you will be asked to change your password after your first login.
    </p>

    <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 0 6px 6px 0; margin-top: 24px;">
      <p style="color: #92400e; font-size: 13px; margin: 0;">
        <strong>Security Tip:</strong> Never share your password with anyone. Pinga staff will never ask for your password.
      </p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `You've been invited to join ${businessName} on Pinga`,
    html: wrapInTemplate(content)
  });
};

module.exports = {
  sendEmail,
  sendVerificationPinEmail,
  sendWelcomeEmail,
  sendPasswordResetPinEmail,
  sendOrderConfirmationEmail,
  sendTeamInviteEmail
};
