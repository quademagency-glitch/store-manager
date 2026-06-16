const logger = require('../utils/logger');
const { withRetry } = require('../utils/retry');

let Resend;
let resend;

function getResendClient() {
  if (!resend) {
    try {
      Resend = require('resend').Resend;
      resend = new Resend(process.env.RESEND_API_KEY);
    } catch (err) {
      logger.warn('Resend not available. Email sending will be simulated.');
      resend = null;
    }
  }
  return resend;
}

const PLATFORM_NAME = 'Quadem ERP';
const FROM_EMAIL = process.env.FROM_EMAIL || 'billing@quadem.com'; // Use verified domain in production
const PLATFORM_ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL || '';
const APP_URL = process.env.APP_URL || 'https://quaderp.app';

/**
 * Generate the HTML invoice email template
 */
function buildInvoiceHtml(invoice, business, planName) {
  const formattedAmount = new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: invoice.currency || 'GHS',
  }).format(invoice.amount);

  const dueDate = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A';

  const invoiceDate = new Date(invoice.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoice.invoice_number}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">${PLATFORM_NAME}</h1>
                    <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Subscription Invoice</p>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;background:rgba(255,255,255,0.2);color:#ffffff;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:600;text-transform:uppercase;">
                      ${invoice.status}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Invoice Details -->
          <tr>
            <td style="padding:32px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Invoice Number</p>
                    <p style="margin:4px 0 0;color:#0f172a;font-size:18px;font-weight:700;">${invoice.invoice_number}</p>
                  </td>
                  <td align="right">
                    <p style="margin:0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Amount Due</p>
                    <p style="margin:4px 0 0;color:#0f172a;font-size:28px;font-weight:800;">${formattedAmount}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:24px 40px;">
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0;">
            </td>
          </tr>

          <!-- Bill To / Info Grid -->
          <tr>
            <td style="padding:0 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="50%" valign="top">
                    <p style="margin:0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Bill To</p>
                    <p style="margin:8px 0 0;color:#0f172a;font-size:16px;font-weight:600;">${business.name}</p>
                    <p style="margin:4px 0 0;color:#64748b;font-size:14px;">${business.contact_email || ''}</p>
                  </td>
                  <td width="50%" valign="top">
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="padding-bottom:12px;">
                          <p style="margin:0;color:#64748b;font-size:12px;">Invoice Date</p>
                          <p style="margin:2px 0 0;color:#0f172a;font-size:14px;font-weight:500;">${invoiceDate}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom:12px;">
                          <p style="margin:0;color:#64748b;font-size:12px;">Due Date</p>
                          <p style="margin:2px 0 0;color:#0f172a;font-size:14px;font-weight:500;">${dueDate}</p>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <p style="margin:0;color:#64748b;font-size:12px;">Plan</p>
                          <p style="margin:2px 0 0;color:#0f172a;font-size:14px;font-weight:500;">${planName || 'N/A'}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Line Item -->
          <tr>
            <td style="padding:24px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;overflow:hidden;">
                <tr style="background:#e2e8f0;">
                  <td style="padding:12px 16px;color:#475569;font-size:13px;font-weight:600;">Description</td>
                  <td align="right" style="padding:12px 16px;color:#475569;font-size:13px;font-weight:600;">Amount</td>
                </tr>
                <tr>
                  <td style="padding:16px;color:#0f172a;font-size:14px;">
                    ${invoice.description || `${planName} Plan Subscription`}
                  </td>
                  <td align="right" style="padding:16px;color:#0f172a;font-size:14px;font-weight:600;">
                    ${formattedAmount}
                  </td>
                </tr>
                <tr style="background:#e2e8f0;">
                  <td style="padding:14px 16px;color:#0f172a;font-size:15px;font-weight:700;">Total</td>
                  <td align="right" style="padding:14px 16px;color:#6366f1;font-size:18px;font-weight:800;">${formattedAmount}</td>
                </tr>
              </table>
            </td>
          </tr>

          ${invoice.status !== 'paid' ? `
          <!-- Pay Now Button -->
          <tr>
            <td align="center" style="padding:0 40px 32px;">
              <a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;text-decoration:none;padding:14px 48px;border-radius:12px;font-size:16px;font-weight:600;box-shadow:0 4px 12px rgba(99,102,241,0.4);">
                Pay Now
              </a>
            </td>
          </tr>
          ` : `
          <!-- Paid Badge -->
          <tr>
            <td align="center" style="padding:0 40px 32px;">
              <span style="display:inline-block;background:#dcfce7;color:#16a34a;padding:10px 32px;border-radius:12px;font-size:15px;font-weight:600;">
                ✓ Payment Received — Thank You!
              </span>
            </td>
          </tr>
          `}

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
                This invoice was generated by ${PLATFORM_NAME}. You can also view and print your full invoice from your dashboard.<br/>If you have questions, contact us at ${PLATFORM_ADMIN_EMAIL || 'billing@quadem.com'}.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Build expiration warning email
 */
