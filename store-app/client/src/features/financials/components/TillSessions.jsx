import { useCallback, useEffect, useState, useRef } from 'react';
import { useAuthContext } from '../../../lib/AuthContext';
import { api } from '../../../lib/api';
import { useRecordedAction } from '../../../hooks/useRecordedAction';
import { ErrorBanner } from '../../../components/ui';
import { taskStart, trackTask } from '../../../lib/analytics';

const DENOMINATIONS = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1];
const delta = (snapshot, start, key) => Number(snapshot?.[key] || 0) - Number(start?.[key] || 0);
export default function TillSessions({ fmt, currency, printElement }) {
  const { activeLocationId, hasPermission } = useAuthContext();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState('');
  const [name, setName] = useState('Main drawer');
  const [counted, setCounted] = useState('');
  const [counts, setCounts] = useState({});
  const [note, setNote] = useState('');
  const [movement, setMovement] = useState('');
  const [movementNote, setMovementNote] = useState('');
  const [reviewNotes, setReviewNotes] = useState({});
  const requestId = useRef(0);
  const closeStartedAt = useRef(null); // anonymous timing: starting the count to recording the close
  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true); setError('');
    try { const response = await api.get('/till-sessions'); if (id === requestId.current) setData(response); }
    catch (err) { if (id === requestId.current) {setData(null); setError(err.message);} }
    finally { if (id === requestId.current) setLoading(false); }
  }, []);
  useEffect(() => { setData(null); setCounted(''); setCounts({}); setNote(''); setOpening(''); setMovement(''); setMovementNote(''); load(); }, [activeLocationId, load]);
  const action = useRecordedAction('retail:till', async (_response, request) => { if (request.body?.action === 'close') { trackTask('till_close', closeStartedAt.current); closeStartedAt.current = null; } setNote(''); setCounted(''); setCounts({}); setMovement(''); setMovementNote(''); await load(); window.dispatchEvent(new Event('quaderp:till-updated')); });
  const current = data?.sessions?.find(row => row.status === 'open');
  const expected = current ? Number(current.opening_float) + delta(data.snapshot, current.opening_snapshot, 'cash_sales') + delta(data.snapshot, current.opening_snapshot, 'cash_in') - delta(data.snapshot, current.opening_snapshot, 'cash_out') - delta(data.snapshot, current.opening_snapshot, 'cash_refunds') : 0;
  const locked = action.busy || !!action.pending || !action.ready || loading;
  const post = values => action.run('/till-sessions', values);
  return <section className="workspace-panel" aria-label="Till sessions">
    <h2>Open, count & hand over</h2>
    <p className="workspace-status">One shared cash drawer per branch. All cashiers’ recorded cash activity is included. Card and MoMo totals are records, not provider settlement confirmations.</p>
    <ErrorBanner error={error} onRetry={load} /><ErrorBanner error={action.error} />
    {action.pending && <div className="alert alert-warning" role="status">A till action is saved on this device. Confirm its result before starting another.<button className="btn btn-secondary" disabled={action.busy} onClick={action.retry}>Retry saved action</button></div>}
    {loading && <p role="status">Loading till sessions…</p>}
    {data && !current && <form className="workspace-form-grid" onSubmit={e => { e.preventDefault(); post({ action: 'open', register_name: name, opening_float: Number(opening) }); }}>
      <label>Drawer name<input required maxLength={80} className="form-input" value={name} onChange={e => setName(e.target.value)} disabled={locked} /></label>
      <label>Opening cash float<input required type="number" min="0" step="0.01" className="form-input" value={opening} onChange={e => setOpening(e.target.value)} disabled={locked} /></label>
      <button className="btn btn-primary" disabled={locked}>Open till</button>
    </form>}
    {current && <>
      <p><strong>{current.register_name}</strong> · Opened by {current.opener?.name || 'recorded operator'} on {new Date(current.opened_at).toLocaleString()}</p>
      <div className="workspace-metrics"><div>Opening float<strong>{fmt(current.opening_float)}</strong></div><div>Expected cash now<strong>{fmt(expected)}</strong></div><div>Card recorded<strong>{fmt(delta(data.snapshot,current.opening_snapshot,'card_recorded'))}</strong></div><div>MoMo recorded<strong>{fmt(delta(data.snapshot,current.opening_snapshot,'momo_recorded'))}</strong></div></div>
      <button className="btn btn-secondary btn-sm" onClick={load} disabled={locked}>Refresh cash position</button>
      {hasPermission('manage_financials') && <form className="workspace-toolbar" onSubmit={e => { e.preventDefault(); const direction = e.nativeEvent.submitter?.value || 'cash_in'; post({action:direction,session_id:current.id,amount:Number(movement),note:movementNote}); }}>
        <label>Cash movement<input className="form-input" required type="number" step="0.01" min="0.01" value={movement} onChange={e => setMovement(e.target.value)} disabled={locked} /></label>
        <label>Reason / deposit reference<input className="form-input" required minLength={3} value={movementNote} onChange={e => setMovementNote(e.target.value)} disabled={locked} /></label>
        <button className="btn btn-secondary" value="cash_in" disabled={locked}>Record cash in</button><button className="btn btn-secondary" value="cash_out" disabled={locked}>Record bank deposit</button>
      </form>}
      <form onFocusCapture={() => { closeStartedAt.current ??= taskStart(); }} onSubmit={e => { e.preventDefault(); post({action:'close',session_id:current.id,counted_cash:Number(counted),denominations:counts,note}); }}>
        {currency === 'GHS' && <details><summary>Count Ghana cedi notes and coins</summary><div className="workspace-form-grid">{DENOMINATIONS.map(value => <label key={value}>{fmt(value)}<input className="form-input" type="number" min="0" step="1" value={counts[value] ?? ''} disabled={locked} onChange={e => { const next={...counts,[value]:Number(e.target.value)}; setCounts(next); setCounted(Object.entries(next).reduce((sum,[denomination,qty])=>sum+Number(denomination)*qty,0).toFixed(2)); }} /></label>)}</div></details>}
        <div className="workspace-toolbar"><label>Actual cash counted<input className="form-input" type="number" required min="0" step="0.01" value={counted} onChange={e => { setCounted(e.target.value); setCounts({}); }} disabled={locked} /></label><label>Handover / variance explanation<input className="form-input" required={counted !== '' && Math.round(Number(counted)*100) !== Math.round(expected*100)} minLength={5} value={note} onChange={e => setNote(e.target.value)} disabled={locked} /></label><button className="btn btn-primary" disabled={locked}>Close till & record count</button></div>
        {counted !== '' && <p role="status">Difference from current expected cash: {fmt(Number(counted)-expected)}. The server checks the latest recorded cash when you close.</p>}
      </form>
    </>}
    {data?.sessions?.some(row => row.status !== 'open') && <details><summary>Recent handovers</summary>{data.sessions.filter(row => row.status !== 'open').map(row => <article className="workspace-panel" id={`handover-${row.id}`} key={row.id}><h3>{row.register_name} · {new Date(row.closed_at).toLocaleString()}</h3><p>Opened by {row.opener?.name || row.opened_by} · Closed by {row.closer?.name || row.closed_by}</p><p>Expected {fmt(row.expected_cash)} · Counted {fmt(row.counted_cash)} · Variance {fmt(row.variance)}</p><p>{row.closing_note || 'No variance recorded.'}</p><p>Status: {row.status}{row.reviewed_at ? ` · Reviewed by ${row.reviewer?.name || row.reviewed_by}` : ''}</p>{row.review_note && <p>{row.review_note}</p>}<button className="btn btn-secondary" onClick={() => printElement(`handover-${row.id}`, 'a4')}>Print handover</button>{hasPermission('approve_accounting') && row.status === 'closed' && <form className="workspace-toolbar" onSubmit={e => { e.preventDefault(); post({action:'review',session_id:row.id,note:reviewNotes[row.id]}); }}><label>Review note<input required minLength={3} className="form-input" value={reviewNotes[row.id] || ''} onChange={e => setReviewNotes(previous=>({...previous,[row.id]:e.target.value}))} disabled={locked} /></label><button className="btn btn-primary" disabled={locked}>Record review</button></form>}</article>)}</details>}
  </section>;
}
