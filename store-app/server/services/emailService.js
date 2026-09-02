const logger = require('../utils/logger');
const { withRetry } = require('../utils/retry');
const { supabaseAdmin } = require('../db/supabase');

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

const PLATFORM_NAME = 'QuadERP';
/* quaderp.app is the verified Resend domain. The previous default was
   billing@quaderp.com — a .com that is not registered to anyone, so the
   fallback addressed mail from a domain we do not own. Any default here is
   a fallback for a missing FROM_EMAIL, so it has to be an address that is
   actually ours. */
const FROM_EMAIL = process.env.FROM_EMAIL || 'info@quaderp.app';
const PLATFORM_ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL || '';
// Public-facing support address shown to customers (distinct from the internal
// PLATFORM_ADMIN_EMAIL used for invoice/alert notifications).
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@quaderp.app';
const APP_URL = process.env.APP_URL || 'https://app.quaderp.app';

/* The QuadERP mark for email headers. Hosted on the landing site, which is
   public and already serves it over https.

   PNG rather than the app's logo.svg, because Gmail strips SVG <img> entirely
   and an SVG logo is a broken image for most of the audience. Laid out as a
   table rather than flex, because Outlook renders through Word's engine and
   ignores display:flex, which would stack the mark above the wordmark. The
   88px source is shown at 44 (or 28) so it stays sharp on retina. alt is empty
   on purpose: the wordmark beside it is real text, so blocking images degrades
   to "QuadERP" once rather than twice. */
const LOGO_URL = 'https://www.quaderp.app/images/email-logo.png';

/**
 * The branded bar that sits at the top of a template's coloured header cell.
 *
 * `compact` is for the warning and suspension templates, whose own headings
 * carry the urgency ("Subscription Expiring Soon"). There the mark goes above
 * that heading at a smaller size, so branding the email does not demote the
 * sentence the customer needs to read. `right` takes the invoice status badge.
 */
function brandBar({ subtitle = '', right = '', compact = false } = {}) {
  const px = compact ? 28 : 44;
  const radius = compact ? 7 : 10;
  const img = `<img src="${LOGO_URL}" width="${px}" height="${px}" alt=""`
    + ` style="display:block;width:${px}px;height:${px}px;border:0;border-radius:${radius}px;">`;
  const name = compact
    ? `<span style="color:#ffffff;font-size:15px;font-weight:600;letter-spacing:-0.2px;">${PLATFORM_NAME}</span>`
    : `<h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">${PLATFORM_NAME}</h1>`
      + (subtitle ? `<p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">${subtitle}</p>` : '');

  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation"`
    + `${compact ? ' style="margin:0 0 14px;"' : ''}>
                <tr>
                  <td width="${px}" style="padding:0 12px 0 0;vertical-align:middle;">${img}</td>
                  <td style="vertical-align:middle;">${name}</td>
                  ${right ? `<td align="right" style="vertical-align:middle;">${right}</td>` : ''}
                </tr>
              </table>`;
}

/**
 * Every business gets its own branded URL at <slug>.<app-host>
 * (e.g. https://acme.app.quaderp.app). Derived from APP_URL so there is a single
 * source of truth, matching the client's subdomain detection (lib/subdomain.js).
 * Falls back to APP_URL when the business has no slug yet, or when APP_URL is a
 * bare host / localhost / IP where wildcard subdomains don't resolve (dev).
 */
function resolveBusinessLoginUrl(business) {
  if (business && business.slug) {
    try {
      const u = new URL(APP_URL);
      const host = u.hostname;
      const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
      if (host.includes('.') && !isIp && host !== 'localhost') {
        return `${u.protocol}//${business.slug}.${host}`;
      }
    } catch { /* malformed APP_URL, fall through to default */ }
  }
  return APP_URL;
}

/**
 * Mint a one-time "set your password" link (Supabase recovery action link) that
 * lands on /update-password. redirectTo must be an allowlisted Auth redirect URL.
 * Returns the action_link string, or null if generation fails (caller degrades
 * gracefully to a "use Forgot Password" hint).
 */
