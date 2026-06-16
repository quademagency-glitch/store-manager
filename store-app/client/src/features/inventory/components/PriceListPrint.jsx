import { useState, useEffect, useMemo } from 'react';
import { useProducts } from '../../../hooks/useProducts';
import { useCurrency } from '../../../hooks/useCurrency';
import { usePrintDocument } from '../../../hooks/usePrintDocument';
import { api } from '../../../lib/api';

export default function PriceListPrint() {
  const { products } = useProducts();
  const { business, printElement } = usePrintDocument();
  const { fmt } = useCurrency(business);

  const [categories, setCategories] = useState([]);
  const [filterCategory, setFilterCategory] = useState('');
  const [groupBy, setGroupBy] = useState('category');
  const [showCostPrice, setShowCostPrice] = useState(false);
  const [showMargin, setShowMargin] = useState(false);

  useEffect(() => {
    api.get('/pricing/categories').then(setCategories).catch(() => setCategories([]));
  }, []);

  const filtered = useMemo(() => {
    let result = products;
    if (filterCategory) {
      result = result.filter(p => p.category === filterCategory);
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [products, filterCategory]);

  const grouped = useMemo(() => {
    if (groupBy === 'none') return { 'All Products': filtered };
    const groups = {};
    filtered.forEach(p => {
      const key = p[groupBy] || 'Uncategorized';
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });
    return groups;
  }, [filtered, groupBy]);

  const handlePrint = () => {
    printElement('price-list-print', 'a4');
  };

  return (
    <div style={{ marginTop: '1rem' }}>
      {/* Controls */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Category</label>
            <select className="form-input" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Group By</label>
            <select className="form-input" value={groupBy} onChange={e => setGroupBy(e.target.value)}>
              <option value="category">Category</option>
              <option value="none">No Grouping</option>
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', paddingBottom: '8px' }}>
            <input type="checkbox" checked={showCostPrice} onChange={e => setShowCostPrice(e.target.checked)} /> Cost Price
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', paddingBottom: '8px' }}>
            <input type="checkbox" checked={showMargin} onChange={e => setShowMargin(e.target.checked)} /> Margin %
          </label>
          <button
            className="btn btn-primary"
            onClick={handlePrint}
            disabled={filtered.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-hover))', border: 'none' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print Price List ({filtered.length})
          </button>
        </div>
      </div>

      {/* On-screen Preview */}
      <div className="glass-panel" style={{ maxHeight: '500px', overflowY: 'auto' }}>
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group} style={{ marginBottom: '24px' }}>
            {groupBy !== 'none' && (
              <div style={{ padding: '8px 16px', background: 'var(--color-bg-tertiary)', fontWeight: 600, fontSize: '0.9rem', borderBottom: '1px solid var(--color-border)' }}>
                {group} ({items.length})
              </div>
            )}
            <table className="glass-table">
              <thead>
                <tr>
                  <th>#</th><th>Product</th><th>SKU</th>
                  {groupBy === 'none' && <th>Category</th>}
                  {showCostPrice && <th style={{ textAlign: 'right' }}>Cost</th>}
                  <th style={{ textAlign: 'right' }}>Price</th>
                  {showMargin && <th style={{ textAlign: 'right' }}>Margin</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((p, idx) => {
                  const cost = parseFloat(p.cost_price) || 0;
                  const price = parseFloat(p.price) || 0;
                  const margin = price > 0 && cost > 0 ? ((price - cost) / price * 100).toFixed(1) : null;
                  return (
                    <tr key={p.id}>
                      <td className="text-muted">{idx + 1}</td>
                      <td className="font-medium">{p.name}</td>
                      <td><code className="text-mono" style={{ fontSize: '0.85rem' }}>{p.sku}</code></td>
                      {groupBy === 'none' && <td><span className="badge badge-neutral">{p.category}</span></td>}
                      {showCostPrice && <td style={{ textAlign: 'right', color: 'var(--color-text-muted)' }}>{fmt(cost)}</td>}
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(price)}</td>
                      {showMargin && <td style={{ textAlign: 'right', color: margin && parseFloat(margin) > 0 ? 'var(--color-success)' : 'var(--color-error)' }}>{margin ? `${margin}%` : '—'}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* ═══ PRINTABLE AREA ═══ */}
      <div id="price-list-print" className="printable-area" style={{ display: 'none' }}>
        <style>{`
          @media print {
            #price-list-print { display: block !important; font-family: Arial, sans-serif; color: #000; }
            .pl-header { text-align: center; margin-bottom: 8mm; padding-bottom: 4mm; border-bottom: 2px solid #000; }
            .pl-header h1 { font-size: 16pt; margin: 0 0 2mm 0; }
            .pl-header .pl-sub { font-size: 9pt; color: #666; }
            .pl-group-title { font-size: 11pt; font-weight: 700; padding: 4mm 0 2mm 0; border-bottom: 1px solid #ccc; margin-bottom: 2mm; }
            .pl-table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 6mm; }
            .pl-table th { text-align: left; padding: 2mm 3mm; border-bottom: 2px solid #333; font-size: 8pt; text-transform: uppercase; color: #555; }
            .pl-table td { padding: 2mm 3mm; border-bottom: 0.5pt solid #ddd; }
            .pl-table .pl-price { text-align: right; font-weight: 700; font-size: 10pt; }
            .pl-table .pl-cost { text-align: right; color: #888; }
            .pl-table .pl-margin { text-align: right; font-size: 8pt; }
            .pl-table .pl-num { color: #999; width: 8mm; }
            .pl-table .pl-sku { font-family: monospace; font-size: 8pt; color: #666; }
            .pl-footer { text-align: center; font-size: 8pt; color: #999; margin-top: 6mm; padding-top: 4mm; border-top: 1px solid #ddd; }
          }
        `}</style>
        <div className="pl-header">
          <h1>{business?.business_name || 'Price List'}</h1>
          <div className="pl-sub">
            Price List • {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            {filterCategory && ` • ${filterCategory}`}
            {` • ${filtered.length} items`}
          </div>
        </div>

        {Object.entries(grouped).map(([group, items]) => (
          <div key={group}>
            {groupBy !== 'none' && <div className="pl-group-title">{group} ({items.length})</div>}
            <table className="pl-table">
              <thead>
                <tr>
                  <th className="pl-num">#</th>
                  <th>Product</th>
                  <th>SKU</th>
                  {groupBy === 'none' && <th>Category</th>}
                  {showCostPrice && <th style={{ textAlign: 'right' }}>Cost</th>}
                  <th style={{ textAlign: 'right' }}>Price</th>
                  {showMargin && <th style={{ textAlign: 'right' }}>Margin</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((p, idx) => {
                  const cost = parseFloat(p.cost_price) || 0;
                  const price = parseFloat(p.price) || 0;
                  const margin = price > 0 && cost > 0 ? ((price - cost) / price * 100).toFixed(1) : null;
                  return (
                    <tr key={p.id}>
                      <td className="pl-num">{idx + 1}</td>
                      <td>{p.name}</td>
                      <td className="pl-sku">{p.sku}</td>
                      {groupBy === 'none' && <td>{p.category}</td>}
                      {showCostPrice && <td className="pl-cost">{fmt(cost)}</td>}
                      <td className="pl-price">{fmt(price)}</td>
                      {showMargin && <td className="pl-margin">{margin ? `${margin}%` : '—'}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        <div className="pl-footer">
          {business?.business_name} • Prices effective {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} • Subject to change
        </div>
      </div>
    </div>
  );
}