function buildExpirationWarningHtml(business, subscription, daysLeft) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#f59e0b,#ef4444);padding:32px 40px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;">⚠️ Subscription Expiring Soon</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="color:#0f172a;font-size:16px;line-height:1.6;">
                Hi <strong>${business.name}</strong>,
              </p>
              <p style="color:#475569;font-size:15px;line-height:1.6;">
                Your subscription will expire in <strong style="color:#ef4444;">${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>.
                To avoid service interruption, please renew your subscription before
                <strong>${new Date(subscription.current_period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.
              </p>
              <p style="color:#475569;font-size:15px;line-height:1.6;">
                If your subscription expires, your business account will be <strong>automatically suspended</strong> 
                and your team will lose access to the platform until payment is made.
              </p>
              <div style="text-align:center;margin:32px 0;">
                <a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;text-decoration:none;padding:14px 48px;border-radius:12px;font-size:16px;font-weight:600;">
                  Renew Now
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
                ${PLATFORM_NAME} — Subscription Management
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Build suspension notice email
 */
function buildSuspensionNoticeHtml(business) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#ef4444,#dc2626);padding:32px 40px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;">🚫 Account Suspended</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="color:#0f172a;font-size:16px;line-height:1.6;">
                Hi <strong>${business.name}</strong>,
              </p>
              <p style="color:#475569;font-size:15px;line-height:1.6;">
                Your subscription has expired and your business account has been <strong style="color:#ef4444;">suspended</strong>.
                Your team can no longer access the platform.
              </p>
              <p style="color:#475569;font-size:15px;line-height:1.6;">
                To restore access, please renew your subscription by making a payment. Your data is safe and will be 
                fully accessible once your account is reactivated.
              </p>
              <div style="text-align:center;margin:32px 0;">
                <a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;text-decoration:none;padding:14px 48px;border-radius:12px;font-size:16px;font-weight:600;">
                  Reactivate Account
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
                ${PLATFORM_NAME} — Subscription Management
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ============================================================
   PUBLIC API
   ============================================================ */

/**
 * Send an invoice email to the business admin(s) and platform admin
 */
async function sendInvoiceEmail(invoice, business, planName, recipientEmails = []) {
  const client = getResendClient();
  const recipients = [...new Set([
    ...recipientEmails,
    business.contact_email,
    PLATFORM_ADMIN_EMAIL,
  ].filter(Boolean))];

  if (recipients.length === 0) {
    logger.warn({ invoiceNumber: invoice.invoice_number }, 'No recipients for invoice email');
    return { success: false, error: 'No recipients' };
  }

  const html = buildInvoiceHtml(invoice, business, planName);

  if (!client) {
    logger.info({ invoiceNumber: invoice.invoice_number, recipients }, 'Invoice email simulated (no Resend client)');
    return { success: true, simulated: true, recipients };
  }

  try {
    const { data, error } = await withRetry(
      () => client.emails.send({
        from: `${PLATFORM_NAME} <${FROM_EMAIL}>`,
        to: recipients,
        subject: `Invoice ${invoice.invoice_number} — ${new Intl.NumberFormat('en-GH', { style: 'currency', currency: invoice.currency || 'GHS' }).format(invoice.amount)}`,
        html,
      }),
      { label: `invoice email ${invoice.invoice_number}` },
    );

    if (error) {
      logger.error({ err: error, invoiceNumber: invoice.invoice_number }, 'Resend API error');
      return { success: false, error: error.message };
    }

    logger.info({ invoiceNumber: invoice.invoice_number, recipients, messageId: data?.id }, 'Invoice email sent');
    return { success: true, messageId: data?.id, recipients };
  } catch (err) {
    logger.error({ err, invoiceNumber: invoice.invoice_number }, 'Invoice email send failed after retries');
    return { success: false, error: err.message };
  }
}

/**
 * Send expiration warning email
 */
async function sendExpirationWarning(business, subscription, daysLeft) {
  const client = getResendClient();
  const recipients = [business.contact_email, PLATFORM_ADMIN_EMAIL].filter(Boolean);

  if (recipients.length === 0) return { success: false, error: 'No recipients' };

  const html = buildExpirationWarningHtml(business, subscription, daysLeft);

  if (!client) {
    logger.info({ businessName: business.name, daysLeft }, 'Expiration warning email simulated');
    return { success: true, simulated: true };
  }

  try {
    const { error } = await withRetry(
      () => client.emails.send({
        from: `${PLATFORM_NAME} <${FROM_EMAIL}>`,
        to: recipients,
        subject: `Subscription expiring in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} — ${business.name}`,
        html,
      }),
      { label: `expiration warning email ${business.name}` },
    );

    if (error) {
      logger.error({ err: error, businessName: business.name }, 'Expiration warning email failed');
      return { success: false, error: error.message };
    }
    return { success: true, recipients };
  } catch (err) {
    logger.error({ err, businessName: business.name }, 'Expiration warning email failed after retries');
    return { success: false, error: err.message };
  }
}

/**
 * Send suspension notice email
 */
async function sendSuspensionNotice(business) {
  const client = getResendClient();
  const recipients = [business.contact_email, PLATFORM_ADMIN_EMAIL].filter(Boolean);

  if (recipients.length === 0) return { success: false, error: 'No recipients' };

  const html = buildSuspensionNoticeHtml(business);

  if (!client) {
    logger.info({ businessName: business.name }, 'Suspension notice email simulated');
    return { success: true, simulated: true };
  }

  try {
    const { error } = await withRetry(
      () => client.emails.send({
        from: `${PLATFORM_NAME} <${FROM_EMAIL}>`,
        to: recipients,
        subject: `Account Suspended — ${business.name}`,
        html,
      }),
      { label: `suspension notice email ${business.name}` },
    );

    if (error) {
      logger.error({ err: error, businessName: business.name }, 'Suspension notice email failed');
      return { success: false, error: error.message };
    }
    return { success: true, recipients };
  } catch (err) {
    logger.error({ err, businessName: business.name }, 'Suspension notice email failed after retries');
    return { success: false, error: err.message };
  }
}

/**
 * Send custom email for platform communications
 */
async function sendCustomEmail(recipients, subject, htmlContent, gateway = null) {
  if (!recipients || recipients.length === 0) return { success: false, error: 'No recipients' };

  let activeClient = getResendClient();
  let fromEmail = `${PLATFORM_NAME} <${FROM_EMAIL}>`;

  // If a custom gateway is provided
  if (gateway && gateway.api_key) {
    if (gateway.provider === 'resend') {
      try {
        const CustomResend = require('resend').Resend;
        activeClient = new CustomResend(gateway.api_key);
        if (gateway.sender_id) {
          fromEmail = gateway.sender_id;
        }
      } catch (err) {
        logger.warn('Custom Resend client initialization failed');
      }
    } else if (gateway.provider === 'smtp') {
      logger.warn({ provider: 'smtp' }, 'SMTP email provider is not yet implemented');
      return { success: false, error: 'SMTP email provider is not yet implemented. Use Resend.' };
    } else if (gateway.provider === 'sendgrid') {
      logger.warn({ provider: 'sendgrid' }, 'SendGrid email provider is not yet implemented');
      return { success: false, error: 'SendGrid email provider is not yet implemented. Use Resend.' };
    }
  }

  if (!activeClient) {
    logger.info({ recipients, subject }, 'Custom email simulated (no client)');
    return { success: true, simulated: true };
  }

  try {
    const { data, error } = await withRetry(
      () => activeClient.emails.send({ from: fromEmail, to: recipients, subject, html: htmlContent }),
      { label: `custom email "${subject}"` },
    );

    if (error) {
      logger.error({ err: error, subject }, 'Custom email failed');
      return { success: false, error: error.message };
    }
    return { success: true, messageId: data?.id, recipients };
  } catch (err) {
    logger.error({ err, subject }, 'Custom email failed after retries');
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendInvoiceEmail,
  sendExpirationWarning,
  sendSuspensionNotice,
  sendCustomEmail,
};
