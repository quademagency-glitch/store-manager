const fetch = require('node-fetch'); // Make sure node-fetch is available, or use global fetch in Node 18+

/**
 * Service to send SMS via Arkesel V2 API
 */
class SmsService {
  constructor() {
    this.apiUrl = 'https://sms.arkesel.com/api/v2/sms/send';
  }

  /**
   * Send a custom SMS using dynamic gateway
   * @param {string[]} recipients - Array of phone numbers
   * @param {string} message - The SMS message body
   * @param {Object} gateway - The gateway configuration object from DB
   * @returns {Object} response
   */
  async sendCustomSMS(recipients, message, gateway) {
    if (!gateway || !gateway.api_key) {
      console.warn('SMS Gateway API Key missing or no gateway active. SMS simulation mode.');
      return { success: true, simulated: true, recipients };
    }

    try {
      if (gateway.provider === 'arkesel') {
        const senderId = gateway.sender_id || 'QUADEM';
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': gateway.api_key
          },
          body: JSON.stringify({
            sender: senderId.substring(0, 11), // Arkesel limits sender ID to 11 chars
            message: message,
            recipients: recipients
          })
        });

        const data = await response.json();
        
        if (!response.ok || data.status !== 'success') {
          throw new Error(data.message || 'Failed to send SMS via Arkesel');
        }

        return { success: true, data };
      } 
      else if (gateway.provider === 'twilio') {
        // Implement Twilio logic here
        // Example logic using basic fetch or twilio SDK
        console.warn('Twilio SMS logic not fully implemented yet, simulating.');
        return { success: true, simulated: true, provider: 'twilio', recipients };
      }
      else if (gateway.provider === 'mnotify') {
        // Implement mNotify logic here
        console.warn('mNotify SMS logic not fully implemented yet, simulating.');
        return { success: true, simulated: true, provider: 'mnotify', recipients };
      }
      else if (gateway.provider === 'hubtel') {
        // Implement Hubtel logic here
        console.warn('Hubtel SMS logic not fully implemented yet, simulating.');
        return { success: true, simulated: true, provider: 'hubtel', recipients };
      }
      else {
        throw new Error(`Unsupported SMS provider: ${gateway.provider}`);
      }
    } catch (error) {
      console.error(`[${gateway.provider}] SMS Error:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new SmsService();
