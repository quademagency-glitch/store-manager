import { useState, useEffect, useMemo } from 'react';
import { useProducts } from '../../../hooks/useProducts';
import { useCurrency } from '../../../hooks/useCurrency';
import { usePrintDocument } from '../../../hooks/usePrintDocument';
import { api } from '../../../lib/api';
import { reportError } from '../../../lib/errorReporting';

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
    // Swallowing this rendered a permanently empty category picker with
    // nothing on screen saying why, see the note in lib/api.mock.js.
    api.get('/pricing/categories')
      .then(setCategories)
      .catch(err => {
        setCategories([]);
        reportError(err, { context: 'pricing:categories' });
      });
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
    <div className="mt-md">
      {/* Controls */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px' }}>
        <div className="flex gap-md items-end flex-wrap">
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
          <div key={group} className="mb-lg">
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
                  {showCostPrice && <th className="text-right">Cost</th>}
                  <th className="text-right">Price</th>
                  {showMargin && <th className="text-right">Margin</th>}
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
                      {showCostPrice && <td className="text-right text-muted">{fmt(cost)}</td>}
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(price)}</td>
                      {showMargin && <td style={{ textAlign: 'right', color: margin && parseFloat(margin) > 0 ? 'var(--color-success)' : 'var(--color-error)' }}>{margin ? `${margin}%` : '-'}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* ═══ PRINTABLE AREA ═══ */}
      {/* Layout lives in styles/price-print.css. See the note there: an inline
          <style> element is blocked by the CSP and this printed blank. */}
      <div id="price-list-print" className="printable-area print-only">
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
                  {showCostPrice && <th className="text-right">Cost</th>}
                  <th className="text-right">Price</th>
                  {showMargin && <th className="text-right">Margin</th>}
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
                      {showMargin && <td className="pl-margin">{margin ? `${margin}%` : '-'}</td>}
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
