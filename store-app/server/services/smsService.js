const fetch = require('node-fetch');
const logger = require('../utils/logger');
const { withRetry } = require('../utils/retry');

class SmsService {
  constructor() {
    this.apiUrl = 'https://sms.arkesel.com/api/v2/sms/send';
  }

  async sendCustomSMS(recipients, message, gateway) {
    if (!gateway || !gateway.api_key) {
      logger.warn('SMS gateway API key missing — simulating send');
      return { success: true, simulated: true, recipients };
    }

    try {
      if (gateway.provider === 'arkesel') {
        return await this._sendArkesel(recipients, message, gateway);
      } else if (gateway.provider === 'twilio') {
        logger.warn({ provider: 'twilio' }, 'Twilio SMS provider is not yet implemented');
        return { success: false, error: 'Twilio SMS provider is not yet implemented. Use Arkesel.' };
      } else if (gateway.provider === 'mnotify') {
        logger.warn({ provider: 'mnotify' }, 'mNotify SMS provider is not yet implemented');
        return { success: false, error: 'mNotify SMS provider is not yet implemented. Use Arkesel.' };
      } else if (gateway.provider === 'hubtel') {
        logger.warn({ provider: 'hubtel' }, 'Hubtel SMS provider is not yet implemented');
        return { success: false, error: 'Hubtel SMS provider is not yet implemented. Use Arkesel.' };
      } else {
        throw new Error(`Unsupported SMS provider: ${gateway.provider}`);
      }
    } catch (error) {
      logger.error({ err: error, provider: gateway.provider }, 'SMS send failed');
      return { success: false, error: error.message };
    }
  }

  async _sendArkesel(recipients, message, gateway) {
    const senderId = (gateway.sender_id || 'QUADEM').substring(0, 11);
    const data = await withRetry(
      async () => {
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': gateway.api_key },
          body: JSON.stringify({ sender: senderId, message, recipients }),
        });
        const json = await response.json();
        if (!response.ok || json.status !== 'success') {
          throw new Error(json.message || `Arkesel HTTP ${response.status}`);
        }
        return json;
      },
      { label: `Arkesel SMS to ${recipients.length} recipient(s)` },
    );

    logger.info({ recipients, senderId }, 'Arkesel SMS sent');
    return { success: true, data };
  }
}

module.exports = new SmsService();
