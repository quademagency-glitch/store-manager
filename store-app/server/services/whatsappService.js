const logger = require('../utils/logger');

/**
 * WhatsApp Cloud API, through the business's own WhatsApp Business account.
 *
 * Business-initiated messages must use a template the business has had
 * approved by Meta; its body parameters are filled in order. A success means
 * WhatsApp accepted the message, not that it was delivered or read, and it is
 * labelled that way everywhere it is shown.
 *
 * Gateway row (communication_gateways, type 'whatsapp', provider 'meta_cloud'):
 *   api_key   permanent access token (a secret; masked when read back)
 *   sender_id phone number ID from the WhatsApp Manager
 *   config    { receipt_template, reminder_template, language, graph_version }
 *
 * There is deliberately no "simulated success": without a configured account
 * nothing is sent and the caller is told so.
 */
const GRAPH = 'https://graph.facebook.com';
// Graph API v26.0 was released on 29 July 2026; v21.0 stops on 21 January 2027.
const DEFAULT_VERSION = 'v26.0';
const TIMEOUT_MS = 15_000;

/**
 * @param {object} gateway
 * @param {{ to: string, template: string, language?: string, params: string[] }} message
 *   `to` is the international number as digits only.
 * @returns {Promise<{ success: true, messageId: string } | { success: false, error: string, permanent: boolean }>}
 */
async function sendTemplate(gateway, { to, template, language = 'en', params = [] }) {
  if (!gateway?.api_key || !gateway?.sender_id) return { success: false, permanent: true, error: 'WhatsApp is not connected.' };
  if (!template) return { success: false, permanent: true, error: 'No WhatsApp template name is set for this message.' };
  if (!/^\d{8,15}$/.test(String(to || ''))) return { success: false, permanent: true, error: 'The phone number cannot be used on WhatsApp.' };

  const version = /^v\d+\.\d+$/.test(gateway.config?.graph_version || '') ? gateway.config.graph_version : DEFAULT_VERSION;
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: template,
      language: { code: language || 'en' },
      ...(params.length ? { components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text ?? '').slice(0, 1000) })) }] } : {}),
    },
  };
  try {
    const res = await fetch(`${GRAPH}/${version}/${encodeURIComponent(gateway.sender_id)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${gateway.api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await res.json().catch(() => ({}));
    const messageId = data?.messages?.[0]?.id;
    if (res.ok && messageId) return { success: true, messageId };
    const error = data?.error?.message ? `WhatsApp: ${data.error.message}` : `WhatsApp returned HTTP ${res.status}.`;
    // 4xx other than rate limiting will not fix itself on retry (bad token,
    // unapproved template, number not on WhatsApp).
    return { success: false, error: error.slice(0, 500), permanent: res.status >= 400 && res.status < 500 && res.status !== 429 };
  } catch (err) {
    logger.warn({ err }, 'whatsapp: request failed');
    return { success: false, permanent: false, error: 'WhatsApp could not be reached. It will be retried.' };
  }
}

module.exports = { sendTemplate, DEFAULT_VERSION };
