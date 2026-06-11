import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuthContext } from '../lib/AuthContext';

const Icons = {
  wallet: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>,
  trendingUp: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  trendingDown: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>,
  landmark: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>,
  printer: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>,
  shieldCheck: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>,
  loader: <svg className="animate-spin" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
};

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

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-indigo-400">
        {Icons.loader}
        <p className="mt-4 text-sm font-medium tracking-widest uppercase opacity-70">Synchronizing Ledger...</p>
      </div>
    );
  }

  if (error) return <div className="p-12 text-center text-red-500 bg-red-500/10 rounded-2xl mx-auto max-w-lg mt-12 border border-red-500/20 shadow-lg shadow-red-500/5">{error}</div>;
  if (!data) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10 pb-6 border-b border-white/10 relative">
        <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2 flex items-center gap-3">
            <span className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
              {Icons.wallet}
            </span>
            Till Account
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl">
            Real-time tracking of expected cash balances and physical vault operations.
          </p>
        </div>
        
        {data.view === 'advanced' && (
          <div className="flex flex-wrap items-center gap-4 bg-slate-900/50 p-3 rounded-2xl border border-white/5 backdrop-blur-md shadow-xl shadow-black/20">
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 ml-1">Date Range</label>
              <div className="flex items-center gap-2">
                <input 
                  type="date" 
                  className="bg-slate-800 text-white border border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  value={startDate} 
                  onChange={e => setStartDate(e.target.value)} 
                />
                <span className="text-slate-500">→</span>
                <input 
                  type="date" 
                  className="bg-slate-800 text-white border border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  value={endDate} 
                  onChange={e => setEndDate(e.target.value)} 
                />
              </div>
            </div>
            <button 
              onClick={() => window.print()} 
              className="mt-5 flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium border border-slate-700 hover:border-slate-600 transition-all hover:shadow-lg hover:-translate-y-0.5"
            >
              {Icons.printer} Print Report
            </button>
          </div>
        )}
      </div>

      {/* BASIC VIEW FOR CASHIERS */}
      {data.view === 'basic' && (
        <div className="flex justify-center items-center py-12">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-[2rem] blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative flex flex-col items-center bg-slate-900/90 border border-white/10 backdrop-blur-2xl p-12 rounded-[2rem] max-w-lg w-full text-center shadow-2xl overflow-hidden">
              <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl"></div>
              <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl"></div>
              
              <div className="mb-6 text-emerald-400/80 bg-emerald-400/10 p-4 rounded-full border border-emerald-400/20 shadow-inner">
                {Icons.shieldCheck}
              </div>
              
              <h2 className="text-slate-400 text-lg font-semibold tracking-wide uppercase mb-2">Expected Cash Deposit</h2>
              <div className={`text-6xl font-black tracking-tighter mb-8 ${data.currentBalance >= 0 ? 'text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-200' : 'text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-rose-300'} drop-shadow-sm`}>
                {fmt(data.currentBalance)}
              </div>
              
              <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm">
                <p className="text-slate-300 text-sm leading-relaxed">
                  This balance reflects the total cash sales processed during your shift, minus any authorized expenses or deposits.
                </p>
                <div className="mt-4 pt-4 border-t border-slate-700/50">
                  <p className="text-emerald-400 text-sm font-medium">
                    Please ensure the physical cash in your till exactly matches this expected balance.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADVANCED VIEW FOR MANAGERS/ADMINS */}
      {data.view === 'advanced' && (
        <div id="till-print-area" className="space-y-12">
          {data.branches.length === 0 ? (
            <div className="text-center py-24 bg-slate-900/30 rounded-3xl border border-white/5 border-dashed">
              <p className="text-slate-400 text-lg">No transactions found for the selected date range.</p>
            </div>
          ) : (
            data.branches.map(branch => (
              <div key={branch.location_id} className="bg-slate-900/60 border border-white/5 rounded-3xl p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden transition-all hover:bg-slate-900/80">
                {/* Background glow for the card */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none"></div>

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 pb-6 border-b border-white/5 relative z-10">
                  <div>
                    <h2 className="text-3xl font-bold text-white mb-2">{branch.location_name}</h2>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
                      Active Branch
                    </span>
                  </div>
                  <div className="mt-6 md:mt-0 text-right bg-slate-950/50 p-5 rounded-2xl border border-white/5 backdrop-blur-md">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Expected Vault Balance</div>
                    <div className={`text-4xl font-black ${branch.current_balance >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                      {fmt(branch.current_balance)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 relative z-10">
                  <div className="group bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-6 rounded-2xl border border-emerald-500/20 hover:border-emerald-500/40 transition-all hover:shadow-[0_0_30px_-5px_rgba(16,185,129,0.3)]">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-emerald-400 text-sm font-semibold uppercase tracking-wider">Total Cash Sales</div>
                      <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400 group-hover:scale-110 transition-transform">{Icons.trendingUp}</div>
                    </div>
                    <div className="text-3xl font-bold text-white">{fmt(branch.total_sales)}</div>
                  </div>
                  
                  <div className="group bg-gradient-to-br from-rose-500/10 to-rose-500/5 p-6 rounded-2xl border border-rose-500/20 hover:border-rose-500/40 transition-all hover:shadow-[0_0_30px_-5px_rgba(244,63,94,0.3)]">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-rose-400 text-sm font-semibold uppercase tracking-wider">Total Expenses</div>
                      <div className="p-2 bg-rose-500/20 rounded-lg text-rose-400 group-hover:scale-110 transition-transform">{Icons.trendingDown}</div>
                    </div>
                    <div className="text-3xl font-bold text-white">{fmt(branch.total_expenses)}</div>
                  </div>
                  
                  <div className="group bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 p-6 rounded-2xl border border-indigo-500/20 hover:border-indigo-500/40 transition-all hover:shadow-[0_0_30px_-5px_rgba(99,102,241,0.3)]">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-indigo-400 text-sm font-semibold uppercase tracking-wider">Cash Deposited</div>
                      <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400 group-hover:scale-110 transition-transform">{Icons.landmark}</div>
                    </div>
                    <div className="text-3xl font-bold text-white">{fmt(branch.total_deposits)}</div>
                  </div>
                </div>

                <div className="relative z-10">
                  <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                    <span className="w-1 h-6 bg-indigo-500 rounded-full"></span>
                    Ledger History
                  </h3>
                  
                  {branch.transactions.length > 0 ? (
                    <div className="bg-slate-950/40 rounded-2xl border border-white/5 overflow-hidden backdrop-blur-sm">
                      <div className="overflow-x-auto max-h-[500px]">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                          <thead className="bg-slate-900/80 sticky top-0 z-20 backdrop-blur-md shadow-sm">
                            <tr>
                              <th className="px-6 py-4 font-semibold text-slate-400 border-b border-white/5 uppercase tracking-wider text-xs">Date & Time</th>
                              <th className="px-6 py-4 font-semibold text-slate-400 border-b border-white/5 uppercase tracking-wider text-xs">Transaction Type</th>
                              <th className="px-6 py-4 font-semibold text-slate-400 border-b border-white/5 uppercase tracking-wider text-xs">Description</th>
                              <th className="px-6 py-4 font-semibold text-slate-400 border-b border-white/5 uppercase tracking-wider text-xs">Operator</th>
                              <th className="px-6 py-4 font-semibold text-slate-400 border-b border-white/5 uppercase tracking-wider text-xs text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {branch.transactions.map((t, idx) => (
                              <tr key={t.id} className="hover:bg-white/[0.02] transition-colors group">
                                <td className="px-6 py-4 text-slate-300">
                                  <div className="flex flex-col">
                                    <span className="font-medium text-white group-hover:text-indigo-300 transition-colors">{new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                    <span className="text-xs text-slate-500">{new Date(t.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider border
                                    ${t.type === 'sale' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                      t.type === 'expense' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 
                                      'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'}`}>
                                    {t.type.replace('_', ' ')}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-slate-300">{t.description}</td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400">
                                      {t.user.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="text-slate-300">{t.user}</span>
                                  </div>
                                </td>
                                <td className={`px-6 py-4 text-right font-bold font-mono ${t.type === 'expense' || t.type === 'deposit_to_bank' ? 'text-rose-400' : 'text-emerald-400'}`}>
                                  {t.type === 'expense' || t.type === 'deposit_to_bank' ? '-' : '+'}{fmt(t.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center bg-slate-950/40 rounded-2xl border border-white/5 border-dashed">
                      <p className="text-slate-500">No ledger transactions recorded yet.</p>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
