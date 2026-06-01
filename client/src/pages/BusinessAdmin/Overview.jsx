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

      <div className="stats-grid">
        <div className="stat-card" style={{ borderTop: '4px solid #3b82f6' }}>
          <div className="stat-details">
            <span className="stat-label">Locations</span>
            <span className="stat-value">{stats.locations}</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderTop: '4px solid #8b5cf6' }}>
          <div className="stat-details">
            <span className="stat-label">Staff Members</span>
            <span className="stat-value">{stats.users}</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderTop: '4px solid #10b981' }}>
          <div className="stat-details">
            <span className="stat-label">Products in Catalog</span>
            <span className="stat-value">{stats.products}</span>
          </div>
        </div>
      </div>

      <div className="content-card mt-xl">
        <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Recent Sales Activity</h2>
        {stats.recentSales.length > 0 ? (
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
                  <td>${Number(sale.total_amount).toFixed(2)}</td>
                  <td>{sale.payment_method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-muted">No recent sales.</p>
        )}
      </div>
    </div>
  );
}
