/**
 * sendTrialEndingReminders, the daily reminder to a self-serve trial.
 *
 * What is worth testing is not that an email goes out but that exactly one
 * does. The window is three days wide and the job runs daily, so the
 * difference between one reminder and three is the claim on
 * businesses.trial_reminder_sent_at, and the difference between a failed
 * send being retried and being lost for good is releasing that claim.
 *
 * The live query shape (the filters, the conditional update) is exercised
 * against production separately: this mock does not evaluate filters, so a
 * wrong column name would pass here and fail there.
 */
const { buildMockSupabase } = require('./helpers/mockSupabase');

let mockSupabase = buildMockSupabase();
jest.mock('../db/supabase', () => ({ supabaseAdmin: mockSupabase }));

const mockSendReminder = jest.fn();
jest.mock('../services/emailService', () => ({
  sendExpirationWarning: jest.fn(),
  sendSuspensionNotice: jest.fn(),
  sendTrialEndingReminder: (...args) => mockSendReminder(...args),
}));
jest.mock('../utils/cronLock', () => ({ claimCronRun: jest.fn(), pruneCronRuns: jest.fn() }));
jest.mock('../middleware/authGuard', () => ({ invalidateBusinessCache: jest.fn() }));
jest.mock('../utils/auditLog', () => ({
  logAuditEvent: jest.fn(),
  systemAuditContext: jest.fn(),
  pruneAuditLogs: jest.fn(),
  AUDIT_ACTIONS: {},
}));
jest.mock('../instrument', () => ({ captureException: jest.fn() }));

const { sendTrialEndingReminders } = require('../services/subscriptionCron');

const DAY = 24 * 60 * 60 * 1000;
const inDays = (d) => new Date(Date.now() + d * DAY).toISOString();
const trial = (over = {}) => ({
  id: 'biz-1',
  name: 'Acme Hardware',
  slug: 'acme-hardware',
  contact_email: 'owner@acme.test',
  trial_ends_at: inDays(2.5),
  trial_reminder_sent_at: null,
  ...over,
});

/** Results for successive from('businesses') calls: select, claim, release... */
function useMock(businessesResults) {
  Object.assign(mockSupabase, buildMockSupabase({ businesses: businessesResults }));
}
const updates = () => mockSupabase.mutations.filter((m) => m.table === 'businesses' && m.op === 'update');

beforeEach(() => {
  mockSendReminder.mockReset();
  mockSendReminder.mockResolvedValue({ success: true });
});

describe('sending once', () => {
  it('claims the reminder BEFORE sending it', async () => {
    useMock([{ data: [trial()], error: null }, { data: [{ id: 'biz-1' }], error: null }]);
    let claimsAtSend = null;
    mockSendReminder.mockImplementation(async () => {
      claimsAtSend = updates().length;
      return { success: true };
    });

    await sendTrialEndingReminders();

    expect(claimsAtSend).toBe(1);
    const [claim] = updates();
    expect(typeof claim.payload.trial_reminder_sent_at).toBe('string');
  });

  it('sends to the business with the days left rounded up, never down', async () => {
    useMock([{ data: [trial({ trial_ends_at: inDays(2.5) })], error: null }, { data: [{ id: 'biz-1' }], error: null }]);
    await sendTrialEndingReminders();

    expect(mockSendReminder).toHaveBeenCalledTimes(1);
    const [biz, opts] = mockSendReminder.mock.calls[0];
    expect(biz.contact_email).toBe('owner@acme.test');
    expect(opts.daysLeft).toBe(3);
  });

  it('says one day, not zero, for a trial ending within hours', async () => {
    useMock([{ data: [trial({ trial_ends_at: inDays(0.1) })], error: null }, { data: [{ id: 'biz-1' }], error: null }]);
    await sendTrialEndingReminders();
    expect(mockSendReminder.mock.calls[0][1].daysLeft).toBe(1);
  });

  it('sends nothing when the claim matched no row, because another run already sent it', async () => {
    useMock([{ data: [trial()], error: null }, { data: [], error: null }]);
    await sendTrialEndingReminders();

    expect(mockSendReminder).not.toHaveBeenCalled();
    expect(updates()).toHaveLength(1); // the claim attempt only, no release
  });

  it('sends nothing when the claim itself errors', async () => {
    useMock([{ data: [trial()], error: null }, { data: null, error: { message: 'boom' } }]);
    await sendTrialEndingReminders();
    expect(mockSendReminder).not.toHaveBeenCalled();
  });
});

describe('a failed send is retried, not lost', () => {
  it('releases the claim when the send fails', async () => {
    useMock([{ data: [trial()], error: null }, { data: [{ id: 'biz-1' }], error: null }, { data: [], error: null }]);
    mockSendReminder.mockResolvedValue({ success: false, error: 'domain not verified' });

    await sendTrialEndingReminders();

    const [claim, release] = updates();
    expect(release).toBeDefined();
    expect(release.payload).toEqual({ trial_reminder_sent_at: null });
    expect(typeof claim.payload.trial_reminder_sent_at).toBe('string');
  });

  it('releases the claim when the send throws', async () => {
    useMock([{ data: [trial()], error: null }, { data: [{ id: 'biz-1' }], error: null }, { data: [], error: null }]);
    mockSendReminder.mockRejectedValue(new Error('socket hang up'));

    await sendTrialEndingReminders();

    expect(updates()[1].payload).toEqual({ trial_reminder_sent_at: null });
  });

  it('carries on to the next business after one fails', async () => {
    const a = trial({ id: 'biz-a', contact_email: 'a@acme.test' });
    const b = trial({ id: 'biz-b', contact_email: 'b@acme.test' });
    useMock([
      { data: [a, b], error: null },      // select
      { data: [{ id: 'biz-a' }], error: null }, // claim a
      { data: [], error: null },          // release a
      { data: [{ id: 'biz-b' }], error: null }, // claim b
    ]);
    mockSendReminder
      .mockResolvedValueOnce({ success: false, error: 'nope' })
      .mockResolvedValueOnce({ success: true });

    await sendTrialEndingReminders();

    expect(mockSendReminder).toHaveBeenCalledTimes(2);
    expect(mockSendReminder.mock.calls[1][0].id).toBe('biz-b');
  });
});

describe('when to do nothing at all', () => {
  it('skips the whole sweep when the column does not exist yet', async () => {
    // The fallback that suits resend-confirmation would be wrong here: with
    // no record of having sent, every day in the window would send again.
    useMock([{ data: null, error: { code: '42703', message: 'column businesses.trial_reminder_sent_at does not exist' } }]);
    await sendTrialEndingReminders();

    expect(mockSendReminder).not.toHaveBeenCalled();
    expect(updates()).toHaveLength(0);
  });

  it('does not claim a business it has no address for', async () => {
    useMock([{ data: [trial({ contact_email: null })], error: null }]);
    await sendTrialEndingReminders();

    expect(mockSendReminder).not.toHaveBeenCalled();
    expect(updates()).toHaveLength(0);
  });

  it('does nothing when no trial is ending', async () => {
    useMock([{ data: [], error: null }]);
    await sendTrialEndingReminders();
    expect(mockSendReminder).not.toHaveBeenCalled();
  });

  it('does not throw when the lookup fails for another reason', async () => {
    useMock([{ data: null, error: { code: '57014', message: 'statement timeout' } }]);
    await expect(sendTrialEndingReminders()).resolves.toBeUndefined();
    expect(mockSendReminder).not.toHaveBeenCalled();
  });
});
