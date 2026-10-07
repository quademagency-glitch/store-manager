import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../lib/api';
import { useRecordedAction } from '../../../hooks/useRecordedAction';
import { ErrorBanner } from '../../../components/ui';

export default function PurchaseBilling({ order, fmt }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const load = useCallback(async () => {
    try { setData(await api.get(`/purchase-orders/${order.id}/billing`)); setError(''); }
    catch(err) { setData(null); setError(err.message); }
  }, [order.id]);
  useEffect(()=>{load();},[load]);
  const action = useRecordedAction(`retail:bill:${order.id}`, async () => {setAmount(''); await load();});
  return <section className="workspace-panel">
    <h3>Receiving & supplier payment</h3>
    <div className="workspace-timeline"><span>Ordered {fmt(order.total_amount)}</span><span>Received {data ? fmt(data.received) : '…'}</span><span>Billed {data ? fmt(data.billed) : '…'}</span><span>Paid {data ? fmt(data.paid) : '…'}</span></div>
    <ErrorBanner error={error} onRetry={load}/><ErrorBanner error={action.error}/>
    {action.pending && <p role="status">A bill request needs confirmation. <button className="btn btn-secondary" disabled={action.busy} onClick={action.retry}>Retry saved bill request</button></p>}
    {data && <>
      <p>Received value remaining to bill: <strong>{fmt(data.unbilled)}</strong>. Add a bill for accepted goods, then record the supplier payment in Accounts Payable.</p>
      {data.unbilled > 0 && <form className="workspace-form-grid" onSubmit={e=>{e.preventDefault();action.run(`/purchase-orders/${order.id}/bills`,{amount:Number(amount),due_date:dueDate || null,description:description || `Received goods for ${order.po_number}`});}}>
        <label>Supplier bill amount<input className="form-input" type="number" required min="0.01" max={data.unbilled} step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} /></label>
        <label>Due date<input className="form-input" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>
        <label>Supplier invoice reference<input className="form-input" maxLength={1000} value={description} onChange={e=>setDescription(e.target.value)}/></label>
        <button className="btn btn-primary" disabled={!action.ready || action.busy || !!action.pending}>Create supplier bill</button>
      </form>}
      <Link className="workspace-link" to={`/accounts-payable?purchase_order_id=${encodeURIComponent(order.id)}`}>View bills & record payment</Link>
    </>}
  </section>;
}
