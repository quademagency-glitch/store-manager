import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuthContext } from '../../lib/AuthContext';
import { useToast } from '../../hooks/useToast';
import { EmptyStateRow, PageHeader, ErrorBanner } from '../../components/ui';

/**
 * One plan, paid before use (since 8 October 2026): a one-time setup fee,
 * a year for the first branch, and a year for each additional branch, which
 * is charged in full whenever it is added. Every amount shown here comes from
 * GET /subscriptions/mine, priced on the server; checkout charges the
 * server's figure, not this page's.
 */
const MAX_BRANCHES = 100;
const formatMoney = (amount, currency = 'GHS') =>
  new Intl.NumberFormat('en-GH', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount || 0);
const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const branchWord = (n) => `${n} branch${n === 1 ? '' : 'es'}`;
const clampBranches = (value) => Math.min(MAX_BRANCHES, Math.max(1, Math.floor(Number(value) || 1)));

function Lines({ lines, currency }) {
  const total = lines.reduce((sum, l) => sum + l.amount, 0);
  return (
    <table className="data-table billing-lines">
      <tbody>
        {lines.map((l) => (
          <tr key={l.label}><td>{l.label}</td><td className="text-right">{formatMoney(l.amount, currency)}</td></tr>
        ))}
        <tr><th scope="row">Total</th><th className="text-right">{formatMoney(total, currency)}</th></tr>
      </tbody>
    </table>
  );
}

