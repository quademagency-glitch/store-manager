import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthContext } from '../lib/AuthContext';
import { api } from '../lib/api';
import Modal from '../components/Modal';
import { useToast } from '../hooks/useToast';
import LetterheadRenderer, { LetterheadFooter } from '../components/LetterheadRenderer';
import { usePrintDocument } from '../hooks/usePrintDocument';
import { useCurrency } from '../hooks/useCurrency';
import '../styles/returns.css';

const money = n => Math.round((Number(n) + Number.EPSILON) * 100);
const lineRefund = (item, quantity) => (Math.round(money(item.line_total) * (item.returned_quantity + quantity) / item.quantity)
  - Math.round(money(item.line_total) * item.returned_quantity / item.quantity)) / 100;

export default function Returns() {
  const { hasPermission, activeLocationId } = useAuthContext();
  const allowed = hasPermission('manage_returns');
  const toast = useToast();
  const { business, printElement } = usePrintDocument();
  const { fmt } = useCurrency(business);
  const [params] = useSearchParams();
  const linkedSale = params.get('sale');
  const generation = useRef(0);
  const request = useRef(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [sale, setSale] = useState(null);
  const [items, setItems] = useState({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const doubleMode = business?.qr_tracking_mode === 'double';

  useEffect(() => {
    const current = ++generation.current;
    setSale(null); setResults([]); setReceipt(null); setItems({}); setReason(''); setError(''); setRetry(false);
    request.current = null;
    if (linkedSale && allowed && activeLocationId) {
      setBusy(true);
      api.get(`/returns/sale/${linkedSale}`).then(data => {
        if (generation.current === current) setSale(data);
      }).catch(err => { if (generation.current === current) setError(err.message); })
        .finally(() => { if (generation.current === current) setBusy(false); });
    } else setBusy(false);
    return () => { generation.current += 1; };
  }, [linkedSale, allowed, activeLocationId]);

  async function search(e) {
    e.preventDefault();
    const current = generation.current;
    setBusy(true); setError('');
    try {
      const data = await api.get(`/returns/search?query=${encodeURIComponent(query.trim())}`);
      if (current !== generation.current) return;
      setResults(data); if (!data.length) setError('No completed sales found in this branch.');
    } catch (err) { if (current === generation.current) setError(err.message); }
    finally { if (current === generation.current) setBusy(false); }
  }
  async function open(id) {
    const current = generation.current;
    setBusy(true); setError('');
    try {
      const data = await api.get(`/returns/sale/${id}`);
      if (current !== generation.current) return;
      setSale(data); setItems({}); setReason(''); setRetry(false); request.current = null;
    } catch (err) { if (current === generation.current) setError(err.message); }
    finally { if (current === generation.current) setBusy(false); }
  }
  function quantity(item, value) {
    const count = Math.max(0, Math.min(item.returnable_quantity, Math.floor(Number(value) || 0)));
    setItems(prev => ({ ...prev, [item.id]: Array.from({ length: count }, (_, i) => prev[item.id]?.[i] || { item_code: '', pack_code: '', serial_number: '' }) }));
  }
  function scan(id, index, field, value) {
    setItems(prev => ({ ...prev, [id]: prev[id].map((entry, i) => i === index ? { ...entry, [field]: value } : entry) }));
  }
  const selectedCount = Object.values(items).reduce((sum, scans) => sum + scans.length, 0);
  const total = (sale?.sale_items || []).reduce((sum, item) => sum + lineRefund(item, items[item.id]?.length || 0), 0);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const current = generation.current;
    request.current ||= {
      sale_id: sale.id, operation_id: crypto.randomUUID(), reason: reason.trim(),
      items: sale.sale_items.filter(item => items[item.id]?.length).map(item => ({
        sale_item_id: item.id, quantity: items[item.id].length,
        scans: item.tracked ? items[item.id] : [],
      })),
    };
    setBusy(true); setError('');
    try {
      const data = await api.post('/returns', request.current);
      if (current !== generation.current) return;
      setReceipt({ ...data, receiptNumber: sale.receipt_number || sale.id.slice(0,8), customer: sale.customer?.name || 'Walk-in Customer' });
      setSale(null); setResults([]); setRetry(false); request.current = null;
      toast.success('Return recorded. Refund details are on the refund note.');
    } catch (err) {
      if (current !== generation.current) return;
      setError(err.message);
      // A lost response may have committed. Keep the exact request for retry.
      // Deliberate validation failures did not commit and can be corrected.
      if (err.status >= 400 && err.status < 500 && err.status !== 409) { request.current = null; setRetry(false); }
      else setRetry(true);
    } finally { if (current === generation.current) setBusy(false); }
  }
  if (!allowed) return <div className="container"><h1>Access denied</h1><p>You need permission to manage returns.</p></div>;
  return <div className="container returns-page">
    <h1 className="dashboard-title">Returns & Reversals</h1>
    <p className="text-muted">Return sold goods, restore stock and record refunds to the original payment sources.</p>
    {!activeLocationId && <p className="alert alert-warning">Select a branch to process returns.</p>}
    <form onSubmit={search} className="returns-search flex gap-md mb-lg">
      <input aria-label="Find receipt" className="form-input" style={{ flex: 1 }} value={query} onChange={e => setQuery(e.target.value)} placeholder="Receipt number, customer name or phone" />
      <button className="btn btn-primary" disabled={busy || !query.trim() || !activeLocationId}>{busy ? 'Loading…' : 'Search'}</button>
    </form>
    {error && !sale && <p role="alert" className="alert alert-error">{error}</p>}
    {results.length > 0 && <div className="data-table-wrapper"><table className="data-table"><thead><tr><th>Receipt</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th></tr></thead><tbody>
      {results.map(row => <tr key={row.id}><td><button className="btn btn-link" disabled={busy} onClick={() => open(row.id)}>{row.receipt_number || row.id.slice(0,8)}</button></td><td>{row.customers?.name || 'Walk-in Customer'}</td><td>{new Date(row.created_at).toLocaleDateString()}</td><td>{fmt(row.total_amount)}</td><td>{row.return_status === 'full' ? 'Fully returned' : row.return_status === 'partial' ? 'Partly returned' : 'Completed'}</td></tr>)}
    </tbody></table><p className="text-muted">Up to 100 recent matches. Narrow your search if needed.</p></div>}
    <Modal isOpen={!!sale} onClose={() => !busy && !retry && setSale(null)} title="Process Return" size="lg">
      {sale && <form onSubmit={submit}>
        <p>Receipt #{sale.receipt_number || sale.id.slice(0,8)} · {sale.customer?.name || 'Walk-in Customer'}</p>
        {error && <p role="alert" className="alert alert-error">{error}</p>}
        {retry && <p className="alert alert-warning">The result is unconfirmed. Retry this same return to retrieve its saved result safely.</p>}
        {sale.status !== 'completed' && <p className="alert alert-warning">Only completed sales can be returned.</p>}
        <fieldset className="return-fields" disabled={busy || retry}>
          {sale.sale_items.map(item => <div className="return-item-card" key={item.id}>
            <strong>{item.product?.name}</strong><p className="text-muted">{item.quantity} purchased · {item.returned_quantity} already returned · {item.returnable_quantity} remaining</p>
            <div className="return-quantity-row"><label htmlFor={`qty-${item.id}`}>Return quantity</label>
            <input id={`qty-${item.id}`} className="form-input" type="number" min="0" max={item.returnable_quantity} step="1" value={items[item.id]?.length || 0} onChange={e => quantity(item, e.target.value)} style={{ width: 90 }} />
            <span>Refund: <strong>{fmt(lineRefund(item, items[item.id]?.length || 0))}</strong></span></div>
            {item.tracked && (items[item.id] || []).map((entry, index) => <div key={index} className="return-scan-row">
              <span>Unit {index + 1}</span>
              {(doubleMode ? ['pack_code','serial_number','item_code'] : ['item_code']).map(field => <label key={field}>{({ item_code: 'Item code', pack_code: 'Pack code', serial_number: 'Serial number' })[field]}<input className="form-input" aria-label={`${item.product?.name} unit ${index + 1} ${field.replaceAll('_',' ')}`} required value={entry[field]} onChange={e => scan(item.id, index, field, e.target.value)} placeholder="Scan or enter code" /></label>)}
            </div>)}
          </div>)}
          <label className="return-reason-label" htmlFor="return-reason">Reason for return</label><textarea id="return-reason" className="form-input" required maxLength={1000} rows={3} style={{ width: '100%' }} value={reason} onChange={e => setReason(e.target.value)} />
        </fieldset>
        <p className="text-muted">Refunds include the original discount and tax. Credit and points are restored proportionally. Pay the cash or payment-provider amount shown on the refund note separately.</p>
        <div className="return-actions flex justify-between items-center mt-lg"><strong>Total refund: {fmt(total)}</strong><div className="flex gap-sm">
          <button type="button" className="btn btn-secondary" disabled={busy || retry} onClick={() => setSale(null)}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !selectedCount || !reason.trim() || sale.status !== 'completed'}>{busy ? 'Recording…' : retry ? 'Retry same return' : 'Record Return'}</button>
        </div></div>
      </form>}
    </Modal>
    <Modal isOpen={!!receipt} onClose={() => setReceipt(null)} title="Refund Note">
      {receipt && <><div id="refund-receipt-print-area" className="printable-area refund-note">
        <LetterheadRenderer letterhead={business?.letterhead} logoUrl={business?.logo_url} businessName={business?.name} />
        <h2>Refund Note</h2><p>Original receipt: {receipt.receiptNumber}<br />Customer: {receipt.customer}<br />Date: {new Date(receipt.refund.created_at).toLocaleString()}</p>
        <table className="data-table"><thead><tr><th>Item</th><th>Quantity</th><th>Refund</th></tr></thead><tbody>{receipt.items.map(item => <tr key={item.id}><td>{item.product?.name}</td><td>{item.quantity}</td><td>{fmt(item.refund_amount)}</td></tr>)}</tbody></table>
        <p><strong>Total refund: {fmt(receipt.refund.total_refund_amount)}</strong></p>
        <p>Refund via {receipt.refund.refund_method}: {fmt(receipt.refund.payment_refund_amount)}</p>
        <p>Store credit restored: {fmt(receipt.refund.credit_refund_amount)}<br />Points restored: {receipt.refund.points_refund} ({fmt(receipt.refund.points_refund_value)})</p>
        <p>Reason: {receipt.refund.reason}</p><p className="text-muted">Staff must issue the cash or payment-provider refund separately. This note is the return record.</p>
        <LetterheadFooter letterhead={business?.letterhead} />
      </div><div className="flex justify-end gap-md"><button className="btn btn-secondary" onClick={() => setReceipt(null)}>Close</button><button className="btn btn-primary" onClick={() => printElement('refund-receipt-print-area', 'a4')}>Print Refund Note</button></div></>}
    </Modal>
  </div>;
}
