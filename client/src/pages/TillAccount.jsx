import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthContext } from '../lib/AuthContext';

const Icons = {
  printer: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>,
  loader: <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
};

export default function TillAccount() {
  const { role } = useAuthContext();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Expense Modal State
  const [selectedExpense, setSelectedExpense] = useState(null);

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

  useEffect(() => {
    fetchData();
  }, [startDate, endDate]);

  const fmt = (val) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);

  if (error) return <div className="p-8 text-center text-red-500 bg-red-500/10 border border-red-500/20 max-w-2xl mx-auto mt-10 rounded-none">{error}</div>;

  return (
    <div className="w-full h-full flex flex-col p-4 md:p-6 bg-[#0a0a0f]">
      {/* Header Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6 border-b border-slate-800 pb-4 w-full">
        <div>
          <h1 className="text-xl font-bold text-slate-100 uppercase tracking-wide">Till Account Ledger</h1>
          <p className="text-xs text-slate-400 mt-1 uppercase">Cash movements and vault balance.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-transparent border border-slate-700 p-0.5">
            <input 
              type="date" 
              className="bg-transparent text-slate-200 text-sm px-2 py-1 outline-none font-mono"
              value={startDate} 
              onChange={e => setStartDate(e.target.value)} 
            />
            <span className="text-slate-500 px-2 font-mono">-</span>
            <input 
              type="date" 
              className="bg-transparent text-slate-200 text-sm px-2 py-1 outline-none font-mono"
              value={endDate} 
              onChange={e => setEndDate(e.target.value)} 
            />
          </div>
          <button 
            onClick={() => window.print()} 
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-1.5 text-sm border border-slate-700 transition-colors uppercase font-medium"
          >
            {Icons.printer} Print
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-20 text-indigo-400">{Icons.loader}</div>
      ) : !data ? null : data.view === 'basic' ? (
        /* BASIC VIEW FOR CASHIERS */
        <div className="w-full max-w-lg mx-auto mt-12 bg-transparent border border-slate-800 p-8 text-center">
          <h2 className="text-slate-400 text-sm uppercase tracking-wider font-semibold mb-2">Expected Cash Deposit ($)</h2>
          <div className={`text-5xl font-mono font-bold mb-6 ${data.currentBalance >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
            {fmt(data.currentBalance)}
          </div>
          <div className="text-xs text-slate-400 text-left border-t border-slate-800 pt-4 uppercase">
            Total cash sales minus expenses during your shift. Ensure physical cash exactly matches this balance.
          </div>
        </div>
      ) : (
        /* ADVANCED LEDGER VIEW */
        <div id="till-print-area" className="flex-1 w-full space-y-12">
          {data.branches.length === 0 ? (
            <div className="text-center py-12 text-slate-500 bg-transparent border border-slate-800 uppercase text-sm">
              No transactions found for the selected date range.
            </div>
          ) : (
            data.branches.map(branch => (
              <div key={branch.location_id} className="w-full bg-[#0a0a0f] border border-slate-800 flex flex-col">
                
                {/* Branch Ledger Header */}
                <div className="flex justify-between items-center px-4 py-3 bg-[#111318] border-b border-slate-800">
                  <h2 className="text-base font-bold text-slate-200 uppercase tracking-widest">{branch.location_name}</h2>
                  <div className="flex gap-8 text-right">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-500 uppercase tracking-widest">Cash Sales (In) ($)</span>
                      <span className="text-sm font-mono text-emerald-400 font-bold">{fmt(branch.total_sales)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-500 uppercase tracking-widest">Expenses (Out) ($)</span>
                      <span className="text-sm font-mono text-rose-400 font-bold">{fmt(branch.total_expenses)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-500 uppercase tracking-widest">Deposited (Out) ($)</span>
                      <span className="text-sm font-mono text-indigo-400 font-bold">{fmt(branch.total_deposits)}</span>
                    </div>
                    <div className="flex flex-col ml-4 pl-4 border-l border-slate-700">
                      <span className="text-[10px] text-slate-400 uppercase tracking-widest">Ending Balance ($)</span>
                      <span className={`text-base font-mono font-bold ${branch.current_balance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {fmt(branch.current_balance)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Ledger Transactions Table */}
                {branch.transactions.length > 0 ? (
                  <div className="w-full overflow-x-auto">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                      <thead>
                        <tr className="bg-[#1a1c23] border-b border-slate-700">
                          <th className="px-4 py-2.5 text-[11px] font-bold text-slate-300 uppercase tracking-wider w-40 border-r border-slate-800/50">Date</th>
                          <th className="px-4 py-2.5 text-[11px] font-bold text-slate-300 uppercase tracking-wider w-32 border-r border-slate-800/50">Type</th>
                          <th className="px-4 py-2.5 text-[11px] font-bold text-slate-300 uppercase tracking-wider border-r border-slate-800/50">Description</th>
                          <th className="px-4 py-2.5 text-[11px] font-bold text-slate-300 uppercase tracking-wider text-right w-32 border-r border-slate-800/50">Cash In ($)</th>
                          <th className="px-4 py-2.5 text-[11px] font-bold text-slate-300 uppercase tracking-wider text-right w-32 border-r border-slate-800/50">Cash Out ($)</th>
                          <th className="px-4 py-2.5 text-[11px] font-bold text-slate-300 uppercase tracking-wider text-right w-32">Balance ($)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {branch.transactions.map((t) => {
                          const isInflow = t.type === 'sale' || t.type === 'pay_in';
                          const isOutflow = t.type === 'expense' || t.type === 'deposit_to_bank';
                          
                          return (
                            <tr key={t.id} className="hover:bg-[#16181d] transition-colors bg-[#0a0a0f]">
                              <td className="px-4 py-2 text-slate-300 font-mono text-[13px] border-r border-slate-800/50">
                                {new Date(t.date).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-2 text-slate-400 text-[11px] uppercase tracking-wider border-r border-slate-800/50 font-bold">
                                {t.type.replace('_', ' ')}
                              </td>
                              <td className="px-4 py-2 text-slate-300 text-[13px] border-r border-slate-800/50">
                                <div>{t.description}</div>
                                <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                                  ID:{' '}
                                  {t.type === 'sale' ? (
                                    (role === 'Business Admin' || role === 'Platform Admin') ? (
                                      <Link 
                                        to={`/sales-record?date=${t.date.split('T')[0]}&highlight=${t.id}`}
                                        className="text-indigo-400 hover:text-indigo-300 hover:underline transition-colors"
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
                                        className="text-indigo-400 hover:text-indigo-300 hover:underline transition-colors"
                                      >
                                        {getNumericId(t.id)}
                                      </button>
                                    ) : (
                                      getNumericId(t.id)
                                    )
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-emerald-400 text-[13px] border-r border-slate-800/50">
                                {isInflow ? fmt(t.amount) : ''}
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-rose-400 text-[13px] border-r border-slate-800/50">
                                {isOutflow ? fmt(t.amount) : ''}
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-slate-200 text-[13px] font-bold">
                                {fmt(t.balance)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-500 text-[11px] uppercase tracking-widest font-bold">
                    No ledger transactions recorded.
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Expense/Transaction Details Modal */}
      {selectedExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0f1115] border border-slate-800 rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-800 bg-[#111318] flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-100 uppercase tracking-wide">Transaction Details</h3>
                <p className="text-xs text-slate-500 font-mono mt-1">Ref: {getNumericId(selectedExpense.id)}</p>
              </div>
              <button 
                onClick={() => setSelectedExpense(null)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400 uppercase tracking-wider">Type</span>
                <span className="text-sm font-bold text-slate-200 uppercase tracking-wider px-3 py-1 bg-slate-800 rounded-md">
                  {selectedExpense.type.replace('_', ' ')}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400 uppercase tracking-wider">Amount</span>
                <span className={`text-2xl font-mono font-bold ${selectedExpense.type === 'expense' || selectedExpense.type === 'deposit_to_bank' ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {fmt(selectedExpense.amount)}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-slate-500 uppercase tracking-wider">Description</span>
                <p className="text-sm text-slate-300 p-3 bg-[#0a0a0f] border border-slate-800/50 rounded-md">
                  {selectedExpense.description}
                </p>
              </div>
              <div className="flex justify-between items-center border-t border-slate-800/50 pt-4">
                <span className="text-xs text-slate-500 uppercase tracking-wider">Authorized By</span>
                <span className="text-sm text-slate-300 font-medium">{selectedExpense.user}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500 uppercase tracking-wider">Date & Time</span>
                <span className="text-sm text-slate-300 font-mono">
                  {new Date(selectedExpense.date).toLocaleDateString()} {new Date(selectedExpense.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </span>
              </div>
            </div>
            <div className="p-4 bg-[#111318] border-t border-slate-800 flex justify-end">
              <button 
                onClick={() => window.print()}
                className="text-xs uppercase tracking-wider font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-2 px-4 py-2"
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
