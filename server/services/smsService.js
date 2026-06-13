const fetch = require('node-fetch'); // Make sure node-fetch is available, or use global fetch in Node 18+

/**
 * Service to send SMS via Arkesel V2 API
 */
class SmsService {
  constructor() {
    this.apiUrl = 'https://sms.arkesel.com/api/v2/sms/send';
  }

  /**
   * Send a custom SMS
   * @param {string[]} recipients - Array of phone numbers
   * @param {string} message - The SMS message body
   * @param {string} apiKey - The Arkesel API key
   * @param {string} senderId - The Sender ID (max 11 chars)
   * @returns {Object} response
   */
  async sendCustomSMS(recipients, message, apiKey, senderId = 'QUADEM') {
    if (!apiKey) {
      console.warn('Arkesel API Key missing. SMS simulation mode.');
      return { success: true, simulated: true, recipients };
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey
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
    } catch (error) {
      console.error('Arkesel SMS Error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new SmsService();
