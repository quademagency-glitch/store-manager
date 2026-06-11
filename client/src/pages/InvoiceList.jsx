import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

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
        <p className="dashboard-subtitle">View all your subscription invoices from Quadem ERP.</p>
      </header>

      {loading ? (
        <div className="p-xl text-center">
          <div className="spinner" style={{ margin: '2rem auto' }}></div>
          <p>Loading invoices...</p>
        </div>
      ) : invoices.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📄</div>
          <h2>No Invoices Yet</h2>
          <p className="text-muted">You have not received any invoices from Quadem ERP yet.</p>
        </div>
      ) : (
        <div className="glass-panel" style={{ overflowX: 'auto' }}>
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
                    onClick={() => navigate(`/invoice/${inv.id}`)}
                >
                  <td style={{ padding: '1rem', fontFamily: 'monospace', fontWeight: 600 }}>{inv.invoice_number}</td>
                  <td style={{ padding: '1rem' }}>{new Date(inv.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: '1rem' }}>{inv.description || 'Subscription Payment'}</td>
                  <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--color-primary)' }}>{formatCurrency(inv.amount, inv.currency)}</td>
                  <td style={{ padding: '1rem' }}>
                    <span className={`pa-invoice-badge ${inv.status}`} style={{
                      display: 'inline-block',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      background: inv.status === 'paid' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                      color: inv.status === 'paid' ? '#10b981' : '#f59e0b'
                    }}>
                      {inv.status}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/invoice/${inv.id}`); }}>
                      View Invoice
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
