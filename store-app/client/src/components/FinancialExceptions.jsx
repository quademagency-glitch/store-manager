import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useOfflineScope } from '../hooks/useOfflineScope';
import { walletPost } from '../lib/walletOperations';
import Modal from './Modal';

const actions = {
  sale: ['confirm_settlement', 'Confirm payment from receipt evidence'],
  cost: ['confirm_cost', 'Confirm unit cost from purchase evidence'],
  commission: ['link_payout', 'Match the original payout expense'],
};
export default function FinancialExceptions() {
  const scope = useOfflineScope();
  const [page, setPage] = useState(1), [data, setData] = useState(null), [error, setError] = useState('');
  const [selected, setSelected] = useState(null), [history, setHistory] = useState([]), [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ action: 'record_evidence', note: '', evidence: '', values: {} });
  const load = useCallback(async () => {
    setError('');
    try { setData(await api.get(`/financial-reviews?page=${page}&limit=20`)); }
    catch (err) { setData(null); setError(err.message); }
  }, [page]);
  useEffect(() => { load(); }, [load]);
  async function open(row) {
    setSelected(row); setHistory([]); setError('');
    setForm({ action: 'record_evidence', note: '', evidence: '', values: {} });
    try { setHistory(await api.get(`/financial-reviews/${row.kind}/${row.record_id}`)); }
    catch (err) { setError(err.message); }
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await walletPost(scope, 'wallet:financial-review', '/financial-reviews', { ...form, values: form.action === 'confirm_settlement' ? { ...form.values, settled_at: `${form.values.settled_at}:00Z` } : form.values, kind: selected.kind, record_id: selected.record_id });
      setSelected(null); await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const field = (name, label, type = 'number') => <div className="form-group" key={name}>
    <label htmlFor={`review-${name}`}>{label}</label>
    <input id={`review-${name}`} className="input" type={type} min={type === 'number' ? '0' : undefined} step={type === 'number' ? (name === 'points' ? '1' : '0.01') : undefined}
      required value={form.values[name] ?? ''} onChange={e => setForm(p => ({ ...p, values: { ...p.values, [name]: type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value } }))} />
  </div>;
  return <section className="glass-panel mt-xl" aria-labelledby="financial-exceptions-title" style={{ padding: 'var(--space-xl)' }}>
    <h2 id="financial-exceptions-title">Historical financial review</h2>
    <p>These records need supporting evidence. Saving a note keeps the exception open. Confirming a payment, cost or payout updates that record and preserves its previous values in the review history.</p>
    {error && <p role="alert" className="alert alert-error">{error}</p>}
    {!data ? <button className="btn btn-secondary" onClick={load}>Reload exceptions</button> : <>
      <p>{data.total} exceptions across the selected branch scope.</p>
      <div style={{ overflowX: 'auto' }}><table className="glass-table"><thead><tr><th>Reference</th><th>Issue</th><th>Recorded amount</th><th>Action</th></tr></thead>
        <tbody>{data.data.map(row => <tr key={`${row.kind}:${row.record_id}`}><td>{row.reference}</td><td>{row.reason}</td><td>{row.amount ?? 'Unknown'}</td><td>
          <button className="btn btn-secondary btn-sm" disabled={!scope || scope.locationId !== row.location_id} onClick={() => open(row)}>Review</button>
        </td></tr>)}</tbody></table></div>
      {!scope && <p>Select a branch to review its records.</p>}
      <div className="flex gap-md mt-md"><button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous exceptions</button>
        <span>Page {page} of {Math.max(1, data.totalPages || 1)}</span><button className="btn btn-secondary" disabled={page >= (data.totalPages || 1)} onClick={() => setPage(p => p + 1)}>Next exceptions</button></div>
    </>}
    <Modal isOpen={!!selected} onClose={() => { if (!busy) setSelected(null); }} title="Review financial evidence">
      {selected && <form onSubmit={save}>
        <p>{selected.reference}: {selected.reason}</p>
        <label htmlFor="review-action">Review action</label>
        <select id="review-action" className="input" value={form.action} onChange={e => setForm(p => ({ ...p, action: e.target.value, values: {} }))}>
          <option value="record_evidence">Record evidence / request further review</option>
          {actions[selected.kind] && <option value={actions[selected.kind][0]}>{actions[selected.kind][1]}</option>}
        </select>
        {form.action === 'confirm_settlement' && <>
          <label htmlFor="review-method">Payment method shown on the receipt</label>
          <select id="review-method" className="input" required value={form.values.payment_method || ''} onChange={e => setForm(p => ({ ...p, values: { ...p.values, payment_method: e.target.value } }))}>
            <option value="">Select method</option><option value="cash">Cash</option><option value="card">Card</option><option value="mobile">Mobile money</option><option value="transfer">Bank transfer</option>
          </select>
          {field('amount_paid', 'Amount tendered')}{field('store_credit', 'Customer credit used')}{field('points', 'Points redeemed')}{field('points_value', 'Value of redeemed points')}
          {field('settled_at', 'Actual settlement date and time (UTC)', 'datetime-local')}
          <p>Enter zero where no rewards were used. Reward values must match the existing ledger. Receipts with earlier refunds need a joint review; their payment records cannot be changed here.</p>
        </>}
        {form.action === 'confirm_cost' && field('unit_cost', 'Actual unit cost')}
        {form.action === 'link_payout' && field('ledger_reference', 'Original expense reference', 'text')}
        {selected.kind === 'return' && <p>Provide the original receipt, returned items and payment evidence. Further refunds remain blocked until their allocation has been reconciled.</p>}
        <label htmlFor="review-evidence">Evidence reference</label><input id="review-evidence" className="input" required minLength={3} maxLength={1000} value={form.evidence} onChange={e => setForm(p => ({ ...p, evidence: e.target.value }))} />
        <label htmlFor="review-note">What was verified or remains missing?</label><textarea id="review-note" className="input" required minLength={10} maxLength={2000} value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} />
        <button className="btn btn-primary mt-md" disabled={busy}>{busy ? 'Saving…' : 'Save documented review'}</button>
        {history.length > 0 && <><h3>Previous reviews</h3><ul>{history.map(entry => <li key={entry.id}>{entry.actor?.name || 'Former staff'} · {new Date(entry.created_at).toLocaleString()}: {entry.note} (Evidence: {entry.evidence})</li>)}</ul></>}
      </form>}
    </Modal>
  </section>;
}