async function generateSetPasswordLink(email, redirectBase = APP_URL) {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      // redirectBase is the business's own URL when available, so the whole flow
      // stays on their branded subdomain. Requires that origin to be an
      // allowlisted Supabase redirect URL (e.g. https://*.app.quaderp.app/**);
      // if it isn't, Supabase falls back to the Site URL, so this degrades safely.
      options: { redirectTo: `${redirectBase}/update-password` },
    });
    if (error) {
      logger.error({ err: error, email }, 'Failed to generate set-password link');
      return null;
    }
    return data?.properties?.action_link || null;
  } catch (err) {
    logger.error({ err, email }, 'generateSetPasswordLink threw');
    return null;
  }
}

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
              ${brandBar({
    subtitle: 'Subscription Invoice',
    right: `<span style="display:inline-block;background:rgba(255,255,255,0.2);color:#ffffff;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:600;text-transform:uppercase;">${invoice.status}</span>`,
  })}
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
                ✓ Paid. Thanks so much!
              </span>
            </td>
          </tr>
          `}

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
                You can view and print this invoice any time from your dashboard.<br/>Questions about your bill? Just email ${SUPPORT_EMAIL} and we'll help you sort it out.
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
              ${brandBar({ compact: true })}
              <h1 style="margin:0;color:#ffffff;font-size:22px;">⚠️ Subscription Expiring Soon</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="color:#0f172a;font-size:16px;line-height:1.6;">
                Hi <strong>${business.name}</strong>,
              </p>
              <p style="color:#475569;font-size:15px;line-height:1.6;">
                Just a heads up: your subscription runs out in <strong style="color:#ef4444;">${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>,
                on <strong>${new Date(subscription.current_period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.
                Renewing before then keeps everything running without a break.
              </p>
              <p style="color:#475569;font-size:15px;line-height:1.6;">
                If it lapses, the account is paused and your team won't be able to log in until it's renewed.
                Don't worry though, your data stays safe the whole time.
              </p>
              <div style="text-align:center;margin:32px 0;">
                <a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;text-decoration:none;padding:14px 48px;border-radius:12px;font-size:16px;font-weight:600;">
                  Renew your subscription
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
                Sent by ${PLATFORM_NAME}. Questions? Email ${SUPPORT_EMAIL}.
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
              ${brandBar({ compact: true })}
              <h1 style="margin:0;color:#ffffff;font-size:22px;">🚫 Account Suspended</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="color:#0f172a;font-size:16px;line-height:1.6;">
                Hi <strong>${business.name}</strong>,
              </p>
              <p style="color:#475569;font-size:15px;line-height:1.6;">
                Your subscription has run out, so the account is <strong style="color:#ef4444;">paused</strong> for now
                and your team can't log in at the moment.
              </p>
              <p style="color:#475569;font-size:15px;line-height:1.6;">
                Nothing is lost, all your data is still right where you left it. Make a payment to renew and
                everyone will be back in straight away.
              </p>
              <div style="text-align:center;margin:32px 0;">
                <a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;text-decoration:none;padding:14px 48px;border-radius:12px;font-size:16px;font-weight:600;">
                  Renew and reactivate
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
                Sent by ${PLATFORM_NAME}. Need a hand? Email ${SUPPORT_EMAIL}.
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
 * Build the branded welcome email for a newly-added business.
 */
/**
 * @param {'set-password'|'verify-email'} ctaMode
 *   Operator-provisioned businesses (`set-password`) have had a password
 *   generated for them and must choose their own before they can get in.
 *   Self-service signups (`verify-email`) already chose one during signup, *   what stands between them and the app is confirming they own the address.
 *   Same branded shell either way; only the CTA and the copy around it move.
 */
function buildWelcomeHtml(business, adminName, adminEmail, { setPasswordUrl, loginUrl, planName, ctaMode = 'set-password', trialEndsAt = null }) {
  const greeting = adminName && adminName !== 'Business Admin' ? adminName : business.name;
  const verifying = ctaMode === 'verify-email';

  const trialLine = trialEndsAt
    ? new Date(trialEndsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const cta = verifying
    ? {
        intro: `Good to have <strong>${business.name}</strong> with us. Your free trial is set up and waiting. The only thing left is to confirm this email address, and then you're in.`,
        withLink: { label: 'Confirm your email', note: 'The link is good for about an hour. If it runs out, sign in and we’ll send you a fresh one.' },
        withoutLink: { label: `Go to ${PLATFORM_NAME}`, note: 'Head to the sign-in page and use the password you chose during signup.' },
      }
    : {
        intro: `Good to have <strong>${business.name}</strong> with us. Your account is ready to go. The only thing left is to choose a password, and then you're in.`,
        withLink: { label: 'Choose your password', note: 'The link is good for about an hour. If it runs out, tap “Forgot password” on the sign-in page and we’ll send you a fresh one.' },
        withoutLink: { label: `Go to ${PLATFORM_NAME}`, note: 'Head to the sign-in page and tap “Forgot password” to set yours.' },
      };

  const steps = [
    'Fill in your business details, like your logo and currency',
    'Set up your locations and opening stock',
    'Bring over your products, customers and suppliers',
    'Add your team and give everyone the right access',
  ];

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ${PLATFORM_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:36px 40px;">
              ${brandBar({ subtitle: 'Welcome 👋' })}
            </td>
          </tr>

          <!-- Intro -->
          <tr>
            <td style="padding:32px 40px 8px;">
              <p style="margin:0;color:#0f172a;font-size:16px;line-height:1.6;">
                Hi <strong>${greeting}</strong>,
              </p>
              <p style="margin:12px 0 0;color:#475569;font-size:15px;line-height:1.6;">
                ${cta.intro}
              </p>
            </td>
          </tr>

          <!-- Primary CTA: set a password, or confirm the address -->
          <tr>
            <td align="center" style="padding:24px 40px 8px;">
              ${setPasswordUrl ? `
              <a href="${setPasswordUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;text-decoration:none;padding:14px 48px;border-radius:12px;font-size:16px;font-weight:600;box-shadow:0 4px 12px rgba(99,102,241,0.4);">
                ${cta.withLink.label}
              </a>
              <p style="margin:12px 0 0;color:#94a3b8;font-size:12px;">${cta.withLink.note}</p>
              ` : `
              <a href="${loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;text-decoration:none;padding:14px 48px;border-radius:12px;font-size:16px;font-weight:600;box-shadow:0 4px 12px rgba(99,102,241,0.4);">
                ${cta.withoutLink.label}
              </a>
              <p style="margin:12px 0 0;color:#94a3b8;font-size:12px;">${cta.withoutLink.note}</p>
              `}
              ${trialLine ? `
              <p style="margin:16px 0 0;color:#475569;font-size:13px;">Your free trial runs until <strong style="color:#0f172a;">${trialLine}</strong>. No card needed until then.</p>
              ` : ''}
            </td>
          </tr>

          <!-- Account details -->
          <tr>
            <td style="padding:24px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Your login email</p>
                    <p style="margin:4px 0 12px;color:#0f172a;font-size:15px;font-weight:600;">${adminEmail}</p>
                    <p style="margin:0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Sign in at</p>
                    <p style="margin:4px 0 0;font-size:15px;font-weight:600;"><a href="${loginUrl}" style="color:#6366f1;text-decoration:none;">${loginUrl}</a></p>
                    ${planName ? `
                    <p style="margin:12px 0 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Plan</p>
                    <p style="margin:4px 0 0;color:#0f172a;font-size:15px;font-weight:600;">${planName}</p>
                    ` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Getting started -->
          <tr>
            <td style="padding:28px 40px 8px;">
              <p style="margin:0 0 12px;color:#0f172a;font-size:15px;font-weight:700;">Once you're in, here's a good place to start</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${steps.map((s, i) => `
                <tr>
                  <td width="28" valign="top" style="padding:6px 0;">
                    <span style="display:inline-block;width:22px;height:22px;background:#eef2ff;color:#6366f1;border-radius:50%;text-align:center;line-height:22px;font-size:12px;font-weight:700;">${i + 1}</span>
                  </td>
                  <td style="padding:6px 0;color:#475569;font-size:14px;line-height:1.5;">${s}</td>
                </tr>
                `).join('')}
              </table>
            </td>
          </tr>

          <!-- Closing -->
          <tr>
            <td style="padding:28px 40px 4px;">
              <p style="margin:0;color:#475569;font-size:15px;line-height:1.6;">
                If you get stuck or something doesn't look right, just email us at
                <a href="mailto:${SUPPORT_EMAIL}" style="color:#6366f1;text-decoration:none;">${SUPPORT_EMAIL}</a>
                and a real person will get back to you.
              </p>
              <p style="margin:16px 0 0;color:#475569;font-size:15px;line-height:1.6;">
                Glad you're here,<br/>
                <strong>The ${PLATFORM_NAME} Team</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
                You're getting this because an account was set up for you at ${PLATFORM_NAME}.
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
        subject: `Your ${PLATFORM_NAME} invoice ${invoice.invoice_number} (${new Intl.NumberFormat('en-GH', { style: 'currency', currency: invoice.currency || 'GHS' }).format(invoice.amount)})`,
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
        subject: `${business.name}, your subscription runs out in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
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
        subject: `${business.name}, your account is paused for now`,
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
async function sendCustomEmail(recipients, subject, htmlContent, gateway = null, options = {}) {
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

  /* One message per recipient. This used to pass the whole array as `to`,
     which puts every recipient's address in the To header of every copy, so a
     single "All Businesses" broadcast would have disclosed the entire customer
     list to the entire customer list. That is a personal-data breach under the
     Data Protection Act, and the first send would have been the one that did
     it, with no way to take it back.

     Resend's batch endpoint accepts up to 100 separate messages per call, so
     this stays one request per 100 recipients rather than one per recipient. */
  const BATCH_LIMIT = 100;
  const sent = [];
  const failed = [];

  for (let i = 0; i < recipients.length; i += BATCH_LIMIT) {
    const chunk = recipients.slice(i, i + BATCH_LIMIT);
    try {
      /* An idempotency key makes a re-run safe: Resend returns the original
         result instead of sending again. Keyed per chunk, because two chunks
         are different payloads and reusing one key across them would make the
         second look like a retry of the first and silently send nothing. */
      const sendOptions = options.idempotencyKey
        ? { idempotencyKey: `${options.idempotencyKey}-${i / BATCH_LIMIT}` }
        : undefined;

      const { error } = await withRetry(
        () => activeClient.batch.send(
          chunk.map((to) => ({
            from: fromEmail,
            to: [to],
            subject,
            html: htmlContent,
            ...(options.replyTo ? { replyTo: options.replyTo } : {}),
          })),
          sendOptions,
        ),
        { label: `custom email "${subject}" (${chunk.length} recipients)` },
      );

      if (error) {
        logger.error({ err: error, subject, count: chunk.length }, 'Custom email batch failed');
        failed.push(...chunk);
        continue;
      }
      sent.push(...chunk);
    } catch (err) {
      logger.error({ err, subject, count: chunk.length }, 'Custom email batch failed after retries');
      failed.push(...chunk);
    }
  }

  if (sent.length === 0) {
    return { success: false, error: 'All recipients failed', sentCount: 0, failedCount: failed.length };
  }
  return {
    success: true,
    sentCount: sent.length,
    failedCount: failed.length,
    recipients: sent,
    ...(failed.length ? { failedRecipients: failed } : {}),
  };
}

/**
 * Send the branded welcome email to a newly-added business's admin.
 * Generates a one-time "set your password" link unless one is supplied.
 * Never throws; returns a result object so callers can fire-and-log.
 */
async function sendBusinessWelcomeEmail(business, admin, opts = {}) {
  const to = admin && admin.email;
  if (!to) {
    logger.warn({ business: business && business.name }, 'No recipient for welcome email');
    return { success: false, error: 'No recipient email' };
  }

  const loginUrl = resolveBusinessLoginUrl(business);
  // A self-service signup supplies its own action link (an email-confirmation
  // link) and must not have a password-reset link minted for it, the owner
  // already chose a password.
  const setPasswordUrl = opts.setPasswordUrl !== undefined
    ? opts.setPasswordUrl
    : await generateSetPasswordLink(to, loginUrl);
  const html = buildWelcomeHtml(business, admin.name, to, {
    setPasswordUrl,
    loginUrl,
    planName: opts.planName,
    ctaMode: opts.ctaMode,
    trialEndsAt: opts.trialEndsAt,
  });
  const subject = `${business.name} is ready to go on ${PLATFORM_NAME}`;

  const client = getResendClient();
  if (!client) {
    logger.info({ business: business.name, to }, 'Welcome email simulated (no Resend client)');
    return { success: true, simulated: true, recipients: [to] };
  }

  try {
    const { data, error } = await withRetry(
      () => client.emails.send({
        from: `${PLATFORM_NAME} <${FROM_EMAIL}>`,
        to: [to],
        subject,
        html,
      }),
      { label: `welcome email ${business.name}` },
    );

    if (error) {
      logger.error({ err: error, business: business.name, to }, 'Welcome email failed');
      return { success: false, error: error.message };
    }
    logger.info({ business: business.name, to, messageId: data?.id }, 'Welcome email sent');
    return { success: true, messageId: data?.id, recipients: [to] };
  } catch (err) {
    logger.error({ err, business: business.name, to }, 'Welcome email failed after retries');
    return { success: false, error: err.message };
  }
}

/**
 * The From header these functions actually send with, so a caller can show it
 * before sending rather than reimplementing the env lookup and drifting from
 * it. Does not reflect a custom gateway's sender_id, which is resolved per send.
 */
function senderAddress() {
  return `${PLATFORM_NAME} <${FROM_EMAIL}>`;
}

module.exports = {
  LOGO_URL,
  senderAddress,
  /* The four builders are pure string functions. Exported so they can be
     rendered and asserted on — until now nothing could reach them, so the
     customer-facing templates had no test covering them at all. */
  buildInvoiceHtml,
  buildExpirationWarningHtml,
  buildSuspensionNoticeHtml,
  buildWelcomeHtml,
  sendInvoiceEmail,
  sendExpirationWarning,
  sendSuspensionNotice,
  sendCustomEmail,
  sendBusinessWelcomeEmail,
  generateSetPasswordLink,
  resolveBusinessLoginUrl,
};
