import { useState, useEffect, useMemo } from 'react';
import { useAnalytics } from '../hooks/useAnalytics';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Reconciliation() {
  const { reconciliationData, loading, fetchReconciliation, error } = useAnalytics();
  
  // Default to today
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchReconciliation(selectedDate);
  }, [fetchReconciliation, selectedDate]);

  const fmt = (amount) => `$${Number(amount || 0).toFixed(2)}`;

  // Calculate totals across all staff
  const totals = useMemo(() => {
    if (!reconciliationData || reconciliationData.length === 0) {
      return { salesTotal: 0, shrinkageTotal: 0, discountsTotal: 0, voidsTotal: 0 };
    }
    return reconciliationData.reduce((acc, row) => ({
      salesTotal: acc.salesTotal + Number(row.totalSalesRevenue || 0),
      shrinkageTotal: acc.shrinkageTotal + Number(row.totalShrinkageValue || 0),
      discountsTotal: acc.discountsTotal + Number(row.totalDiscounts || 0),
      voidsTotal: acc.voidsTotal + Number(row.totalVoidValue || 0)
    }), { salesTotal: 0, shrinkageTotal: 0, discountsTotal: 0, voidsTotal: 0 });
  }, [reconciliationData]);

  // Format data for the chart
  const chartData = useMemo(() => {
    if (!reconciliationData) return [];
    return reconciliationData.map(row => ({
      name: row.name ? row.name.split(' ')[0] : 'Unknown',
      Sales: Number(row.totalSalesRevenue || 0),
      Shrinkage: Number(row.totalShrinkageValue || 0),
      Net: Number(row.totalSalesRevenue || 0) - Number(row.totalShrinkageValue || 0)
    }));
  }, [reconciliationData]);

  return (
    <div className="reconciliation-page page-container py-xl">
      <header className="page-header flex justify-between items-end">
        <div>
          <h1 className="page-title">End-of-day Reconciliation</h1>
          <p className="page-subtitle">Daily summary of sales and shrinkage per staff member.</p>
        </div>
        
        <div className="flex gap-md items-center">
          <label className="text-sm text-muted font-medium">Select Date:</label>
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="input"
            style={{ width: 'auto' }}
            max={new Date().toISOString().split('T')[0]}
          />
        </div>
      </header>

      {/* Totals Summary */}
      <div className="stats-grid mb-xl" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-lg)' }}>
        <div className="pos-glass-card" style={{ padding: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
          <span className="stat-label" style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Day Sales</span>
          <span className="stat-value text-success" style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--color-success)' }}>{fmt(totals.salesTotal)}</span>
        </div>
        <div className="pos-glass-card" style={{ padding: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
          <span className="stat-label" style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Day Discounts</span>
          <span className="stat-value text-warning" style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--color-warning)' }}>{fmt(totals.discountsTotal)}</span>
        </div>
        <div className="pos-glass-card" style={{ padding: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
          <span className="stat-label" style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Day Voids</span>
          <span className="stat-value text-error" style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--color-error)' }}>{fmt(totals.voidsTotal)}</span>
        </div>
        <div className="pos-glass-card" style={{ padding: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
          <span className="stat-label" style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Day Shrinkage</span>
          <span className="stat-value text-error" style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--color-error)' }}>{fmt(totals.shrinkageTotal)}</span>
        </div>
      </div>

      {error && (
        <div className="alert alert-error mb-xl">
          <p>{error}</p>
        </div>
      )}

      {/* Analytics Bento Grid */}
      <div className="bento-grid mb-xl">
        <div className="pos-glass-card" style={{ minHeight: '350px', padding: 'var(--space-xl)' }}>
          <h3 className="bento-title mb-lg" style={{ fontSize: '1.25rem', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>Net Contribution by Staff</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--color-text-secondary)" tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis stroke="var(--color-text-secondary)" tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(10px)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', padding: '12px' }}
                  itemStyle={{ color: 'var(--color-text-primary)' }}
                />
                <Bar dataKey="Sales" fill="#00a4ef" radius={[6, 6, 0, 0]} barSize={32} />
                <Bar dataKey="Shrinkage" fill="#f87171" radius={[6, 6, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted" style={{ minHeight: '280px' }}>No data available for chart</div>
          )}
        </div>
      </div>

      <div className="pos-glass-card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: 'var(--space-xl) var(--space-xl) var(--space-md)' }}>
          <h3 className="bento-title m-0" style={{ fontSize: '1.25rem', fontWeight: 600 }}>Detailed Ledger</h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="glass-table w-full" style={{ borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                <th style={{ padding: '1rem var(--space-xl)', color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Staff Member</th>
                <th style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Role</th>
                <th style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sales (Rev/Cnt)</th>
                <th style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Discounts</th>
                <th style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Voids (Val/Cnt)</th>
                <th style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Shrinkage (Val/Cnt)</th>
                <th style={{ padding: '1rem var(--space-xl)', color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Contribution</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center py-xl text-muted">
                    <div className="spinner mb-sm mx-auto"></div>
                    <p>Loading reconciliation data...</p>
                  </td>
                </tr>
              ) : reconciliationData.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '4rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>📊</div>
                    <p>No activity found for this date.</p>
                  </td>
                </tr>
              ) : (
                reconciliationData.map(row => {
                  const net = row.totalSalesRevenue - row.totalShrinkageValue;
                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background-color 0.2s' }}>
                      <td style={{ padding: '1rem var(--space-xl)' }}>
                        <div className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{row.name || 'Unknown'}</div>
                        <div className="text-sm text-muted">{row.email}</div>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span className={`badge ${row.role?.toLowerCase() === 'manager' ? 'badge-primary' : 'badge-secondary'}`}>
                          {row.role}
                        </span>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div className="font-medium text-success">{fmt(row.totalSalesRevenue)}</div>
                        <div className="text-sm text-muted">{row.salesCount} trans.</div>
                      </td>
                      <td style={{ padding: '1rem' }} className="font-medium text-warning">{fmt(row.totalDiscounts)}</td>
                      <td style={{ padding: '1rem' }}>
                        <div className="font-medium text-error">{fmt(row.totalVoidValue)}</div>
                        <div className="text-sm text-muted">{row.voidCount} void(s)</div>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div className="font-medium text-error">{fmt(row.totalShrinkageValue)}</div>
                        <div className="text-sm text-muted">{row.shrinkageCount} item(s)</div>
                      </td>
                      <td style={{ padding: '1rem var(--space-xl)' }}>
                        <div className="font-bold" style={{ color: net >= 0 ? 'var(--color-success)' : 'var(--color-error)', fontSize: '1.1rem' }}>
                          {fmt(net)}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
