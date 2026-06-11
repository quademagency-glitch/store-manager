import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const Icons = {
  printer: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>,
  loader: <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
};

export default function TillAccount() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
                          <th className="px-4 py-2.5 text-[11px] font-bold text-slate-300 uppercase tracking-wider w-32 border-r border-slate-800/50">User</th>
                          <th className="px-4 py-2.5 text-[11px] font-bold text-slate-300 uppercase tracking-wider text-right w-32 border-r border-slate-800/50">Cash In ($)</th>
                          <th className="px-4 py-2.5 text-[11px] font-bold text-slate-300 uppercase tracking-wider text-right w-32">Cash Out ($)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {branch.transactions.map((t) => {
                          const isInflow = t.type === 'sale' || t.type === 'pay_in';
                          const isOutflow = t.type === 'expense' || t.type === 'deposit_to_bank';
                          
                          return (
                            <tr key={t.id} className="hover:bg-[#16181d] transition-colors bg-[#0a0a0f]">
                              <td className="px-4 py-2 text-slate-300 font-mono text-[13px] border-r border-slate-800/50">
                                {new Date(t.date).toLocaleDateString()} {new Date(t.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </td>
                              <td className="px-4 py-2 text-slate-400 text-[11px] uppercase tracking-wider border-r border-slate-800/50 font-bold">
                                {t.type.replace('_', ' ')}
                              </td>
                              <td className="px-4 py-2 text-slate-300 text-[13px] border-r border-slate-800/50">
                                {t.description}
                              </td>
                              <td className="px-4 py-2 text-slate-400 text-[13px] border-r border-slate-800/50">
                                {t.user}
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-emerald-400 text-[13px] border-r border-slate-800/50">
                                {isInflow ? fmt(t.amount) : ''}
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-rose-400 text-[13px]">
                                {isOutflow ? fmt(t.amount) : ''}
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
    </div>
  );
}
