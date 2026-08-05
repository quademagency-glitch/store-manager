const crypto = require('crypto');

const mockFrom = jest.fn();
jest.mock('../db/supabase', () => ({ supabaseAdmin: { from: (...args) => mockFrom(...args) } }));
jest.mock('node-fetch', () => jest.fn());

const fetch = require('node-fetch');
const { dispatchWebhook, attemptDelivery } = require('../services/webhookDispatcher');

describe('webhookDispatcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('dispatchWebhook', () => {
    it('only creates deliveries for active endpoints subscribed to the event', async () => {
      const insertedPayloads = [];
      const endpoints = [
        { id: 'ep-1', url: 'https://a.test/hook', secret: 's1', events: ['order.status_changed'] },
        { id: 'ep-2', url: 'https://b.test/hook', secret: 's2', events: ['some.other.event'] },
      ];

      fetch.mockResolvedValue({ status: 200, text: async () => 'ok' });

      mockFrom.mockImplementation((table) => {
        if (table === 'webhook_endpoints') {
          return {
            select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: endpoints, error: null }) }) }),
          };
        }
        if (table === 'webhook_deliveries') {
          return {
            insert: (payload) => {
              insertedPayloads.push(payload);
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: { id: 'del-1', ...payload, attempt_count: 0 }, error: null }),
                }),
              };
            },
            update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
          };
        }
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      });

      await dispatchWebhook('biz-1', 'order.status_changed', { foo: 'bar' });

      expect(insertedPayloads).toHaveLength(1);
      expect(insertedPayloads[0].webhook_endpoint_id).toBe('ep-1');
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('attemptDelivery', () => {
    const delivery = { id: 'del-1', event: 'order.status_changed', payload: { foo: 'bar' }, attempt_count: 0 };
    const endpoint = { id: 'ep-1', url: 'https://a.test/hook', secret: 'shh' };

    function captureUpdates() {
      const updateCalls = [];
      mockFrom.mockImplementation((table) => {
        if (table === 'webhook_deliveries') {
          return {
            update: (payload) => {
              updateCalls.push(payload);
              return { eq: () => Promise.resolve({ data: null, error: null }) };
            },
          };
        }
        return {};
      });
      return updateCalls;
    }

    it('signs the payload with HMAC-SHA256 and marks the delivery delivered on 2xx', async () => {
      fetch.mockResolvedValue({ status: 200, text: async () => 'ok' });
      const updateCalls = captureUpdates();

      await attemptDelivery(delivery, endpoint);

      const expectedBody = JSON.stringify({ event: delivery.event, data: delivery.payload, delivery_id: delivery.id });
      const expectedSig = crypto.createHmac('sha256', endpoint.secret).update(expectedBody).digest('hex');

      expect(fetch).toHaveBeenCalledWith(endpoint.url, expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Webhook-Signature': `sha256=${expectedSig}` }),
      }));
      expect(updateCalls[0]).toEqual(expect.objectContaining({ status: 'delivered', attempt_count: 1, next_retry_at: null }));
    });

    it('schedules a retry on a non-2xx response', async () => {
      fetch.mockResolvedValue({ status: 500, text: async () => 'server error' });
      const updateCalls = captureUpdates();

      await attemptDelivery(delivery, endpoint);

      expect(updateCalls[0].status).toBe('pending');
      expect(updateCalls[0].attempt_count).toBe(1);
      expect(updateCalls[0].next_retry_at).not.toBeNull();
    });

    it('schedules a retry when the fetch itself throws', async () => {
      fetch.mockRejectedValue(new Error('network unreachable'));
      const updateCalls = captureUpdates();

      await attemptDelivery(delivery, endpoint);

      expect(updateCalls[0].status).toBe('pending');
      expect(updateCalls[0].response_body).toContain('network unreachable');
    });

    it('marks the delivery permanently failed once retries are exhausted', async () => {
      fetch.mockResolvedValue({ status: 500, text: async () => 'server error' });
      const updateCalls = captureUpdates();

      // attempt_count already 3 -> this call is attempt 4, past the 3-step backoff table
      await attemptDelivery({ ...delivery, attempt_count: 3 }, endpoint);

      expect(updateCalls[0].status).toBe('failed');
      expect(updateCalls[0].next_retry_at).toBeNull();
    });
  });
});
