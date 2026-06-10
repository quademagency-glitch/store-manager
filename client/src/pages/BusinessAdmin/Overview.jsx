import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Overview() {
  const [stats, setStats] = useState({ 
    todaySalesTotal: 0, 
    totalProducts: 0, 
    lowStockCount: 0, 
    theftAlertsCount: 0 
  });
  const [trendData, setTrendData] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [summaryRes, trendRes, activityRes] = await Promise.all([
          api.get('/analytics/summary').catch(() => ({})),
          api.get('/analytics/sales-trend').catch(() => []),
          api.get('/analytics/recent-activity').catch(() => [])
        ]);

        setStats({
          todaySalesTotal: summaryRes.todaySalesTotal || 0,
          totalProducts: summaryRes.totalProducts || 0,
          lowStockCount: summaryRes.lowStockCount || 0,
          theftAlertsCount: summaryRes.theftAlertsCount || 0
        });
        setTrendData(Array.isArray(trendRes) ? trendRes : []);
        setRecentActivity(Array.isArray(activityRes) ? activityRes : []);
      } catch (err) {
        console.error("Error fetching overview stats", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <div className="p-xl text-center">Loading overview...</div>;

  return (
    <div>
      <header className="dashboard-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="dashboard-title">Business Overview</h1>
          <p className="dashboard-subtitle">High-level metrics across all your locations.</p>
        </div>
      </header>

      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="stat-card" style={{ borderTop: '4px solid #10b981', background: 'var(--color-bg-secondary)', padding: '24px', borderRadius: '8px' }}>
          <div className="stat-details">
            <span className="stat-label" style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Today's Revenue</span>
            <span className="stat-value" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>${Number(stats.todaySalesTotal).toFixed(2)}</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderTop: '4px solid #3b82f6', background: 'var(--color-bg-secondary)', padding: '24px', borderRadius: '8px' }}>
          <div className="stat-details">
            <span className="stat-label" style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Products in Catalog</span>
            <span className="stat-value" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.totalProducts}</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderTop: '4px solid #f59e0b', background: 'var(--color-bg-secondary)', padding: '24px', borderRadius: '8px' }}>
          <div className="stat-details">
            <span className="stat-label" style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Low Stock Alerts</span>
            <span className="stat-value" style={{ fontSize: '1.5rem', fontWeight: 'bold', color: stats.lowStockCount > 0 ? '#d97706' : 'inherit' }}>{stats.lowStockCount}</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderTop: '4px solid #ef4444', background: 'var(--color-bg-secondary)', padding: '24px', borderRadius: '8px' }}>
          <div className="stat-details">
            <span className="stat-label" style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Shrinkage Events</span>
            <span className="stat-value" style={{ fontSize: '1.5rem', fontWeight: 'bold', color: stats.theftAlertsCount > 0 ? '#b91c1c' : 'inherit' }}>{stats.theftAlertsCount}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginTop: '24px' }}>
        
        {/* Trend Chart */}
        <div className="content-card" style={{ padding: '24px', background: 'var(--color-bg-secondary)', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '16px', fontWeight: '600' }}>7-Day Revenue Trend</h2>
          <div style={{ height: '300px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <CartesianGrid stroke="#ccc" strokeDasharray="5 5" vertical={false} />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dx={-10} tickFormatter={(value) => `$${value}`} />
                <Tooltip 
                  formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Revenue']}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="content-card" style={{ padding: '24px', background: 'var(--color-bg-secondary)', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '16px', fontWeight: '600' }}>Recent Activity</h2>
          {recentActivity.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {recentActivity.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>
                  <div style={{ 
                    width: '10px', height: '10px', borderRadius: '50%', marginTop: '6px',
                    background: item.status === 'success' ? '#10b981' : item.status === 'error' ? '#ef4444' : '#f59e0b' 
                  }}></div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, fontSize: '0.95rem', margin: 0 }}>{item.title}</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>{new Date(item.time).toLocaleString()}</p>
                  </div>
                  <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                    {item.amount}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted">No recent activity.</p>
          )}
        </div>

      </div>
    </div>
  );
}