export default function Billing() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const toast = useToast();
  const [summary, setSummary] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startBranches, setStartBranches] = useState(1);
  const [addBranches, setAddBranches] = useState(1);
  const [paying, setPaying] = useState(null);
  const [exporting, setExporting] = useState(false);

  const fetchBillingData = useCallback(async () => {
    setLoading(true);
    // allSettled: this is the page an owner reads to decide whether they are
    // paid up. Rendering "nothing to pay" when a request merely failed would
    // be the worst possible answer.
    const [mineR, invR] = await Promise.allSettled([
      api.get('/subscriptions/mine'),
      api.get(`/billing/invoices/${user?.business_id}`),
    ]);
    setSummary(mineR.status === 'fulfilled' ? mineR.value : null);
    setInvoices(invR.status === 'fulfilled' ? (invR.value || []) : []);
    const failed = [mineR.status === 'rejected' && 'your subscription', invR.status === 'rejected' && 'your invoices'].filter(Boolean);
    if (failed.length) {
      const partial = new Error(`Couldn't load ${failed.join(' or ')}. What's shown below may be incomplete.`);
      partial.userMessage = partial.message;
      setError(partial);
    } else {
      setError(null);
    }
    setLoading(false);
  }, [user?.business_id]);

  useEffect(() => { fetchBillingData(); }, [fetchBillingData]);

  // Back from Paystack: apply the payment now rather than waiting for the webhook.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('trxref') || params.get('reference');
    if (!reference) return;
    (async () => {
      try {
        await api.post('/subscriptions/verify-paystack', { reference });
        window.history.replaceState({}, document.title, window.location.pathname);
        // A full reload refetches the business status, which opens the app.
        window.location.reload();
      } catch {
        toast.warning('We received your payment but could not confirm it yet. It will be applied shortly; refresh this page in a minute.');
        window.history.replaceState({}, document.title, window.location.pathname);
        fetchBillingData();
      }
    })();
  }, [fetchBillingData, toast]);

  const pay = async (kind, branches) => {
    setPaying(kind);
    try {
      const result = await api.post('/subscriptions/initialize-paystack', {
        kind,
        ...(branches ? { branches } : {}),
        callback_url: `${window.location.origin}/business-admin/billing`,
      });
      if (result.authorization_url) window.location.href = result.authorization_url;
      else toast.error('Could not start the payment. Please try again.');
    } catch (err) {
      toast.error(err.message || 'Could not start the payment. Please try again.');
    } finally {
      setPaying(null);
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const blob = await api.getBlob('/businesses/me/export');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quaderp-export-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err?.status === 429 ? 'An export can only be generated once per hour. Try again shortly.' : (err?.userMessage || "Couldn't generate the export."));
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <div className="p-xl text-center"><div className="spinner" style={{ margin: '2rem auto' }}></div>Loading billing...</div>;
  }

  const plan = summary?.plan;
  const currency = plan?.currency || 'GHS';
  const status = summary?.status;
  const sub = summary?.subscription;
  const offers = summary?.offers || {};
  const extraPrice = plan?.price_per_extra_location || 0;
  // Shown before checkout; checkout charges the server's own figure.
  const startLines = plan ? [
    ...(plan.setup_fee > 0 ? [{ label: 'One-time setup', amount: plan.setup_fee }] : []),
    { label: 'First branch, for a year', amount: plan.price_yearly },
    ...(startBranches > 1 ? [{ label: `${branchWord(startBranches - 1)} more, for a year`, amount: extraPrice * (startBranches - 1) }] : []),
  ] : [];

  return (
    <div className="billing-page">
      <PageHeader title="Billing" subtitle="Your QuadERP subscription, branches and invoices." />
      <ErrorBanner error={error} onRetry={fetchBillingData} />

      {plan && (
        <section className="content-card billing-plan" aria-labelledby="billing-plan">
          <h2 id="billing-plan">{plan.name}: every feature, for every branch</h2>
          <p>
            {formatMoney(plan.price_yearly, currency)} a year for your first branch, and {formatMoney(extraPrice, currency)} a year
            for each additional branch. A one-time setup fee of {formatMoney(plan.setup_fee, currency)} is paid with your first year.
          </p>
        </section>
      )}

      {summary?.is_demo && (
        <section className="content-card" role="status"><p>The demo does not take payments. Everything is open for you to try.</p></section>
      )}

      {!summary?.is_demo && status === 'unpaid' && offers.start && (
        <section className="content-card billing-action" aria-labelledby="billing-start">
          <h2 id="billing-start">Pay to start using QuadERP</h2>
          <p>Pay the setup fee and your first year. QuadERP opens as soon as Paystack confirms the payment.</p>
          <label className="form-label" htmlFor="start-branches">Branches to start with</label>
          <input id="start-branches" className="form-input billing-qty" type="number" min={1} max={MAX_BRANCHES} value={startBranches}
            onChange={(e) => setStartBranches(clampBranches(e.target.value))} />
          <Lines lines={startLines} currency={currency} />
          <button type="button" className="btn btn-primary" disabled={paying === 'start'} onClick={() => pay('start', startBranches)}>
            {paying === 'start' ? 'Starting payment…' : 'Pay with Paystack'}
          </button>
          <p className="text-muted">You can add branches later for {formatMoney(extraPrice, currency)} a year each.</p>
        </section>
      )}

      {!summary?.is_demo && summary?.paid_before && (
        <section className="content-card billing-action" aria-labelledby="billing-year">
          <h2 id="billing-year">{status === 'expired' ? 'Your subscription has ended' : 'Your subscription'}</h2>
          {sub?.current_period_end && (
            <p>
              {status === 'expired'
                ? <>It ended on <strong>{formatDate(sub.current_period_end)}</strong>. Renew to open QuadERP again; nothing has been lost.</>
                : <>Paid until <strong>{formatDate(sub.current_period_end)}</strong>.</>}
            </p>
          )}
          <p>
            <strong>{branchWord(summary.paid_locations)}</strong> paid for, {summary.locations_used} in use.
          </p>
          {offers.renew && (
            <div className="billing-row">
              <span>Renew for a year, {branchWord(offers.renew.branches)}: <strong>{formatMoney(offers.renew.amount, currency)}</strong>
                {status !== 'expired' && ' (added to the end of your current year)'}</span>
              <button type="button" className="btn btn-primary" disabled={paying === 'renew'} onClick={() => pay('renew')}>
                {paying === 'renew' ? 'Starting payment…' : 'Renew with Paystack'}
              </button>
            </div>
          )}
          {offers.branch && status !== 'expired' && (
            <div className="billing-row">
              <label className="form-label" htmlFor="add-branches">Add branches</label>
              <input id="add-branches" className="form-input billing-qty" type="number" min={1} max={MAX_BRANCHES} value={addBranches}
                onChange={(e) => setAddBranches(clampBranches(e.target.value))} />
              <span><strong>{formatMoney(extraPrice * addBranches, currency)}</strong> for the rest of this year, then {formatMoney(extraPrice, currency)} each at every renewal</span>
              <button type="button" className="btn btn-secondary" disabled={paying === 'branches'} onClick={() => pay('branches', addBranches)}>
                {paying === 'branches' ? 'Starting payment…' : 'Pay for branches'}
              </button>
            </div>
          )}
        </section>
      )}

      {!summary?.is_demo && status === 'expired' && (
        <section className="content-card" aria-labelledby="billing-export">
          <h2 id="billing-export">Your data</h2>
          <p>Download everything QuadERP holds for your business at any time, paid up or not.</p>
          <button type="button" className="btn btn-secondary" disabled={exporting} onClick={exportData}>
            {exporting ? 'Preparing…' : 'Download your data'}
          </button>
        </section>
      )}

      <section aria-labelledby="billing-invoices">
        <h2 id="billing-invoices" className="billing-heading">Invoices</h2>
        <div className="content-card">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>Invoice #</th><th>For</th><th>Amount</th><th>Status</th><th>Date</th><th className="text-right">Actions</th></tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="billing-mono">{inv.invoice_number}</td>
                    <td>{inv.description || 'Subscription payment'}</td>
                    <td className="font-bold">{formatMoney(inv.amount, inv.currency)}</td>
                    <td><span className={`pa-invoice-badge ${inv.status}`}>{inv.status}</span></td>
                    <td>{new Date(inv.created_at).toLocaleDateString()}</td>
                    <td className="text-right">
                      <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/invoice/${inv.id}`)}>View</button>
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && <EmptyStateRow colSpan={6} icon="billing" title="No invoices yet" />}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
