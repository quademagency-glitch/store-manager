import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuthContext } from '../lib/AuthContext';

export default function TillAccount() {
  const { hasPermission } = useAuthContext();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Admin filter states
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/ledger/till-balance?start_date=${startDate}&end_date=${endDate}`);
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to fetch till account data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate]);

  const fmt = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);

  if (loading && !data) return <div className="p-xl text-center">Loading Till Account...</div>;
  if (error) return <div className="p-xl text-center text-error">{error}</div>;
  if (!data) return null;

  return (
    <div className="container" style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <header className="dashboard-header" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="dashboard-title">Till Account & Ledger</h1>
          <p className="dashboard-subtitle">Track expected cash balances and transaction history.</p>
        </div>
        
        {data.view === 'advanced' && (
          <div style={{ display: 'flex', gap: '16px', background: 'var(--color-bg-secondary)', padding: '12px', borderRadius: '8px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>From</label>
              <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: '8px', fontSize: '0.9rem' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>To</label>
              <input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: '8px', fontSize: '0.9rem' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => window.print()} style={{ padding: '8px 16px', height: '38px' }}>Print Report</button>
            </div>
          </div>
        )}
      </header>

      {/* BASIC VIEW FOR CASHIERS */}
      {data.view === 'basic' && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '64px' }}>
          <div className="content-card" style={{ padding: '48px', textAlign: 'center', maxWidth: '500px', width: '100%', background: 'linear-gradient(135deg, var(--color-bg-secondary) 0%, rgba(59, 130, 246, 0.1) 100%)', border: '1px solid var(--color-border)', borderRadius: '16px' }}>
            <h2 style={{ color: 'var(--color-text-muted)', fontSize: '1.2rem', marginBottom: '16px' }}>Current Cash Owed</h2>
            <div style={{ fontSize: '4rem', fontWeight: '800', color: data.currentBalance >= 0 ? '#10b981' : '#ef4444', marginBottom: '24px' }}>
              {fmt(data.currentBalance)}
            </div>
            <p style={{ color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>
              This balance reflects the total cash sales you've processed minus any expenses or deposits logged. 
              <br /><br />
              <strong>Please ensure you deposit your cash to the business owner or manager by the required clear day.</strong>
            </p>
          </div>
        </div>
      )}

      {/* ADVANCED VIEW FOR MANAGERS/ADMINS */}
      {data.view === 'advanced' && (
        <div id="till-print-area">
          {data.branches.length === 0 ? (
            <p className="text-muted">No transactions found for the selected date range.</p>
          ) : (
            data.branches.map(branch => (
              <div key={branch.location_id} className="content-card" style={{ padding: '24px', marginBottom: '32px', background: 'var(--color-bg-secondary)', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--color-border)' }}>
                  <h2 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--color-text-primary)' }}>{branch.location_name}</h2>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Branch Cash Balance</div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: branch.current_balance >= 0 ? '#10b981' : '#ef4444' }}>
                      {fmt(branch.current_balance)}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ padding: '16px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    <div style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: 600 }}>Total Cash Sales</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{fmt(branch.total_sales)}</div>
                  </div>
                  <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    <div style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 600 }}>Total Expenses</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{fmt(branch.total_expenses)}</div>
                  </div>
                  <div style={{ padding: '16px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                    <div style={{ color: '#3b82f6', fontSize: '0.85rem', fontWeight: 600 }}>Cash Deposited</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{fmt(branch.total_deposits)}</div>
                  </div>
                </div>

                <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', color: 'var(--color-text-secondary)' }}>Ledger History</h3>
                {branch.transactions.length > 0 ? (
                  <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--color-bg-secondary)', zIndex: 10 }}>
                        <tr>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}>Date</th>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}>Type</th>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}>Description</th>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}>User</th>
                          <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid var(--color-border)' }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {branch.transactions.map(t => (
                          <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <td style={{ padding: '12px' }}>{new Date(t.date).toLocaleDateString()} {new Date(t.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                            <td style={{ padding: '12px' }}>
                              <span style={{ 
                                padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase',
                                background: t.type === 'sale' ? 'rgba(16, 185, 129, 0.1)' : t.type === 'expense' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                                color: t.type === 'sale' ? '#10b981' : t.type === 'expense' ? '#ef4444' : '#3b82f6'
                              }}>
                                {t.type.replace('_', ' ')}
                              </span>
                            </td>
                            <td style={{ padding: '12px' }}>{t.description}</td>
                            <td style={{ padding: '12px' }}>{t.user}</td>
                            <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: t.type === 'expense' || t.type === 'deposit_to_bank' ? '#ef4444' : '#10b981' }}>
                              {t.type === 'expense' || t.type === 'deposit_to_bank' ? '-' : '+'}{fmt(t.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-muted">No ledger transactions.</p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
