import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import { Icons } from '../../components/icons/Icons';
import { EmptyStateRow, PageHeader } from '../../components/ui';

const SCOPE_OPTIONS = [
  { value: 'read:catalog', label: 'Read Catalog (products, prices, stock)' },
  { value: 'write:orders', label: 'Create Orders' },
  { value: 'read:orders', label: 'Read Order Status' },
];

const EVENT_OPTIONS = [
  { value: 'order.status_changed', label: 'Order Status Changed' },
];

export default function Integrations() {
  const toast = useToast();
  const confirm = useConfirm();

  const [apiKeys, setApiKeys] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState([]);
  const [creatingKey, setCreatingKey] = useState(false);
  const [revealedKey, setRevealedKey] = useState(null);

  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState(null);

  const [selectedWebhookId, setSelectedWebhookId] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [keys, hooks] = await Promise.all([
        api.get('/integrations/api-keys'),
        api.get('/integrations/webhooks'),
      ]);
      setApiKeys(keys);
      setWebhooks(hooks);
    } catch (err) {
      toast.error(err.message || 'Failed to load integrations.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const toggleScope = (scope) => {
    setNewKeyScopes(prev => prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]);
  };

  const handleCreateKey = async (e) => {
    e.preventDefault();
    if (!newKeyName.trim() || newKeyScopes.length === 0) {
      toast.error('Name and at least one scope are required.');
      return;
    }
    setCreatingKey(true);
    try {
      const created = await api.post('/integrations/api-keys', { name: newKeyName, scopes: newKeyScopes });
      setRevealedKey({ name: created.name, key: created.key });
      setNewKeyName('');
      setNewKeyScopes([]);
      await loadAll();
      toast.success('API key created.');
    } catch (err) {
      toast.error(err.message || 'Failed to create API key.');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeKey = async (key) => {
    const confirmed = await confirm({
      title: 'Revoke API Key',
      message: `Revoke "${key.name}"? Any storefront using this key will immediately lose access.`,
      variant: 'danger',
      confirmText: 'Revoke',
    });
    if (!confirmed) return;
    try {
      await api.delete(`/integrations/api-keys/${key.id}`);
      toast.success('API key revoked.');
      await loadAll();
    } catch (err) {
      toast.error(err.message || 'Failed to revoke API key.');
    }
  };

  const handleCreateWebhook = async (e) => {
    e.preventDefault();
    if (!newWebhookUrl.trim()) {
      toast.error('A URL is required.');
      return;
    }
    setCreatingWebhook(true);
    try {
      const created = await api.post('/integrations/webhooks', { url: newWebhookUrl, events: ['order.status_changed'] });
      setRevealedSecret({ url: created.url, secret: created.secret });
      setNewWebhookUrl('');
      await loadAll();
      toast.success('Webhook endpoint created.');
    } catch (err) {
      toast.error(err.message || 'Failed to create webhook endpoint.');
    } finally {
      setCreatingWebhook(false);
    }
  };

  const handleToggleWebhook = async (hook) => {
    try {
      await api.put(`/integrations/webhooks/${hook.id}`, { status: hook.status === 'active' ? 'disabled' : 'active' });
      await loadAll();
    } catch (err) {
      toast.error(err.message || 'Failed to update webhook endpoint.');
    }
  };

  const handleDeleteWebhook = async (hook) => {
    const confirmed = await confirm({
      title: 'Delete Webhook Endpoint',
      message: `Delete the webhook pointed at "${hook.url}"? This cannot be undone.`,
      variant: 'danger',
      confirmText: 'Delete',
    });
    if (!confirmed) return;
    try {
      await api.delete(`/integrations/webhooks/${hook.id}`);
      if (selectedWebhookId === hook.id) { setSelectedWebhookId(null); setDeliveries([]); }
      toast.success('Webhook endpoint deleted.');
      await loadAll();
    } catch (err) {
      toast.error(err.message || 'Failed to delete webhook endpoint.');
    }
  };

  const loadDeliveries = async (hookId) => {
    setSelectedWebhookId(hookId);
    setDeliveriesLoading(true);
    try {
      const res = await api.get(`/integrations/webhooks/${hookId}/deliveries`);
      setDeliveries(res.data || []);
    } catch (err) {
      toast.error(err.message || 'Failed to load delivery log.');
    } finally {
      setDeliveriesLoading(false);
    }
  };

  const handleRetryDelivery = async (delivery) => {
    try {
      await api.post(`/integrations/webhooks/${selectedWebhookId}/deliveries/${delivery.id}/retry`, {});
      toast.success('Retry attempted.');
      await loadDeliveries(selectedWebhookId);
    } catch (err) {
      toast.error(err.message || 'Failed to retry delivery.');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', color: 'var(--color-text-muted)' }}>
        <svg className="acct-spinner" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" opacity="0.25" /><path d="M4 12a8 8 0 018-8" opacity="0.75" />
        </svg>
        <span style={{ marginLeft: '12px' }}>Loading integrations...</span>
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Ecommerce Integrations"
        subtitle="Connect an external storefront: API keys for catalog/order access, and webhooks for order status updates."
      />

      <div className="org-settings-page">

        {/* ─── API Keys ─── */}
        <div className="org-section">
          <div className="org-section-header">
            <div className="org-section-icon" aria-hidden="true">{Icons.key}</div>
            <div>
              <h2 className="org-section-title">API Keys</h2>
              <p className="org-section-subtitle">Give a storefront scoped, revocable access to your catalog and orders.</p>
            </div>
          </div>
          <div className="org-section-body">

            {revealedKey && (
              <div className="glass-panel" style={{ padding: '16px', marginBottom: '16px', border: '1px solid var(--color-warning)' }}>
                <strong>Copy this key now — it won't be shown again.</strong>
                <div className="flex gap-sm items-center mt-sm">
                  <code style={{ flex: 1, wordBreak: 'break-all', fontSize: '0.85rem' }}>{revealedKey.key}</code>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(revealedKey.key); toast.success('Copied.'); }}>Copy</button>
                  <button type="button" className="btn-icon" onClick={() => setRevealedKey(null)} title="Dismiss">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                  </button>
                </div>
              </div>
            )}

            <table className="glass-table" style={{ marginBottom: '20px' }}>
              <thead>
                <tr><th>Name</th><th>Key</th><th>Scopes</th><th>Status</th><th>Last Used</th><th className="text-right">Actions</th></tr>
              </thead>
              <tbody>
                {apiKeys.length === 0 ? (
                  <EmptyStateRow colSpan={6} icon="clipboard" title="No API keys yet" />
                ) : apiKeys.map(key => (
                  <tr key={key.id}>
                    <td>{key.name}</td>
                    <td><code>{key.key_prefix}…</code></td>
                    <td>{(key.scopes || []).map(s => <span key={s} className="badge badge-neutral badge-sm" style={{ marginRight: '4px' }}>{s}</span>)}</td>
                    <td><span className={`badge badge-sm ${key.status === 'active' ? 'badge-success' : 'badge-error'}`}>{key.status}</span></td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{key.last_used_at ? new Date(key.last_used_at).toLocaleString() : 'Never'}</td>
                    <td className="text-right">
                      {key.status === 'active' && (
                        <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-error)', border: 'none' }} onClick={() => handleRevokeKey(key)}>Revoke</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <form onSubmit={handleCreateKey} className="org-form-grid" style={{ alignItems: 'end' }}>
              <div className="form-group">
                <label htmlFor="key-name">Key Name</label>
                <input id="key-name" type="text" className="form-input" placeholder="e.g. Main Storefront" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} />
              </div>
              <div className="form-group full-width">
                <label>Scopes</label>
                <div className="flex gap-md flex-wrap">
                  {SCOPE_OPTIONS.map(opt => (
                    <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={newKeyScopes.includes(opt.value)} onChange={() => toggleScope(opt.value)} />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <button type="submit" className="btn btn-primary" disabled={creatingKey}>
                  {creatingKey ? 'Generating...' : 'Generate New Key'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ─── Webhook Endpoints ─── */}
        <div className="org-section">
          <div className="org-section-header">
            <div className="org-section-icon" aria-hidden="true">{Icons.settings}</div>
            <div>
              <h2 className="org-section-title">Webhook Endpoints</h2>
              <p className="org-section-subtitle">Get notified at a URL when an order's status changes.</p>
            </div>
          </div>
          <div className="org-section-body">

            {revealedSecret && (
              <div className="glass-panel" style={{ padding: '16px', marginBottom: '16px', border: '1px solid var(--color-warning)' }}>
                <strong>Copy this signing secret now — it won't be shown again.</strong>
                <div className="flex gap-sm items-center mt-sm">
                  <code style={{ flex: 1, wordBreak: 'break-all', fontSize: '0.85rem' }}>{revealedSecret.secret}</code>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(revealedSecret.secret); toast.success('Copied.'); }}>Copy</button>
                  <button type="button" className="btn-icon" onClick={() => setRevealedSecret(null)} title="Dismiss">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                  </button>
                </div>
              </div>
            )}

            <table className="glass-table" style={{ marginBottom: '20px' }}>
              <thead>
                <tr><th>URL</th><th>Events</th><th>Status</th><th className="text-right">Actions</th></tr>
              </thead>
              <tbody>
                {webhooks.length === 0 ? (
                  <EmptyStateRow colSpan={4} icon="clipboard" title="No webhook endpoints yet" />
                ) : webhooks.map(hook => (
                  <tr
                    key={hook.id}
                    style={{ cursor: 'pointer', background: selectedWebhookId === hook.id ? 'rgba(99,102,241,0.06)' : undefined }}
                    onClick={() => loadDeliveries(hook.id)}
                  >
                    <td style={{ fontSize: '0.85rem' }}>{hook.url}</td>
                    <td>{(hook.events || []).map(ev => <span key={ev} className="badge badge-neutral badge-sm" style={{ marginRight: '4px' }}>{ev}</span>)}</td>
                    <td><span className={`badge badge-sm ${hook.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>{hook.status}</span></td>
                    <td className="text-right" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm btn-secondary" onClick={() => handleToggleWebhook(hook)} style={{ marginRight: '6px' }}>
                        {hook.status === 'active' ? 'Disable' : 'Enable'}
                      </button>
                      <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-error)', border: 'none' }} onClick={() => handleDeleteWebhook(hook)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <form onSubmit={handleCreateWebhook} className="org-form-grid" style={{ alignItems: 'end' }}>
              <div className="form-group full-width">
                <label htmlFor="webhook-url">Endpoint URL</label>
                <input id="webhook-url" type="url" className="form-input" placeholder="https://yourstorefront.com/webhooks/quaderp" value={newWebhookUrl} onChange={e => setNewWebhookUrl(e.target.value)} />
                <p className="org-form-hint">Subscribed to: {EVENT_OPTIONS.map(e => e.label).join(', ')} (the only event available in this version).</p>
              </div>
              <div className="form-group">
                <button type="submit" className="btn btn-primary" disabled={creatingWebhook}>
                  {creatingWebhook ? 'Adding...' : 'Add Webhook'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ─── Delivery Log ─── */}
        {selectedWebhookId && (
          <div className="org-section">
            <div className="org-section-header">
              <div className="org-section-icon" aria-hidden="true">{Icons.clipboard}</div>
              <div>
                <h2 className="org-section-title">Delivery Log</h2>
                <p className="org-section-subtitle">Recent webhook delivery attempts for the selected endpoint.</p>
              </div>
            </div>
            <div className="org-section-body">
              {deliveriesLoading ? (
                <div className="table-loading"><div className="spinner"></div><p>Loading deliveries...</p></div>
              ) : (
                <table className="glass-table">
                  <thead>
                    <tr><th>Event</th><th>Status</th><th>Attempts</th><th>Response</th><th>Last Attempt</th><th className="text-right">Actions</th></tr>
                  </thead>
                  <tbody>
                    {deliveries.length === 0 ? (
                      <EmptyStateRow colSpan={6} icon="clipboard" title="No deliveries yet" />
                    ) : deliveries.map(d => (
                      <tr key={d.id}>
                        <td>{d.event}</td>
                        <td><span className={`badge badge-sm ${d.status === 'delivered' ? 'badge-success' : d.status === 'failed' ? 'badge-error' : 'badge-warning'}`}>{d.status}</span></td>
                        <td>{d.attempt_count}</td>
                        <td>{d.response_status || '—'}</td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{d.last_attempt_at ? new Date(d.last_attempt_at).toLocaleString() : '—'}</td>
                        <td className="text-right">
                          {d.status === 'failed' && (
                            <button className="btn btn-sm btn-secondary" onClick={() => handleRetryDelivery(d)}>Retry</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
