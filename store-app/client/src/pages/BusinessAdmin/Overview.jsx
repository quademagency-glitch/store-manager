import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { reportError } from '../../lib/errorReporting';
import { useToast } from '../../hooks/useToast';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import { useCurrency } from '../../hooks/useCurrency';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ErrorBanner, PageHeader } from '../../components/ui';
import { IS_MOCK } from '../../lib/mockMode';

export default function Overview() {
  const navigate = useNavigate();
  const toast = useToast();
  const { business } = usePrintDocument();
  const { fmt, currencySymbol } = useCurrency(business);
  const [stats, setStats] = useState({
    todaySalesTotal: 0,
    totalProducts: 0,
    lowStockCount: 0,
    theftAlertsCount: 0
  });
  const [trendData, setTrendData] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [setupStatus, setSetupStatus] = useState(null);
  const [setupBannerHidden, setSetupBannerHidden] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Hoisted out of the effect so the error banner can offer a retry.
  const fetchData = useCallback(async () => {
    setLoading(true);

    // allSettled, NOT Promise.all with a per-call .catch fallback.
    //
    // This previously read `.catch(() => ({}))` on each request, which meant a
    // failed /analytics/summary produced an empty object, every stat fell back
    // to 0, the outer catch never fired, and setError(null) ran, so the page
    // rendered a completely normal-looking dashboard reading GHS 0 sales, no
    // products, no alerts. A business owner had no way to tell that apart from
    // a genuinely quiet day. Partial failure has to be visible.
    const [summary, trend, activity] = await Promise.allSettled([
      api.get('/analytics/summary'),
      api.get('/analytics/sales-trend'),
      api.get('/analytics/recent-activity'),
    ]);

    const summaryData = summary.status === 'fulfilled' ? (summary.value ?? {}) : {};
    setStats({
      todaySalesTotal: summaryData.todaySalesTotal || 0,
      totalProducts: summaryData.totalProducts || 0,
      lowStockCount: summaryData.lowStockCount || 0,
      theftAlertsCount: summaryData.theftAlertsCount || 0,
    });
    setTrendData(trend.status === 'fulfilled' && Array.isArray(trend.value) ? trend.value : []);
    setRecentActivity(activity.status === 'fulfilled' && Array.isArray(activity.value) ? activity.value : []);

    const failures = [
      summary.status === 'rejected' && 'summary figures',
      trend.status === 'rejected' && 'the sales trend',
      activity.status === 'rejected' && 'recent activity',
    ].filter(Boolean);

    if (failures.length > 0) {
      const err = new Error(
        `Couldn't load ${failures.join(', ')}. The figures below may be incomplete.`
      );
      err.userMessage = err.message;
      setError(err);
    } else {
      setError(null);
    }

    setLoading(false);
  }, []);

  /**
   * Triggers the streaming ZIP export.
   *
   * Uses fetch + a blob rather than pointing the browser at the URL directly,
   * because the endpoint needs the Authorization header, a plain link or
   * window.open cannot carry one, and the request would just 401.
   */
  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await api.getBlob('/businesses/me/export');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quaderp-export-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded.');
    } catch (err) {
      // 429 is the once-an-hour limit, which deserves its own message, 
      // "export failed" would send someone hunting for a fault that isn't there.
      if (err?.status === 429) {
        toast.error('An export can only be generated once per hour. Try again shortly.');
      } else {
        toast.error(err?.userMessage || "Couldn't generate the export. Please try again.");
      }
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Progressive enhancement, the setup checklist banner just doesn't appear
    // if this fails, which is not worth interrupting the user over. apiError
    // still routes it to the error sink.
    api.get('/businesses/me/setup-status')
      .then(setSetupStatus)
      .catch(err => reportError(err, { context: 'overview:setup-status' }));
  }, [fetchData]);

  if (loading) return <div className="p-xl text-center">Loading overview...</div>;

  const setupComplete = setupStatus ? setupStatus.steps.filter(s => s.complete).length : 0;
  const setupTotal = setupStatus?.steps.length || 0;
  const showSetupBanner = setupStatus && !setupStatus.dismissed && !setupBannerHidden && setupComplete < setupTotal;

  const dismissSetupBanner = async () => {
    setSetupBannerHidden(true);
    try {
      const businessId = (await api.get('/businesses/me')).id;
      await api.put(`/businesses/${businessId}/setup-status/dismiss`);
    } catch {
      // banner stays hidden for this session regardless
    }
  };

  return (
    <div>
      <PageHeader
        title="Business Overview"
        subtitle="High-level metrics across all your locations."
        actions={
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleExport}
            disabled={exporting}
            title="Download every record for this business as a ZIP of CSV files"
          >
            {exporting ? 'Preparing export…' : 'Export all data'}
          </button>
        }
      />

      <ErrorBanner error={error} onRetry={fetchData} />

      {showSetupBanner && (
        <div className="alert alert-info mb-xl flex justify-between items-center gap-md">
          <span>{setupComplete} of {setupTotal} setup steps complete. Finish setting up your business.</span>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button className="btn btn-sm btn-primary" onClick={() => navigate('/business-admin/setup')}>Finish Setup</button>
            <button className="btn btn-sm btn-outline" onClick={dismissSetupBanner}>Dismiss</button>
          </div>
        </div>
      )}

      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="stat-card" style={{ borderTop: '4px solid var(--color-success)', background: 'var(--color-bg-secondary)', padding: '24px', borderRadius: '8px' }}>
          <div className="stat-details">
            <span className="stat-label" style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Today's Revenue</span>
            <span className="stat-value" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{fmt(stats.todaySalesTotal)}</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderTop: '4px solid var(--color-accent-primary)', background: 'var(--color-bg-secondary)', padding: '24px', borderRadius: '8px' }}>
          <div className="stat-details">
            <span className="stat-label" style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Products in Catalog</span>
            <span className="stat-value" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.totalProducts}</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderTop: '4px solid var(--color-warning)', background: 'var(--color-bg-secondary)', padding: '24px', borderRadius: '8px' }}>
          <div className="stat-details">
            <span className="stat-label" style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Low Stock Alerts</span>
            <span className="stat-value" style={{ fontSize: '1.5rem', fontWeight: 'bold', color: stats.lowStockCount > 0 ? '#d97706' : 'inherit' }}>{stats.lowStockCount}</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderTop: '4px solid var(--color-error)', background: 'var(--color-bg-secondary)', padding: '24px', borderRadius: '8px' }}>
          <div className="stat-details">
            <span className="stat-label" style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Shrinkage Events</span>
            <span className="stat-value" style={{ fontSize: '1.5rem', fontWeight: 'bold', color: stats.theftAlertsCount > 0 ? '#b91c1c' : 'inherit' }}>{stats.theftAlertsCount}</span>
          </div>
        </div>
      </div>

      <div className="overview-bento">
        
        {/* Trend Chart */}
        <div className="content-card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '16px', fontWeight: '600' }}>7-Day Revenue Trend</h2>
          <div style={{ height: '300px', width: '100%', minWidth: 0, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <Line isAnimationActive={!IS_MOCK} type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <CartesianGrid stroke="#ccc" strokeDasharray="5 5" vertical={false} />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dx={-10} tickFormatter={(value) => `${currencySymbol}${value}`} />
                <Tooltip 
                  formatter={(value) => [fmt(value), 'Revenue']}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="content-card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '16px', fontWeight: '600' }}>Recent Activity</h2>
          {recentActivity.length > 0 ? (
            <div className="flex flex-col gap-md">
              {recentActivity.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>
                  <div style={{ 
                    width: '10px', height: '10px', borderRadius: '50%', marginTop: '6px',
                    background: item.status === 'success' ? 'var(--color-success)' : item.status === 'error' ? 'var(--color-error)' : 'var(--color-warning)' 
                  }}></div>
                  <div className="flex-1">
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
