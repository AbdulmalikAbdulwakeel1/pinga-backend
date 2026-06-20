/**
 * Reusable Email Template - Header & Footer for Pinga
 *
 * Usage:
 *   const { wrapInTemplate } = require('./emailTemplate');
 *   const html = wrapInTemplate('Your HTML content here');
 */

const APP_NAME = process.env.APP_NAME || 'Pinga';

const getEmailHeader = () => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0f2f5; -webkit-font-smoothing: antialiased;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #f97316 0%, #fb923c 100%); border-radius: 12px 12px 0 0; padding: 30px 40px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 0.5px;">${APP_NAME}</h1>
      <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 13px; letter-spacing: 0.3px;">AI Social Sales Agent for Nigerian SMBs</p>
    </div>

    <!-- Content Area -->
    <div style="background-color: #ffffff; padding: 40px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
`;

const getEmailFooter = () => `
    </div>
    <!-- End Content Area -->

    <!-- Footer -->
    <div style="background-color: #f9fafb; border-radius: 0 0 12px 12px; padding: 30px 40px; border: 1px solid #e5e7eb; border-top: none; text-align: center;">
      <p style="color: #6b7280; font-size: 13px; margin: 0 0 12px; line-height: 1.5;">
        Need help? Contact us at
        <a href="mailto:support@pinga.ng" style="color: #f97316; text-decoration: none; font-weight: 500;">support@pinga.ng</a>
      </p>
      <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 16px;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0; line-height: 1.5;">
          &copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
        </p>
        <p style="color: #9ca3af; font-size: 11px; margin: 8px 0 0;">
          This is an automated message. Please do not reply directly to this email.
        </p>
      </div>
    </div>

  </div>
</body>
</html>
`;

/**
 * Wraps email content with the standard Pinga header and footer
 * @param {string} content - The HTML content to wrap (just the body content)
 * @returns {string} Full HTML email with header and footer
 */
const wrapInTemplate = (content) => {
  return getEmailHeader() + content + getEmailFooter();
};

module.exports = {
  getEmailHeader,
  getEmailFooter,
  wrapInTemplate
};
