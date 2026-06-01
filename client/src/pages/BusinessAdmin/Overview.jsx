import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthContext } from '../../lib/AuthContext';

export default function Overview() {
  const { user } = useAuthContext();
  const [stats, setStats] = useState({ locations: 0, users: 0, products: 0, recentSales: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const { data: businessIdData } = await supabase.from('users').select('business_id').eq('id', user.id).single();
        if (!businessIdData) return;
        const businessId = businessIdData.business_id;

        const [locRes, userRes, prodRes, salesRes] = await Promise.all([
          supabase.from('locations').select('id', { count: 'exact' }).eq('business_id', businessId),
          supabase.from('users').select('id', { count: 'exact' }).eq('business_id', businessId),
          supabase.from('products').select('id', { count: 'exact' }).eq('business_id', businessId),
          supabase.from('sales').select('*, sale_items(*)').eq('business_id', businessId).order('created_at', { ascending: false }).limit(5)
        ]);

        setStats({
          locations: locRes.count || 0,
          users: userRes.count || 0,
          products: prodRes.count || 0,
          recentSales: salesRes.data || []
        });
      } catch (err) {
        console.error("Error fetching overview stats", err);
      } finally {
        setLoading(false);
      }
    }
    if (user?.id) fetchStats();
  }, [user?.id]);

  if (loading) return <div className="p-xl text-center">Loading overview...</div>;

  return (
    <div>
      <header className="dashboard-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="dashboard-title">Business Overview</h1>
          <p className="dashboard-subtitle">High-level metrics across all your locations.</p>
        </div>
      </header>

      <div className="stats-grid pa-stats-grid">
        <div className="stat-card pa-stat-card">
          <div className="stat-icon stat-icon-products">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div className="stat-details">
            <span className="stat-label">Locations</span>
            <span className="stat-value">{stats.locations}</span>
          </div>
        </div>
        <div className="stat-card pa-stat-card">
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(139,92,246,0.05))', color: '#a78bfa' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div className="stat-details">
            <span className="stat-label">Staff Members</span>
            <span className="stat-value">{stats.users}</span>
          </div>
        </div>
        <div className="stat-card pa-stat-card">
          <div className="stat-icon stat-icon-sales">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 8L12 4L20 8V16L12 20L4 16V8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M12 12V20" stroke="currentColor" strokeWidth="2" /><path d="M4 8L12 12L20 8" stroke="currentColor" strokeWidth="2" /></svg>
          </div>
          <div className="stat-details">
            <span className="stat-label">Products in Catalog</span>
            <span className="stat-value">{stats.products}</span>
          </div>
        </div>
      </div>

      <div className="pa-activity-section mt-xl">
        <h2 className="pa-section-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
            <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Recent Sales Activity
        </h2>
        <div className="content-card">
          {stats.recentSales.length > 0 ? (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Total</th>
                    <th>Method</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentSales.map(sale => (
                    <tr key={sale.id}>
                      <td>{new Date(sale.created_at).toLocaleString()}</td>
                      <td style={{ fontWeight: '600' }}>${Number(sale.total_amount).toFixed(2)}</td>
                      <td><span className="badge badge-neutral">{sale.payment_method}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted p-md text-center py-xl">No recent sales.</p>
          )}
        </div>
      </div>
    </div>
  );
}
