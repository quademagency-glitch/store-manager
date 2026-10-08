import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Field } from '../operations/WorkSurface';

const STATUS = {
  queued: 'Waiting to send',
  sending: 'Sending',
  accepted: 'Accepted by WhatsApp',
  failed: 'Not sent',
  skipped: 'Skipped',
};
const KIND = { receipt: 'Receipt', reminder: 'Payment reminder' };
const RECEIPT_TEMPLATE = 'Hi {{1}}, thank you for shopping at {{2}}. Your receipt {{3}} for {{4}} is here: {{5}}';
const REMINDER_TEMPLATE = 'Hi {{1}}, this is a reminder from {{2}}: invoice {{3}} has {{4}} outstanding, due on {{5}}.';
const empty = { display_name: 'WhatsApp Business', sender_id: '', api_key: '', receipt_template: '', reminder_template: '', language: 'en', graph_version: '' };
const META = {
  apps: 'https://developers.facebook.com/apps',
  settings: 'https://business.facebook.com/latest/settings',
  numbers: 'https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers',
  templates: 'https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview',
  guide: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
};
const External = ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;

function CopyText({ label, text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  };
  return (
    <div className="work-stack">
      <Field label={label}><textarea className="form-input" readOnly rows={2} value={text} /></Field>
      <div className="work-inline">
        <button type="button" className="btn btn-secondary" onClick={copy}>{copied ? 'Copied' : `Copy ${label.toLowerCase()}`}</button>
      </div>
    </div>
  );
}

/**
 * Automatic WhatsApp receipts and payment reminders through the business's
 * own WhatsApp Business account. Off until switched on; sent only to customers
 * with WhatsApp permission. "Accepted by WhatsApp" is the strongest claim
 * made: it is not proof of delivery.
 */
