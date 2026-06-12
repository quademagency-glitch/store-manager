import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6'];

export default function ShrinkageReport() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await api.get('/analytics/shrinkage');
        setEvents(res || []);
      } catch (err) {
        if (import.meta.env.DEV) console.error("Error fetching shrinkage events:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <div className="p-xl text-center">Loading loss prevention data...</div>;

  // Aggregate data for Pie Chart
  const reasonTotals = events.reduce((acc, event) => {
    let reason = 'unknown';
    if (event.notes) {
      if (event.notes.includes('[THEFT_SUSPECTED]')) reason = 'Theft';
      else if (event.notes.includes('[DAMAGE]')) reason = 'Damage';
      else if (event.notes.includes('[ADMIN_ERROR]')) reason = 'Admin Error';
      else if (event.notes.includes('[UNKNOWN]')) reason = 'Unknown';
    }
    acc[reason] = (acc[reason] || 0) + event.value_lost;
    return acc;
  }, {});

  const pieData = Object.keys(reasonTotals).map(key => ({
    name: key,
    value: reasonTotals[key]
  })).sort((a, b) => b.value - a.value);

  const totalLost = events.reduce((sum, e) => sum + e.value_lost, 0);

  return (
    <div>
      <header className="dashboard-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="dashboard-title">Loss Prevention (Shrinkage)</h1>
          <p className="dashboard-subtitle">Track and analyze inventory losses due to theft, damage, or errors.</p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', marginBottom: '24px' }}>
        {/* Breakdown Chart */}
        <div className="content-card" style={{ padding: '24px', background: 'var(--color-bg-secondary)', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '8px', fontWeight: '600' }}>Financial Impact</h2>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ef4444', marginBottom: '16px' }}>
            ${totalLost.toFixed(2)} <span style={{ fontSize: '1rem', color: 'var(--color-text-muted)', fontWeight: 'normal' }}>Total Lost</span>
          </div>
          
          {pieData.length > 0 ? (
            <div style={{ height: '250px', width: '100%', minWidth: 0, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-muted">No shrinkage events recorded.</p>
          )}
        </div>

        {/* Detailed Events Table */}
        <div className="content-card" style={{ padding: '24px', background: 'var(--color-bg-secondary)', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '16px', fontWeight: '600' }}>Event Log</h2>
          {events.length > 0 ? (
            <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className="data-table">
                <thead style={{ position: 'sticky', top: 0, background: 'var(--color-bg-secondary)' }}>
                  <tr>
                    <th>Date</th>
                    <th>Product</th>
                    <th>Reported By</th>
                    <th>Qty Lost</th>
                    <th>Value</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(e => (
                    <tr key={e.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.created_at).toLocaleDateString()}</td>
                      <td style={{ fontWeight: 500 }}>{e.product?.name || 'Unknown'}</td>
                      <td>{e.user?.name || e.user?.email || 'Unknown'}</td>
                      <td style={{ color: '#ef4444', fontWeight: 'bold' }}>{Math.abs(e.quantity_change)}</td>
                      <td>${e.value_lost.toFixed(2)}</td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{e.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted">No events to display.</p>
          )}
        </div>
      </div>
    </div>
  );
}
