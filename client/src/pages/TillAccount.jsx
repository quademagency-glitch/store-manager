import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthContext } from '../lib/AuthContext';
import { usePrintDocument } from '../hooks/usePrintDocument';
import { useCurrency } from '../hooks/useCurrency';
import LetterheadRenderer, { LetterheadFooter } from '../components/LetterheadRenderer';

const Icons = {
  printer: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>,
  loader: <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
};

export default function TillAccount() {
  const { role } = useAuthContext();
  const { business, printElement } = usePrintDocument();
  const { fmt: fmtCurrency } = useCurrency(business);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Expense Modal State
  const [selectedExpense, setSelectedExpense] = useState(null);

  // Financial Summary State
  const [finSummary, setFinSummary] = useState(null);
  const [finExpanded, setFinExpanded] = useState(false);

  const isAdmin = role === 'Business Admin' || role === 'Platform Admin';

  // Helper to generate a numeric ID from UUID
  const getNumericId = (uuid) => {
    return parseInt(uuid.replace(/-/g, '').substring(0, 7), 16).toString().padStart(8, '0');
  };

  // Date filters
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
      setError(err.message || 'Failed to fetch till account ledger');
    } finally {
      setLoading(false);
    }
  };

  const fetchFinSummary = async () => {
    if (!isAdmin) return;
    try {
      const res = await api.get(`/ledger/financial-summary?start_date=${startDate}&end_date=${endDate}`);
      setFinSummary(res);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Financial summary error:', err);
    }
  };

  useEffect(() => {
    fetchData();
    if (isAdmin) fetchFinSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const fmt = (val) => fmtCurrency(val);

  if (error) return <div className="p-8 text-center max-w-2xl mx-auto mt-10 rounded-none" style={{ color: 'var(--color-error)', background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)' }}>{error}</div>;

  // Render Financial Summary Section
  const renderFinancialSummary = () => {
    if (!isAdmin || !finSummary) return null;

    const maxExpense = Math.max(...Object.values(finSummary.expenses?.categories || { _: 1 }), 1);

    return (
      <div className="fin-summary-section">
        <div className="fin-summary-header" onClick={() => setFinExpanded(!finExpanded)}>
          <h2>📊 Financial Summary</h2>
          <span className="fin-summary-toggle" style={{ transform: finExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </div>
        {finExpanded && (
          <div className="fin-summary-body">
            {/* Top-level KPIs */}
            <div className="fin-summary-grid">
              <div className="fin-summary-stat">
                <div className="fin-summary-stat-label">Total Income</div>
                <div className="fin-summary-stat-value positive">{fmt(finSummary.income?.total)}</div>
              </div>
              <div className="fin-summary-stat">
                <div className="fin-summary-stat-label">Total Expenses</div>
                <div className="fin-summary-stat-value negative">{fmt(finSummary.expenses?.total)}</div>
              </div>
              <div className="fin-summary-stat">
                <div className="fin-summary-stat-label">Net Position</div>
                <div className={`fin-summary-stat-value ${finSummary.net_position >= 0 ? 'positive' : 'negative'}`}>
                  {finSummary.net_position >= 0 ? '+' : ''}{fmt(finSummary.net_position)}
                </div>
              </div>
              <div className="fin-summary-stat">
                <div className="fin-summary-stat-label">Total Deposited</div>
                <div className="fin-summary-stat-value">{fmt(finSummary.deposits?.total)}</div>
              </div>
            </div>

            {/* Income Breakdown */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                Income Breakdown
              </h3>
              <div className="fin-category-row">
                <span className="fin-category-name">Sales Revenue</span>
                <span className="fin-category-amount" style={{ color: 'var(--color-success)' }}>{fmt(finSummary.income?.total_sales)}</span>
              </div>
              {finSummary.income?.other_income > 0 && (
                <div className="fin-category-row">
                  <span className="fin-category-name">Other Income</span>
                  <span className="fin-category-amount" style={{ color: 'var(--color-success)' }}>{fmt(finSummary.income.other_income)}</span>
                </div>
              )}
            </div>

            {/* Expense Breakdown by Category */}
            {Object.keys(finSummary.expenses?.categories || {}).length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                  Expense Breakdown
                </h3>
                {Object.entries(finSummary.expenses.categories)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, amt]) => (
                    <div key={cat}>
                      <div className="fin-category-row">
                        <span className="fin-category-name">{cat}</span>
                        <span className="fin-category-amount" style={{ color: 'var(--color-error)' }}>{fmt(amt)}</span>
                      </div>
                      <div className="fin-category-bar">
                        <div className="fin-category-bar-fill" style={{ width: `${(amt / maxExpense) * 100}%`, background: 'var(--color-error)' }} />
                      </div>
                    </div>
                  ))
                }
              </div>
            )}

            {/* Deposits Breakdown */}
            {Object.keys(finSummary.deposits?.categories || {}).length > 0 && (
              <div>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                  Deposits Breakdown
                </h3>
                {Object.entries(finSummary.deposits.categories)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, amt]) => (
                    <div key={cat} className="fin-category-row">
                      <span className="fin-category-name">{cat}</span>
                      <span className="fin-category-amount" style={{ color: 'var(--color-accent-primary)' }}>{fmt(amt)}</span>
                    </div>
                  ))
                }
              </div>
            )}

            {finSummary.entry_count === 0 && (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                No categorized entries found for this period.
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col p-4 md:p-6" style={{ background: 'var(--color-bg-primary)' }}>
      {/* Header Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6 pb-4 w-full" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-primary)' }}>Till Account Ledger</h1>
          <p className="text-xs mt-1 uppercase" style={{ color: 'var(--color-text-tertiary)' }}>Cash movements and vault balance.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center bg-transparent p-0.5 flex-1 md:flex-initial justify-between" style={{ border: '1px solid var(--color-border)' }}>
            <input 
              type="date" 
              className="bg-transparent text-sm px-1 py-1 outline-none font-mono w-[45%] md:w-auto"
              style={{ color: 'var(--color-text-primary)' }}
              value={startDate} 
              onChange={e => setStartDate(e.target.value)} 
            />
            <span className="px-1 font-mono" style={{ color: 'var(--color-text-muted)' }}>-</span>
            <input 
              type="date" 
              className="bg-transparent text-sm px-1 py-1 outline-none font-mono w-[45%] md:w-auto"
              style={{ color: 'var(--color-text-primary)' }}
              value={endDate} 
              onChange={e => setEndDate(e.target.value)} 
            />
          </div>
          <button 
            onClick={() => printElement('till-print-area', 'a4')} 
            className="flex items-center justify-center gap-2 px-4 py-1.5 text-sm transition-colors uppercase font-medium w-full sm:w-auto"
            style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}
          >
            {Icons.printer} Print
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-20" style={{ color: 'var(--color-accent-primary)' }}>{Icons.loader}</div>
      ) : !data ? null : data.view === 'basic' ? (
        /* BASIC VIEW FOR CASHIERS */
        <div className="w-full max-w-lg mx-auto mt-12 bg-transparent p-8 text-center" style={{ border: '1px solid var(--color-border)' }}>
          <h2 className="text-sm uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--color-text-tertiary)' }}>Expected Cash Deposit ($)</h2>
          <div className="text-5xl font-mono font-bold mb-6" style={{ color: data.currentBalance >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
            {fmt(data.currentBalance)}
          </div>
          <div className="text-xs text-left uppercase pt-4" style={{ color: 'var(--color-text-tertiary)', borderTop: '1px solid var(--color-border)' }}>
            Total cash sales minus expenses during your shift. Ensure physical cash exactly matches this balance.
          </div>
        </div>
      ) : (
        /* ADVANCED LEDGER VIEW */
        <div id="till-print-area" className="flex-1 w-full space-y-12">
          {/* Letterhead — visible only in print */}
          <div className="print-only">
            <LetterheadRenderer
              letterhead={business?.letterhead}
              logoUrl={business?.logo_url}
              businessName={business?.name}
            />
            <div style={{ textAlign: 'center', margin: '12px 0 24px 0' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#334155' }}>TILL ACCOUNT LEDGER</h2>
              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Period: {startDate} — {endDate}</div>
            </div>
          </div>
          {/* Financial Summary for Admins */}
          {renderFinancialSummary()}
          {data.branches.length === 0 ? (
            <div className="text-center py-12 bg-transparent uppercase text-sm" style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
              No transactions found for the selected date range.
            </div>
          ) : (
            data.branches.map(branch => (
              <div key={branch.location_id} className="w-full flex flex-col" style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)' }}>
                
                {/* Branch Ledger Header */}
                <div className="flex flex-col md:flex-row md:justify-between items-start md:items-center px-4 py-3 gap-3" style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                  <h2 className="text-base font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-primary)' }}>{branch.location_name}</h2>
                  <div className="till-branch-stats flex flex-wrap gap-4 md:gap-8 w-full md:w-auto md:justify-end text-left md:text-right">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>Cash Sales (In) ($)</span>
                      <span className="text-sm font-mono font-bold" style={{ color: 'var(--color-success)' }}>{fmt(branch.total_sales)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>Expenses (Out) ($)</span>
                      <span className="text-sm font-mono font-bold" style={{ color: 'var(--color-error)' }}>{fmt(branch.total_expenses)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>Deposited (Out) ($)</span>
                      <span className="text-sm font-mono font-bold" style={{ color: 'var(--color-accent-primary)' }}>{fmt(branch.total_deposits)}</span>
                    </div>
                    <div className="flex flex-col md:ml-4 md:pl-4 till-ending-balance">
                      <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)' }}>Ending Balance ($)</span>
                      <span className="text-base font-mono font-bold" style={{ color: branch.current_balance >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                        {fmt(branch.current_balance)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Ledger Transactions Table */}
                {branch.transactions.length > 0 ? (
                  <><div className="desktop-table-view">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                      <thead>
                        <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border)' }}>
                          <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider w-40" style={{ color: 'var(--color-text-secondary)', borderRight: '1px solid var(--color-border)' }}>Date</th>
                          <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider w-32" style={{ color: 'var(--color-text-secondary)', borderRight: '1px solid var(--color-border)' }}>Type</th>
                          <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)', borderRight: '1px solid var(--color-border)' }}>Description</th>
                          <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-right w-32" style={{ color: 'var(--color-text-secondary)', borderRight: '1px solid var(--color-border)' }}>Cash In ($)</th>
                          <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-right w-32" style={{ color: 'var(--color-text-secondary)', borderRight: '1px solid var(--color-border)' }}>Cash Out ($)</th>
                          <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-right w-32" style={{ color: 'var(--color-text-secondary)' }}>Balance ($)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {branch.transactions.map((t) => {
                          const isInflow = t.type === 'sale' || t.type === 'pay_in';
                          const isOutflow = t.type === 'expense' || t.type === 'deposit_to_bank';
                          
                          return (
                            <tr key={t.id} className="transition-colors" style={{ background: 'var(--color-bg-primary)', borderBottom: '1px solid var(--color-border)' }}>
                              <td className="px-4 py-2 font-mono text-[13px]" style={{ color: 'var(--color-text-secondary)', borderRight: '1px solid var(--color-border)' }}>
                                {new Date(t.date).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-2 text-[11px] uppercase tracking-wider font-bold" style={{ color: 'var(--color-text-tertiary)', borderRight: '1px solid var(--color-border)' }}>
                                {t.type.replace('_', ' ')}
                              </td>
                              <td className="px-4 py-2 text-[13px]" style={{ color: 'var(--color-text-secondary)', borderRight: '1px solid var(--color-border)' }}>
                                <div>{t.description}</div>
                                <div className="text-[10px] mt-0.5 font-mono" style={{ color: 'var(--color-text-muted)' }}>
                                  ID:{' '}
                                  {t.type === 'sale' ? (
                                    (role === 'Business Admin' || role === 'Platform Admin') ? (
                                      <Link 
                                        to={`/sales-record?date=${t.date.split('T')[0]}&highlight=${t.id}`}
                                        className="hover:underline transition-colors"
                                        style={{ color: 'var(--color-accent-primary)' }}
                                      >
                                        {getNumericId(t.id)}
                                      </Link>
                                    ) : (
                                      getNumericId(t.id)
                                    )
                                  ) : (
                                    (role === 'Business Admin' || role === 'Platform Admin') ? (
                                      <button 
                                        onClick={() => setSelectedExpense(t)}
                                        className="hover:underline transition-colors"
                                        style={{ color: 'var(--color-accent-primary)' }}
                                      >
                                        {getNumericId(t.id)}
                                      </button>
                                    ) : (
                                      getNumericId(t.id)
                                    )
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-[13px]" style={{ color: 'var(--color-success)', borderRight: '1px solid var(--color-border)' }}>
                                {isInflow ? fmt(t.amount) : ''}
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-[13px]" style={{ color: 'var(--color-error)', borderRight: '1px solid var(--color-border)' }}>
                                {isOutflow ? fmt(t.amount) : ''}
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-[13px] font-bold" style={{ color: 'var(--color-text-primary)' }}>
                                {fmt(t.balance)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mobile-card-view">
                    {branch.transactions.map((t) => {
                      const isInflow = t.type === 'sale' || t.type === 'pay_in';
                      const isOutflow = t.type === 'expense' || t.type === 'deposit_to_bank';
                      return (
                        <div key={t.id} className="m-card">
                          <div className="m-card-top">
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="m-card-title" style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.type.replace('_', ' ')}</div>
                              <div className="m-card-sub">{t.description}</div>
                              <div className="m-card-meta">{new Date(t.date).toLocaleDateString()} · ID: {getNumericId(t.id)}</div>
                            </div>
                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                              {isInflow && <div style={{ color: 'var(--color-success)', fontWeight: 700, fontFamily: 'monospace' }}>{fmt(t.amount)}</div>}
                              {isOutflow && <div style={{ color: 'var(--color-error)', fontWeight: 700, fontFamily: 'monospace' }}>-{fmt(t.amount)}</div>}
                              <div className="m-card-meta" style={{ marginTop: '2px' }}>Bal: {fmt(t.balance)}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div></>
                ) : (
                  <div className="p-8 text-center text-[11px] uppercase tracking-widest font-bold" style={{ color: 'var(--color-text-muted)' }}>
                    No ledger transactions recorded.
                  </div>
                )}
              </div>
            ))
          )}
          {/* Print Footer */}
          <div className="print-only">
            <LetterheadFooter letterhead={business?.letterhead} />
          </div>
        </div>
      )}

      {/* Expense/Transaction Details Modal */}
      {selectedExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
            <div className="p-6 flex justify-between items-center" style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border)' }}>
              <div>
                <h3 className="text-lg font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-primary)' }}>Transaction Details</h3>
                <p className="text-xs font-mono mt-1" style={{ color: 'var(--color-text-muted)' }}>Ref: {getNumericId(selectedExpense.id)}</p>
              </div>
              <button 
                onClick={() => setSelectedExpense(null)}
                className="transition-colors"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-center">
                <span className="text-sm uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Type</span>
                <span className="text-sm font-bold uppercase tracking-wider px-3 py-1 rounded-md" style={{ color: 'var(--color-text-primary)', background: 'var(--color-bg-tertiary)' }}>
                  {selectedExpense.type.replace('_', ' ')}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Amount</span>
                <span className="text-2xl font-mono font-bold" style={{ color: selectedExpense.type === 'expense' || selectedExpense.type === 'deposit_to_bank' ? 'var(--color-error)' : 'var(--color-success)' }}>
                  {fmt(selectedExpense.amount)}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Description</span>
                <p className="text-sm p-3 rounded-md" style={{ color: 'var(--color-text-secondary)', background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)' }}>
                  {selectedExpense.description}
                </p>
              </div>
              <div className="flex justify-between items-center pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Authorized By</span>
                <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{selectedExpense.user}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Date & Time</span>
                <span className="text-sm font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                  {new Date(selectedExpense.date).toLocaleDateString()} {new Date(selectedExpense.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </span>
              </div>
            </div>
            <div className="p-4 flex justify-end" style={{ background: 'var(--color-bg-tertiary)', borderTop: '1px solid var(--color-border)' }}>
              <button 
                onClick={() => printElement('expense-voucher-print', 'a4')}
                className="text-xs uppercase tracking-wider font-bold flex items-center gap-2 px-4 py-2"
                style={{ color: 'var(--color-accent-primary)' }}
              >
                {Icons.printer} Print Voucher
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
