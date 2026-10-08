import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import Modal from '../../components/Modal';

/**
 * The owner's end-of-day summary: a per-person switch (off until turned on)
 * and a preview of today's, built by the same server code as the 20:00 email.
 * Shown only to people who can see the whole business.
 */
export default function OwnerSummary({ fmt }) {
  const [setting, setSetting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    let active = true;
    api.get('/owner-summary').then((data) => active && setSetting(data)).catch(() => active && setSetting(null));
    return () => { active = false; };
  }, []);
  if (!setting?.eligible) return null;

  const toggle = async (enabled) => {
    setBusy(true); setError('');
    try { setSetting({ ...setting, ...(await api.put('/owner-summary', { enabled })) }); }
    catch (err) { setError(err.message || 'The setting could not be saved.'); }
    finally { setBusy(false); }
  };
  const openPreview = async () => {
    setBusy(true); setError('');
    try { setPreview(await api.get('/owner-summary/preview')); }
    catch (err) { setError(err.message || "Today's summary could not be built."); }
    finally { setBusy(false); }
  };
  const p = preview?.pending;
  const waiting = p ? [
    [p.tillReviews, 'till handovers to review'], [p.returnInspections, 'returned items to inspect'], [p.investigations, 'open investigations'],
    [p.deliveries, 'deliveries expected'], [p.billsDue, 'supplier bills due'],
  ].filter(([n]) => n > 0) : [];

  return (
    <div className="owner-summary">
      <h2>End-of-day summary</h2>
      {/* A switch rather than a checkbox: an on/off setting, and a 44px
          target on a phone like the app's other buttons. */}
      <button
        type="button"
        role="switch"
        aria-checked={!!setting.enabled}
        aria-label="Email me an end-of-day summary at 20:00"
        className="btn btn-secondary"
        disabled={busy}
        onClick={() => toggle(!setting.enabled)}
      >
        Email me an end-of-day summary at 20:00: <strong>{setting.enabled ? 'On' : 'Off'}</strong>
      </button>
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={openPreview}>Preview today's summary</button>
      {error && <p role="alert" className="work-error">{error}</p>}
      <Modal isOpen={!!preview} onClose={() => setPreview(null)} title={`Today at ${preview?.business?.name || 'your business'}`}>
        {preview && (
          <div className="work-stack">
            <section>
              <h3>Sales</h3>
              <p>{preview.sales.count} sales · {fmt(preview.sales.gross)}{preview.sales.refundCount ? ` · ${preview.sales.refundCount} refunds −${fmt(preview.sales.refunds)}` : ''}</p>
              <p><strong>Net {fmt(preview.sales.net)}</strong></p>
              {preview.branches.length > 1 && <ul>{preview.branches.map((b) => <li key={b.name}>{b.name}: {b.count} · {fmt(b.sales - b.refunds)}</li>)}</ul>}
            </section>
            <section>
              <h3>Tills</h3>
              {preview.tills.length ? <ul>{preview.tills.map((t, i) => (
                <li key={i}>{t.branch} · {t.register || 'Till'}: expected {fmt(t.expected)}, counted {fmt(t.counted)}, {t.variance === 0 ? 'balanced' : t.variance > 0 ? `over ${fmt(t.variance)}` : `short ${fmt(-t.variance)}`}</li>
              ))}</ul> : <p>No till closed yet today.</p>}
              {preview.openTills.length > 0 && <p><strong>Still open:</strong> {preview.openTills.map((t) => t.branch).join(', ')}</p>}
            </section>
            <section>
              <h3>Stock</h3>
              {preview.lowStock.count ? <ul>{preview.lowStock.items.map((item, i) => <li key={i}>{item.name} ({item.branch}): {item.quantity} left</li>)}</ul> : <p>Nothing is running low.</p>}
              {preview.lowStock.count > preview.lowStock.items.length && <p className="workspace-status">and {preview.lowStock.count - preview.lowStock.items.length} more</p>}
            </section>
            <section>
              <h3>Needs attention</h3>
              {waiting.length ? <ul>{waiting.map(([n, label]) => <li key={label}>{n} {label}</li>)}</ul> : <p>Nothing is waiting.</p>}
            </section>
          </div>
        )}
      </Modal>
    </div>
  );
}