export default function WhatsAppAutomation() {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [test, setTest] = useState({ phone: '', kind: 'receipt', sending: false, result: '', failed: false });

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await api.get('/crm-communications/whatsapp');
      setState(data);
      if (data.gateway) {
        const c = data.gateway.config || {};
        setForm({ display_name: data.gateway.display_name, sender_id: data.gateway.sender_id || '', api_key: '', receipt_template: c.receipt_template || '', reminder_template: c.reminder_template || '', language: c.language || 'en', graph_version: c.graph_version || '' });
      }
    } catch (err) {
      setError(err.message || 'WhatsApp settings could not be loaded.');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const connect = async (e) => {
    e.preventDefault();
    setSaving(true); setError(''); setNotice('');
    const config = { receipt_template: form.receipt_template.trim(), reminder_template: form.reminder_template.trim(), language: form.language.trim() || 'en', ...(form.graph_version.trim() ? { graph_version: form.graph_version.trim() } : {}) };
    const body = { provider: 'meta_cloud', type: 'whatsapp', display_name: form.display_name.trim() || 'WhatsApp Business', sender_id: form.sender_id.trim(), is_active: true, is_default: true, config, ...(form.api_key ? { api_key: form.api_key.trim() } : {}) };
    try {
      if (state?.gateway) await api.put(`/crm-communications/gateways/${state.gateway.id}`, body);
      else await api.post('/crm-communications/gateways', body);
      setEditing(false);
      setNotice('WhatsApp account saved.');
      await load();
    } catch (err) {
      setError(err.message || 'The account could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (key, value) => {
    setSaving(true); setError(''); setNotice('');
    try {
      const next = { receipts: state.receipts, reminders: state.reminders, [key]: value };
      await api.put('/crm-communications/whatsapp/settings', next);
      setState((s) => ({ ...s, ...next }));
      setNotice(value ? `${key === 'receipts' ? 'Automatic receipts' : 'Payment reminders'} switched on.` : 'Switched off. Messages already waiting will be skipped.');
    } catch (err) {
      setError(err.message || 'The setting could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async (e) => {
    e.preventDefault();
    setTest((t) => ({ ...t, sending: true, result: '', failed: false }));
    try {
      const res = await api.post('/crm-communications/whatsapp/test', { phone: test.phone, kind: test.kind });
      setTest((t) => ({ ...t, sending: false, result: `Accepted by WhatsApp for ${res.to}, using ${res.template}. Check that phone.` }));
      await load();
    } catch (err) {
      setTest((t) => ({ ...t, sending: false, failed: true, result: err.message || 'The test message could not be sent.' }));
    }
  };

  if (!state && !error) return <p className="workspace-status">Loading WhatsApp settings…</p>;
  const connected = !!state?.gateway;
  const showForm = !connected || editing;
  const templates = state?.gateway?.config || {};
  const testKinds = ['receipt', 'reminder'].filter((k) => templates[`${k}_template`]);

  return (
    <div className="work-stack whatsapp-automation">
      <p>
        Send receipts and payment reminders automatically from <strong>your own WhatsApp Business account</strong>. Messages go only to
        customers who have given WhatsApp permission (record it in <Link to="/customer-segments">Segments &amp; Follow-ups</Link>, choosing WhatsApp).
        Each kind stays off until you switch it on. Meta charges your account for each message.
      </p>
      {error && <p role="alert" className="work-error">{error}</p>}
      {notice && <p role="status" className="workspace-status">{notice}</p>}

      <section className="work-panel" aria-labelledby="wa-meta">
        <h2 id="wa-meta">1. Set up WhatsApp in Meta</h2>
        <details open={!connected}>
          <summary>What to do in Meta, about 20 minutes once your business is verified</summary>
          <ol className="work-stack">
            <li>In the <External href={META.apps}>Meta App Dashboard</External>, create an app and choose the <strong>WhatsApp</strong> use case, under your business portfolio. Meta may ask you to verify the business first.</li>
            <li>On the app's <strong>API Setup</strong> page, add your shop's phone number (<External href={META.numbers}>Meta's guide</External>). Copy the <strong>Phone number ID</strong> shown for it; you paste it in step 3.</li>
            <li>In <External href={META.settings}>Business Settings</External>, open <strong>System users</strong>, add one, and assign it your app and your WhatsApp account with full control. Then choose <strong>Generate token</strong> with the permissions <code>business_management</code>, <code>whatsapp_business_messaging</code> and <code>whatsapp_business_management</code>. Copy the token straight away: Meta shows it once.</li>
            <li>Meta charges your WhatsApp account for each message, so add a payment method in WhatsApp Manager when Meta asks for one.</li>
          </ol>
          <p className="workspace-status">Meta's own walkthrough: <External href={META.guide}>WhatsApp Cloud API, get started</External>.</p>
        </details>
      </section>

      <section className="work-panel" aria-labelledby="wa-templates">
        <h2 id="wa-templates">2. Create the message templates in Meta</h2>
        <p className="workspace-status">In WhatsApp Manager, create each as a <strong>Utility</strong> template with this text, then wait for Meta to approve it (<External href={META.templates}>about templates</External>). Note the name you give each one.</p>
        <CopyText label="Receipt template text" text={RECEIPT_TEMPLATE} />
        <p className="workspace-status">{'{1}'} customer's first name · {'{2}'} shop name · {'{3}'} receipt number · {'{4}'} total · {'{5}'} private receipt link (30 days)</p>
        <CopyText label="Reminder template text" text={REMINDER_TEMPLATE} />
        <p className="workspace-status">{'{1}'} first name · {'{2}'} shop name · {'{3}'} invoice number · {'{4}'} amount outstanding · {'{5}'} due date</p>
      </section>

      <section className="work-panel" aria-labelledby="wa-account">
        <h2 id="wa-account">3. Connect your WhatsApp Business account</h2>
        {connected && !editing && (
          <div className="work-stack">
            <p className="workspace-status">
              Connected: <strong>{state.gateway.display_name}</strong> · phone number ID {state.gateway.sender_id}
              {' · '}receipt template {state.gateway.config?.receipt_template || 'not set'} · reminder template {state.gateway.config?.reminder_template || 'not set'}
            </p>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>Change account details</button>
          </div>
        )}
        {showForm && (
          <form className="work-stack" onSubmit={connect}>
            <p className="workspace-status">The Phone number ID and token from step 1, and the template names from step 2. The token is stored for sending and never shown again.</p>
            <Field label="Name"><input className="form-input" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></Field>
            <Field label="Phone number ID"><input className="form-input" required inputMode="numeric" value={form.sender_id} onChange={(e) => setForm({ ...form, sender_id: e.target.value })} /></Field>
            <Field label={connected ? 'Permanent access token (leave blank to keep the current one)' : 'Permanent access token'}>
              <input className="form-input" type="password" autoComplete="off" required={!connected} value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
            </Field>
            <Field label="Approved receipt template name"><input className="form-input" placeholder="order_receipt" value={form.receipt_template} onChange={(e) => setForm({ ...form, receipt_template: e.target.value })} /></Field>
            <Field label="Approved reminder template name"><input className="form-input" placeholder="payment_reminder" value={form.reminder_template} onChange={(e) => setForm({ ...form, reminder_template: e.target.value })} /></Field>
            <Field label="Template language code"><input className="form-input" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} /></Field>
            <div className="work-inline">
              <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save account'}</button>
              {editing && <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>}
            </div>
          </form>
        )}
      </section>

      <section className="work-panel" aria-labelledby="wa-test">
        <h2 id="wa-test">4. Send yourself a test</h2>
        {!connected ? (
          <p className="workspace-status">Connect the account first.</p>
        ) : !testKinds.length ? (
          <p className="workspace-status">Add an approved template name in step 3 first.</p>
        ) : (
          <form className="work-stack" onSubmit={sendTest}>
            <p className="workspace-status">Sends one message with sample values to the number you enter. It is a real message: Meta charges for it.</p>
            <Field label="Send the test to"><input className="form-input" type="tel" required placeholder="024 123 4567" value={test.phone} onChange={(e) => setTest({ ...test, phone: e.target.value })} /></Field>
            <Field label="Message to test">
              <select className="form-input" value={testKinds.includes(test.kind) ? test.kind : testKinds[0]} onChange={(e) => setTest({ ...test, kind: e.target.value })}>
                {testKinds.map((k) => <option key={k} value={k}>{KIND[k]}</option>)}
              </select>
            </Field>
            <div className="work-inline">
              <button className="btn btn-primary" disabled={test.sending}>{test.sending ? 'Sending…' : 'Send test message'}</button>
            </div>
            {test.result && <p role={test.failed ? 'alert' : 'status'} className={test.failed ? 'work-error' : 'workspace-status'}>{test.result}</p>}
          </form>
        )}
      </section>

      <section className="work-panel" aria-labelledby="wa-auto">
        <h2 id="wa-auto">5. Choose what is sent automatically</h2>
        <label className="work-inline">
          <input type="checkbox" checked={!!state?.receipts} disabled={saving || !state} onChange={(e) => toggle('receipts', e.target.checked)} />
          Send a receipt when a customer's sale is completed
        </label>
        <label className="work-inline">
          <input type="checkbox" checked={!!state?.reminders} disabled={saving || !state} onChange={(e) => toggle('reminders', e.target.checked)} />
          Remind customers two days before an invoice is due (sent at 9:00)
        </label>
      </section>

      <section className="work-panel" aria-labelledby="wa-log">
        <div className="work-row-head">
          <h2 id="wa-log">Recent WhatsApp messages</h2>
          <button type="button" className="btn btn-secondary" onClick={load}>Refresh</button>
        </div>
        <p className="workspace-status">"Accepted by WhatsApp" means Meta took the message. It is not proof that it was delivered or read.</p>
        {!state?.recent?.length ? (
          <p className="workspace-status">No automatic messages yet.</p>
        ) : (
          <div className="work-table-wrap">
            <table className="work-table">
              <thead><tr><th>When</th><th>Message</th><th>Customer</th><th>Status</th></tr></thead>
              <tbody>
                {state.recent.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.created_at).toLocaleString()}</td>
                    <td>{KIND[m.kind] || m.kind}</td>
                    <td>{m.customer?.name || 'Removed customer'}</td>
                    <td><strong>{STATUS[m.status] || m.status}</strong>{m.detail && <small>{m.detail}</small>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
