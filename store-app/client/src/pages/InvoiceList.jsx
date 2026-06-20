import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Icons } from '../components/icons/Icons';

export default function InvoiceList() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        const res = await api.get('/billing/invoices');
        setInvoices(res || []);
      } catch (err) {
        if (import.meta.env.DEV) console.error("Failed to fetch invoices", err);
      } finally {
        setLoading(false);
      }
    };
    fetchInvoices();
  }, []);

  const formatCurrency = (amount, currency = 'GHS') => {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency }).format(amount || 0);
  };

  return (
    <div className="invoice-list-page" style={{ padding: '0 1rem 2rem' }}>
      <header className="page-header" style={{ marginBottom: '2rem' }}>
        <h1 className="dashboard-title">My Invoices</h1>
        <p className="dashboard-subtitle">View all your subscription invoices from QuadERP.</p>
      </header>

      {loading ? (
        <div className="p-xl text-center">
          <div className="spinner" style={{ margin: '2rem auto' }}></div>
          <p>Loading invoices...</p>
        </div>
      ) : invoices.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">{Icons.document}</div>
          <h2>No Invoices Yet</h2>
          <p className="text-muted">You have not received any invoices from QuadERP yet.</p>
        </div>
      ) : (
        <div className="glass-panel">
          {/* Desktop table */}
          <div className="desktop-table-view">
            <table className="glass-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '1rem', color: 'var(--color-text-secondary)' }}>Invoice #</th>
                  <th style={{ padding: '1rem', color: 'var(--color-text-secondary)' }}>Date</th>
                  <th style={{ padding: '1rem', color: 'var(--color-text-secondary)' }}>Description</th>
                  <th style={{ padding: '1rem', color: 'var(--color-text-secondary)' }}>Amount</th>
                  <th style={{ padding: '1rem', color: 'var(--color-text-secondary)' }}>Status</th>
                  <th style={{ padding: '1rem', textAlign: 'right', color: 'var(--color-text-secondary)' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', transition: 'background 0.2s' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-tertiary)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      onClick={() => navigate(`/invoice/${inv.id}`)}>
                    <td style={{ padding: '1rem', fontFamily: 'monospace', fontWeight: 600 }}>{inv.invoice_number}</td>
                    <td style={{ padding: '1rem' }}>{new Date(inv.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: '1rem' }}>{inv.description || 'Subscription Payment'}</td>
                    <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--color-primary)' }}>{formatCurrency(inv.amount, inv.currency)}</td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ display: 'inline-block', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', background: inv.status === 'paid' ? 'color-mix(in srgb, var(--color-success) 10%, transparent)' : 'color-mix(in srgb, var(--color-warning) 10%, transparent)', color: inv.status === 'paid' ? 'var(--color-success)' : 'var(--color-warning)' }}>{inv.status}</span>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
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
              <div key={inv.id} className="m-card" onClick={() => navigate(`/invoice/${inv.id}`)} style={{ cursor: 'pointer' }}>
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
    </div>
  );
}
