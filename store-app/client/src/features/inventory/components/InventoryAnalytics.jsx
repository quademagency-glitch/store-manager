import { useEffect, useState } from 'react';
import { useInventoryAnalytics } from '../../../hooks/useInventoryAnalytics';
import { useCurrency } from '../../../hooks/useCurrency';
import { usePrintDocument } from '../../../hooks/usePrintDocument';
import { EmptyStateRow } from '../../../components/ui';

export default function InventoryAnalytics() {
  const { summary, valuation, turnover, deadStock, reorderSuggestions, loading, fetchAll } = useInventoryAnalytics();
  const { business } = usePrintDocument();
  const { fmt } = useCurrency(business);
  const [activeSection, setActiveSection] = useState('overview');

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'valuation', label: 'Valuation' },
    { id: 'turnover', label: 'Turnover' },
    { id: 'dead-stock', label: 'Dead Stock' },
    { id: 'reorder', label: 'Reorder' },
  ];

  if (loading && !summary) {
    return (
      <div className="table-loading" style={{ padding: '48px 0' }}>
        <div className="spinner"></div>
        <p>Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="mt-md">
      {/* Section Pills */}
      <div className="flex gap-sm mb-lg flex-wrap">
        {sections.map(s => (
          <button
            key={s.id}
            className={`btn btn-sm ${activeSection === s.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveSection(s.id)}
            style={activeSection === s.id ? { background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-hover))', border: 'none', boxShadow: '0 2px 8px var(--color-accent-glow)' } : {}}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ═══ OVERVIEW ═══ */}
      {activeSection === 'overview' && summary && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div className="glass-panel" style={{ padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '8px' }}>Total SKUs</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-primary)' }}>{summary.total_skus}</div>
            </div>
            <div className="glass-panel" style={{ padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '8px' }}>Inventory Value</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-success)' }}>{fmt(summary.total_inventory_value)}</div>
            </div>
            <div className="glass-panel" style={{ padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '8px' }}>Below Reorder</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: summary.below_reorder_count > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>{summary.below_reorder_count}</div>
            </div>
            <div className="glass-panel" style={{ padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '8px' }}>Dead Stock</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: summary.dead_stock_count > 0 ? 'var(--color-error)' : 'var(--color-success)' }}>{summary.dead_stock_count}</div>
            </div>
          </div>

          {/* Valuation by Category (Preview) */}
          {valuation?.by_category?.length > 0 && (
            <div className="glass-panel" style={{ padding: '20px' }}>
              <h3 className="font-bold mb-md">Value by Category</h3>
              <div className="flex flex-col gap-sm">
                {valuation.by_category.slice(0, 6).map(cat => {
                  const pct = valuation.total_value > 0 ? (cat.value / valuation.total_value) * 100 : 0;
                  return (
                    <div key={cat.category} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '120px', fontSize: '0.9rem', fontWeight: 500, flexShrink: 0 }}>{cat.category}</div>
                      <div style={{ flex: 1, background: 'var(--color-bg-tertiary)', borderRadius: '4px', height: '24px', overflow: 'hidden', position: 'relative' }}>
                        <div style={{
                          height: '100%',
                          width: `${pct}%`,
                          background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-hover))',
                          borderRadius: '4px',
                          minWidth: pct > 0 ? '4px' : '0',
                          transition: 'width 0.6s ease'
                        }} />
                      </div>
                      <div style={{ width: '100px', fontSize: '0.85rem', fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>{fmt(cat.value)}</div>
                      <div style={{ width: '50px', fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'right', flexShrink: 0 }}>{pct.toFixed(0)}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ VALUATION ═══ */}
      {activeSection === 'valuation' && valuation && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* By Category */}
            <div className="glass-panel" style={{ padding: '20px' }}>
              <h3 className="font-bold mb-md">By Category</h3>
              <table className="glass-table">
                <thead>
                  <tr><th>Category</th><th className="text-right">Items</th><th className="text-right">Units</th><th className="text-right">Value</th></tr>
                </thead>
                <tbody>
                  {(valuation.by_category || []).map(cat => (
                    <tr key={cat.category}>
                      <td className="font-medium">{cat.category}</td>
                      <td className="text-right">{cat.item_count}</td>
                      <td className="text-right">{cat.total_units}</td>
                      <td className="text-right font-bold">{fmt(cat.value)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--color-border)' }}>
                    <td className="font-bold">Total</td>
                    <td></td><td></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary)' }}>{fmt(valuation.total_value)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* By Location */}
            <div className="glass-panel" style={{ padding: '20px' }}>
              <h3 className="font-bold mb-md">By Location</h3>
              <table className="glass-table">
                <thead>
                  <tr><th>Location</th><th className="text-right">Items</th><th className="text-right">Value</th></tr>
                </thead>
                <tbody>
                  {(valuation.by_location || []).map(loc => (
                    <tr key={loc.location}>
                      <td className="font-medium">{loc.location}</td>
                      <td className="text-right">{loc.item_count}</td>
                      <td className="text-right font-bold">{fmt(loc.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TURNOVER ═══ */}
      {activeSection === 'turnover' && turnover && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div className="flex justify-between items-center mb-md">
            <h3 className="font-bold m-0">Stock Turnover ({turnover.period_days} days)</h3>
          </div>
          <table className="glass-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th className="text-center">Stock</th>
                <th className="text-center">Sold</th>
                <th className="text-center">Turnover</th>
                <th className="text-center">Daily Rate</th>
                <th className="text-center">Days of Stock</th>
              </tr>
            </thead>
            <tbody>
              {(turnover.products || []).slice(0, 50).map(p => {
                const turnoverColor = p.turnover_rate > 1 ? 'var(--color-success)' : p.turnover_rate > 0.3 ? 'var(--color-warning)' : 'var(--color-error)';
                return (
                  <tr key={p.product_id}>
                    <td>
                      <div className="font-medium">{p.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{p.sku}</div>
                    </td>
                    <td><span className="badge badge-neutral">{p.category}</span></td>
                    <td className="text-center font-bold">{p.current_stock}</td>
                    <td className="text-center">{p.total_sold}</td>
                    <td className="text-center">
                      <span style={{ fontWeight: 700, color: turnoverColor }}>{p.turnover_rate}×</span>
                    </td>
                    <td className="text-center text-secondary">{p.daily_sales_rate}/day</td>
                    <td className="text-center">
                      <span style={{
                        fontWeight: 600,
                        color: p.days_of_stock > 90 ? 'var(--color-error)' : p.days_of_stock > 30 ? 'var(--color-warning)' : 'var(--color-success)'
                      }}>
                        {p.days_of_stock >= 999 ? '∞' : `${p.days_of_stock}d`}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {(!turnover.products || turnover.products.length === 0) && (
                <EmptyStateRow colSpan={7} icon="clipboard" title="No turnover data available" />
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ DEAD STOCK ═══ */}
      {activeSection === 'dead-stock' && deadStock && (
        <div>
          {deadStock.count > 0 && (
            <div className="flex gap-md mb-md">
              <div className="glass-panel" style={{ padding: '16px 20px', flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 9V14M12 17.5V18M12 3L2 21H22L12 3Z" stroke="var(--color-error)" strokeWidth="2" strokeLinejoin="round"/></svg>
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Dead Stock Value</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-error)' }}>{fmt(deadStock.total_dead_value)}</div>
                </div>
              </div>
              <div className="glass-panel" style={{ padding: '16px 20px', flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Products Affected</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-warning)' }}>{deadStock.count} items</div>
                </div>
              </div>
            </div>
          )}
          <div className="glass-panel">
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Product</th><th>Category</th><th>Location</th>
                  <th className="text-center">Qty</th>
                  <th className="text-right">Unit Price</th>
                  <th className="text-right">Total Value</th>
                  <th className="text-center">Age</th>
                </tr>
              </thead>
              <tbody>
                {(deadStock.dead_stock || []).map((d, idx) => (
                  <tr key={`${d.product_id}-${idx}`}>
                    <td>
                      <div className="font-medium">{d.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{d.sku}</div>
                    </td>
                    <td><span className="badge badge-neutral">{d.category}</span></td>
                    <td className="text-muted">{d.location}</td>
                    <td className="text-center font-bold">{d.quantity}</td>
                    <td className="text-right">{fmt(d.price)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-error)' }}>{fmt(d.value)}</td>
                    <td className="text-center text-muted">{d.age_days}d</td>
                  </tr>
                ))}
                {(!deadStock.dead_stock || deadStock.dead_stock.length === 0) && (
                  <EmptyStateRow colSpan={7} icon="checkCircle" variant="success" title="No dead stock" hint="Every product has moved recently." />
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ REORDER SUGGESTIONS ═══ */}
      {activeSection === 'reorder' && reorderSuggestions && (
        <div>
          {reorderSuggestions.count > 0 && (
            <div className="alert alert-warning" style={{ marginBottom: '16px', padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)' }}>
              <strong style={{ color: 'var(--color-warning)' }}>{reorderSuggestions.count} product(s)</strong> need reordering based on current stock levels and sales velocity.
            </div>
          )}
          <div className="glass-panel">
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="text-center">Stock</th>
                  <th className="text-center">Reorder Point</th>
                  <th className="text-center">Daily Sales</th>
                  <th className="text-center">Suggested Qty</th>
                  <th className="text-right">Est. Cost</th>
                  <th>Supplier</th>
                  <th>Urgency</th>
                </tr>
              </thead>
              <tbody>
                {(reorderSuggestions.suggestions || []).map((s, idx) => {
                  const urgencyStyles = {
                    critical: { background: 'var(--color-error-bg)', color: 'var(--color-error)', fontWeight: 700 },
                    high: { background: 'rgba(234,179,8,0.15)', color: 'var(--color-warning)', fontWeight: 600 },
                    medium: { background: 'var(--color-accent-glow)', color: 'var(--color-primary)', fontWeight: 500 }
                  };
                  return (
                    <tr key={`${s.product_id}-${idx}`} style={s.urgency === 'critical' ? { background: 'var(--color-error-bg)' } : {}}>
                      <td>
                        <div className="font-medium">{s.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{s.sku}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{s.location}</div>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: s.current_stock === 0 ? 'var(--color-error)' : 'var(--color-warning)' }}>{s.current_stock}</td>
                      <td className="text-center text-muted">{s.reorder_point}</td>
                      <td className="text-center">{s.daily_sales_rate}/day</td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--color-primary)' }}>{s.suggested_quantity}</td>
                      <td className="text-right font-bold">{fmt(s.estimated_cost)}</td>
                      <td className="text-muted">{s.preferred_supplier?.name || '—'}</td>
                      <td>
                        <span
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            textTransform: 'uppercase',
                            ...urgencyStyles[s.urgency]
                          }}
                        >
                          {s.urgency}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {(!reorderSuggestions.suggestions || reorderSuggestions.suggestions.length === 0) && (
                  <EmptyStateRow colSpan={8} icon="checkCircle" variant="success" title="All stock levels are healthy" hint="Nothing is below its reorder threshold." />
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
