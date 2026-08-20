import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { PageHeader, PageState, EmptyState, SkeletonTable } from '../components/ui';

export default function InvoiceList() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Previously the catch only logged in DEV, so a failed request rendered
  // the "No Invoices Yet" empty state, telling the user their billing
  // history was empty when in fact it had not loaded.
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/billing/invoices');
      setInvoices(res || []);
      setError(null);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to fetch invoices', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const formatCurrency = (amount, currency = 'GHS') => {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency }).format(amount || 0);
  };

  return (
    <div className="invoice-list-page">
      <PageHeader
        title="My Invoices"
        subtitle="View all your subscription invoices from QuadERP."
      />

      <PageState
        loading={loading}
        error={error}
        empty={invoices.length === 0}
        onRetry={fetchInvoices}
        skeleton={<div className="glass-panel"><SkeletonTable rows={4} cols={6} /></div>}
        emptyState={
          <EmptyState
            icon="document"
            title="No invoices yet"
            hint="Invoices from QuadERP will appear here once your subscription is billed."
          />
        }
      >
        {(
        <div className="glass-panel">
          {/* Desktop table */}
          <div className="desktop-table-view">
            <table className="glass-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr className="border-b">
                  <th className="p-md text-secondary">Invoice #</th>
                  <th className="p-md text-secondary">Date</th>
                  <th className="p-md text-secondary">Description</th>
                  <th className="p-md text-secondary">Amount</th>
                  <th className="p-md text-secondary">Status</th>
                  <th className="p-md text-right text-secondary">Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', transition: 'background 0.2s' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-tertiary)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      onClick={() => navigate(`/invoice/${inv.id}`)}>
                    <td style={{ padding: '1rem', fontFamily: 'monospace', fontWeight: 600 }}>{inv.invoice_number}</td>
                    <td className="p-md">{new Date(inv.created_at).toLocaleDateString()}</td>
                    <td className="p-md">{inv.description || 'Subscription Payment'}</td>
                    <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--color-primary)' }}>{formatCurrency(inv.amount, inv.currency)}</td>
                    <td className="p-md">
                      <span style={{ display: 'inline-block', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', background: inv.status === 'paid' ? 'color-mix(in srgb, var(--color-success) 10%, transparent)' : 'color-mix(in srgb, var(--color-warning) 10%, transparent)', color: inv.status === 'paid' ? 'var(--color-success)' : 'var(--color-warning)' }}>{inv.status}</span>
                    </td>
                    <td className="p-md text-right">
                      <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/invoice/${inv.id}`); }}>View Invoice</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="mobile-card-view">
            {invoices.map((inv) => (
              <div key={inv.id} className="m-card cursor-pointer" onClick={() => navigate(`/invoice/${inv.id}`)}>
                <div className="m-card-top">
                  <div>
                    <div className="m-card-title" style={{ fontFamily: 'monospace' }}>{inv.invoice_number}</div>
                    <div className="m-card-sub">{inv.description || 'Subscription Payment'}</div>
                    <div className="m-card-meta">{new Date(inv.created_at).toLocaleDateString()}</div>
                  </div>
                  <span style={{ display: 'inline-block', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', background: inv.status === 'paid' ? 'color-mix(in srgb, var(--color-success) 10%, transparent)' : 'color-mix(in srgb, var(--color-warning) 10%, transparent)', color: inv.status === 'paid' ? 'var(--color-success)' : 'var(--color-warning)', flexShrink: 0 }}>{inv.status}</span>
                </div>
                <div className="m-card-row">
                  <span className="m-card-amount" style={{ color: 'var(--color-primary)' }}>{formatCurrency(inv.amount, inv.currency)}</span>
                  <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/invoice/${inv.id}`); }}>View</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}
      </PageState>
    </div>
  );
}
