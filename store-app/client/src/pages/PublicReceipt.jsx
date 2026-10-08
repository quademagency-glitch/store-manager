import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { API_BASE } from '../lib/api';
import { useCurrency } from '../hooks/useCurrency';

const PAYMENT = { cash: 'Cash', card: 'Card', mobile: 'Mobile Money', transfer: 'Bank transfer' };
const date = (value) => (value ? new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

/**
 * /r/:token, a receipt a shop has shared with its customer. No account and no
 * app chrome. It never sends the staff session: the request carries no
 * Authorization header, so a signed-in device does not change what is shown.
 * Excluded from product analytics and Speed Insights (the token is a secret).
 */
export default function PublicReceipt() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/public/receipts/${encodeURIComponent(token)}`, { credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!active) return;
        setState(res.ok ? { data: body } : { error: body.error || 'This receipt could not be loaded.' });
      })
      .catch(() => active && setState({ error: 'This receipt could not be loaded. Check your connection and try again.' }));
    return () => { active = false; };
  }, [token]);

  const { fmt } = useCurrency(state.data ? { currency: state.data.business.currency } : null);

  if (state.loading) return <main className="public-receipt"><p className="public-receipt-note">Loading receipt…</p></main>;
  if (state.error) {
    return (
      <main className="public-receipt">
        <section className="public-receipt-card">
          <h1>Receipt unavailable</h1>
          <p>{state.error}</p>
          <p className="public-receipt-note">Ask the shop to send you a new link.</p>
        </section>
      </main>
    );
  }

  const { business, receipt, expires_at: expiresAt } = state.data;
  const cancelled = receipt.status === 'voided';
  return (
    <main className="public-receipt">
      <section className="public-receipt-card printable-area" aria-labelledby="public-receipt-title">
        <header>
          <h1 id="public-receipt-title">{business.name}</h1>
          {business.phone && <p className="public-receipt-note">{business.phone}</p>}
        </header>
        {cancelled && <p role="status" className="public-receipt-cancelled">This sale was cancelled by the shop.</p>}
        <dl className="public-receipt-meta">
          <div><dt>Receipt</dt><dd>{receipt.receipt_number}</dd></div>
          <div><dt>Date</dt><dd>{date(receipt.created_at)}</dd></div>
        </dl>
        <table className="public-receipt-lines">
          <thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead>
          <tbody>
            {receipt.items.map((item, i) => (
              <tr key={i}>
                <td>{item.name}</td>
                <td>{item.quantity}</td>
                <td>{fmt(Number(item.unit_price) * Number(item.quantity))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="public-receipt-totals">
          {receipt.subtotal != null && <div><dt>Subtotal</dt><dd>{fmt(receipt.subtotal)}</dd></div>}
          {Number(receipt.tax_amount) > 0 && <div><dt>{receipt.tax_label || 'Tax'}</dt><dd>{fmt(receipt.tax_amount)}</dd></div>}
          {Number(receipt.rewards_applied) > 0 && <div><dt>Rewards applied</dt><dd>−{fmt(receipt.rewards_applied)}</dd></div>}
          <div className="public-receipt-total"><dt>Total</dt><dd>{fmt(receipt.total_amount)}</dd></div>
          {receipt.payment_method && <div><dt>Paid by</dt><dd>{PAYMENT[receipt.payment_method] || receipt.payment_method}</dd></div>}
          {Number(receipt.change_due) > 0 && <div><dt>Change</dt><dd>{fmt(receipt.change_due)}</dd></div>}
        </dl>
        <footer className="public-receipt-note">
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>Print or save</button>
          <p>This link was shared by {business.name} and stops working on {date(expiresAt)}.</p>
        </footer>
      </section>
    </main>
  );
}
