import { useState, useEffect } from 'react';
import { useReports } from '../../hooks/useReports';
import { useToast } from '../../hooks/useToast';
import { api } from '../../lib/api';
import '../../styles/reports.css';

export default function ProfitLoss() {
  const toast = useToast();
  const { loading, pnl, fetchPnl } = useReports();
  const [locations, setLocations] = useState([]);
  const [filters, setFilters] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    locationId: '',
  });

  useEffect(() => {
    api.get('/locations').then(res => setLocations(Array.isArray(res) ? res : [])).catch(() => {});
    fetchPnl(filters.startDate, filters.endDate);
  }, []);

  const handleApply = () => {
    fetchPnl(filters.startDate, filters.endDate, filters.locationId || undefined);
  };

  const handleExport = () => {
    if (!pnl) return;
    const rows = [
      ['Profit & Loss Report'],
      [`Period: ${filters.startDate} to ${filters.endDate}`],
      [''],
      ['Category', 'Amount'],
      ['Revenue', pnl.revenue.toFixed(2)],
      ['Cost of Goods Sold (COGS)', `(${pnl.cogs.toFixed(2)})`],
      ['Gross Profit', pnl.grossProfit.toFixed(2)],
      ['Operating Expenses', `(${pnl.expenses.toFixed(2)})`],
      ['Commission Payouts', `(${pnl.commissions.toFixed(2)})`],
      ['Net Profit', pnl.netProfit.toFixed(2)],
      [''],
      ['Gross Margin', `${pnl.grossMargin}%`],
      ['Net Margin', `${pnl.netMargin}%`],
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pnl_${filters.startDate}_${filters.endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('P&L exported!');
  };

  const fmt = (v) => `$${Math.abs(Number(v || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="reports-page">
      <div className="page-header">
        <div>
          <h1>Profit & Loss</h1>
          <p className="page-subtitle">Income statement for your business</p>
        </div>
        <button className="btn btn-secondary" onClick={handleExport} disabled={!pnl}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7 10l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="hr-filter-bar">
        <div className="hr-filters">
          <input type="date" className="form-input" value={filters.startDate} onChange={e => setFilters(p => ({ ...p, startDate: e.target.value }))} />
          <input type="date" className="form-input" value={filters.endDate} onChange={e => setFilters(p => ({ ...p, endDate: e.target.value }))} />
          {locations.length > 1 && (
            <select className="form-input" value={filters.locationId} onChange={e => setFilters(p => ({ ...p, locationId: e.target.value }))}>
              <option value="">All Locations</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          <button className="btn btn-primary" onClick={handleApply} disabled={loading}>
            {loading ? 'Loading...' : 'Generate'}
          </button>
        </div>
      </div>

      {/* P&L Statement */}
      {pnl && (
        <div className="pnl-statement">
          <div className="pnl-row pnl-header">
            <span>Revenue</span>
            <span className="pnl-amount positive">{fmt(pnl.revenue)}</span>
          </div>

          <div className="pnl-row pnl-deduction">
            <span>Less: Cost of Goods Sold</span>
            <span className="pnl-amount negative">({fmt(pnl.cogs)})</span>
          </div>

          <div className="pnl-divider"></div>
          <div className="pnl-row pnl-subtotal">
            <span>Gross Profit</span>
            <span className={`pnl-amount ${pnl.grossProfit >= 0 ? 'positive' : 'negative'}`}>{fmt(pnl.grossProfit)}</span>
          </div>
          <div className="pnl-row pnl-margin">
            <span>Gross Margin</span>
            <span className="pnl-amount">{pnl.grossMargin}%</span>
          </div>

          <div className="pnl-divider"></div>

          <div className="pnl-row pnl-deduction">
            <span>Operating Expenses</span>
            <span className="pnl-amount negative">({fmt(pnl.expenses)})</span>
          </div>
          <div className="pnl-row pnl-deduction">
            <span>Commission Payouts</span>
            <span className="pnl-amount negative">({fmt(pnl.commissions)})</span>
          </div>

          <div className="pnl-divider pnl-divider-bold"></div>
          <div className="pnl-row pnl-total">
            <span>Net Profit</span>
            <span className={`pnl-amount ${pnl.netProfit >= 0 ? 'positive' : 'negative'}`}>
              {pnl.netProfit < 0 ? `(${fmt(pnl.netProfit)})` : fmt(pnl.netProfit)}
            </span>
          </div>
          <div className="pnl-row pnl-margin">
            <span>Net Margin</span>
            <span className="pnl-amount">{pnl.netMargin}%</span>
          </div>
        </div>
      )}

      {!pnl && !loading && (
        <div className="empty-state-card" style={{ marginTop: '32px' }}>
          <p>Select a date range and click Generate to view your P&L.</p>
        </div>
      )}
    </div>
  );
}
