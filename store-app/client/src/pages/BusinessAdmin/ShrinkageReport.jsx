import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import { useCurrency } from '../../hooks/useCurrency';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ErrorBanner, PageHeader } from '../../components/ui';
import { IS_MOCK } from '../../lib/mockMode';

const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6'];

export default function ShrinkageReport() {
  const { business } = usePrintDocument();
  const { fmt } = useCurrency(business);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Hoisted out of the effect so the error banner can offer a retry.
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/analytics/shrinkage');
      setEvents(res || []);
      setError(null);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error fetching shrinkage events:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  /* The bracketed marker is how the reason is stored, and it is already on
     screen as a labelled chart segment, printing it again in front of every
     note just leaks an internal token into the operator's reading. */
  const noteText = (notes) => (notes || '').replace(/^\s*\[[A-Z_]+\]\s*/, '');

  const totalLost = events.reduce((sum, e) => sum + e.value_lost, 0);

  return (
    <div>
      <PageHeader
        title="Loss Prevention (Shrinkage)"
        subtitle="Track and analyze inventory losses due to theft, damage, or errors."
      />

      <ErrorBanner error={error} onRetry={fetchData} />

      {/* The event log carries six columns including free-text notes and needs
          every pixel; the donut beside it is mostly white space below the
          chart. At 1fr 2fr the table wanted 685px in a 633px card and the
          Notes column was cut off at the card's edge on a 1440px screen. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2.6fr', gap: '24px', marginBottom: '24px' }}>
        {/* Breakdown Chart */}
        <div className="content-card" style={{ padding: '24px', background: 'var(--color-bg-secondary)', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '8px', fontWeight: '600' }}>Financial Impact</h2>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-error)', marginBottom: '16px' }}>
            {fmt(totalLost)} <span style={{ fontSize: '1rem', color: 'var(--color-text-muted)', fontWeight: 'normal' }}>Total Lost</span>
          </div>
          
          {pieData.length > 0 ? (
            <div style={{ height: '250px', width: '100%', minWidth: 0, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <PieChart>
                  <Pie isAnimationActive={!IS_MOCK}
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
                  <Tooltip formatter={(value) => fmt(value)} />
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
            // overflowX matters as much as overflowY here: notes are free
            // text, and a long one pushed the Notes column straight off the
            // card's right edge where it was silently cut in half.
            <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto', overflowX: 'auto' }}>
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
                      <td className="font-medium">{e.product?.name || 'Unknown'}</td>
                      <td>{e.user?.name || e.user?.email || 'Unknown'}</td>
                      <td style={{ color: 'var(--color-error)', fontWeight: 'bold' }}>{Math.abs(e.quantity_change)}</td>
                      <td>{fmt(e.value_lost)}</td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{noteText(e.notes)}</td>
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
