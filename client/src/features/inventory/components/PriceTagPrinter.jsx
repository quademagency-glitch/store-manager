import { useState, useEffect } from 'react';
import { useProducts } from '../../../hooks/useProducts';
import { useCurrency } from '../../../hooks/useCurrency';
import { usePrintDocument } from '../../../hooks/usePrintDocument';
import { api } from '../../../lib/api';

const LAYOUTS = {
  'small-labels': { label: 'Small Labels', desc: '6 per page (3×2 grid)', cols: 3, rows: 2, icon: '▦' },
  'shelf-strips': { label: 'Shelf Strips', desc: 'Full-width rows', cols: 1, rows: 8, icon: '▬' },
  'full-grid': { label: 'Full Grid', desc: '20 per page (4×5)', cols: 4, rows: 5, icon: '▩' },
};

export default function PriceTagPrinter() {
  const { products } = useProducts();
  const { business, printElement } = usePrintDocument();
  const { fmt } = useCurrency(business);

  const [categories, setCategories] = useState([]);
  const [filterCategory, setFilterCategory] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [layout, setLayout] = useState('small-labels');
  const [showCostPrice, setShowCostPrice] = useState(false);
  const [showSku, setShowSku] = useState(true);
  const [showCategory, setShowCategory] = useState(false);

  useEffect(() => {
    api.get('/pricing/categories').then(setCategories).catch(() => setCategories([]));
  }, []);

  const filtered = products.filter(p => {
    if (filterCategory && p.category !== filterCategory) return false;
    if (search) {
      const lower = search.toLowerCase();
      if (!p.name.toLowerCase().includes(lower) && !p.sku.toLowerCase().includes(lower)) return false;
    }
    return true;
  });

  const selectedProducts = products.filter(p => selectedIds.has(p.id));
  const printProducts = selectedProducts.length > 0 ? selectedProducts : filtered;

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)));
    }
  };

  const layoutConfig = LAYOUTS[layout];

  const handlePrint = () => {
    printElement('price-tags-print', 'a4');
  };

  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px' }}>
        {/* Left: Product Selection */}
        <div>
          {/* Filters */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div className="search-bar" style={{ flex: 1, minWidth: '200px' }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="search-icon">
                <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M18 18L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input type="text" placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="search-input" />
            </div>
            <select className="form-input" value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ width: '180px' }}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Selection Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', padding: '8px 0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleAll} />
              Select All ({filtered.length})
            </label>
            <span className="badge badge-neutral">{selectedIds.size} selected</span>
          </div>

          {/* Product List */}
          <div className="glass-panel" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table className="glass-table">
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <th style={{ width: '32px' }}></th>
                  <th>Product</th><th>SKU</th><th>Category</th>
                  <th style={{ textAlign: 'right' }}>Price</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} onClick={() => toggleSelect(p.id)} style={{ cursor: 'pointer', background: selectedIds.has(p.id) ? 'rgba(99,102,241,0.06)' : undefined }}>
                    <td><input type="checkbox" checked={selectedIds.has(p.id)} readOnly /></td>
                    <td className="font-medium">{p.name}</td>
                    <td><code className="text-mono" style={{ fontSize: '0.85rem' }}>{p.sku}</code></td>
                    <td><span className="badge badge-neutral">{p.category}</span></td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(p.price)}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan="5" className="text-center py-xl text-muted">No products found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Layout Options & Print */}
        <div>
          <div className="glass-panel" style={{ padding: '20px', marginBottom: '16px' }}>
            <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '16px' }}>Tag Layout</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {Object.entries(LAYOUTS).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setLayout(key)}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: layout === key ? '2px solid var(--color-accent)' : '2px solid var(--color-border)',
                    background: layout === key ? 'rgba(99,102,241,0.06)' : 'var(--color-bg-secondary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: '12px'
                  }}
                >
                  <span style={{ fontSize: '1.6rem', opacity: 0.7 }}>{cfg.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: layout === key ? 'var(--color-accent)' : 'var(--color-text-primary)' }}>{cfg.label}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{cfg.desc}</div>
                  </div>
                </button>
              ))}
            </div>

            <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '12px' }}>Tag Options</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={showSku} onChange={e => setShowSku(e.target.checked)} /> Show SKU
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={showCategory} onChange={e => setShowCategory(e.target.checked)} /> Show Category
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={showCostPrice} onChange={e => setShowCostPrice(e.target.checked)} /> Show Cost Price
              </label>
            </div>

            <button
              className="btn btn-primary"
              onClick={handlePrint}
              disabled={printProducts.length === 0}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-hover))', border: 'none' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Print {printProducts.length} Tag(s)
            </button>
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
            {selectedIds.size === 0 ? 'No selection = prints all filtered products' : `${selectedIds.size} product(s) selected`}
          </div>
        </div>
      </div>

      {/* ═══ PRINTABLE AREA ═══ */}
      <div id="price-tags-print" className="printable-area" style={{ display: 'none' }}>
        <style>{`
          @media print {
            #price-tags-print { display: block !important; }
            .tag-page { page-break-after: always; padding: 10mm; }
            .tag-page:last-child { page-break-after: avoid; }
            .tag-grid { display: grid; gap: 4mm; height: 100%; }
            .tag-grid.cols-1 { grid-template-columns: 1fr; }
            .tag-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
            .tag-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }
            .price-tag {
              border: 1px dashed #ccc;
              padding: 8px 12px;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              text-align: center;
              overflow: hidden;
            }
            .price-tag .tag-name { font-weight: 700; font-size: 11pt; margin-bottom: 2px; line-height: 1.2; }
            .price-tag .tag-sku { font-size: 8pt; color: #666; font-family: monospace; margin-bottom: 4px; }
            .price-tag .tag-category { font-size: 7pt; color: #999; margin-bottom: 4px; text-transform: uppercase; }
            .price-tag .tag-price { font-size: 18pt; font-weight: 900; color: #000; }
            .price-tag .tag-cost { font-size: 8pt; color: #999; margin-top: 2px; }
            .tag-grid.cols-1 .price-tag { flex-direction: row; justify-content: space-between; padding: 6px 16px; }
            .tag-grid.cols-1 .price-tag .tag-name { font-size: 10pt; text-align: left; margin: 0; }
            .tag-grid.cols-1 .price-tag .tag-price { font-size: 14pt; }
            .tag-grid.cols-4 .price-tag .tag-name { font-size: 9pt; }
            .tag-grid.cols-4 .price-tag .tag-price { font-size: 14pt; }
            .tag-page-header { text-align: center; margin-bottom: 6mm; font-size: 10pt; color: #666; border-bottom: 1px solid #ddd; padding-bottom: 4mm; }
            .tag-page-header strong { font-size: 12pt; color: #000; }
          }
        `}</style>

        {(() => {
          const perPage = layoutConfig.cols * layoutConfig.rows;
          const pages = [];
          for (let i = 0; i < printProducts.length; i += perPage) {
            pages.push(printProducts.slice(i, i + perPage));
          }
          return pages.map((pageProducts, pageIdx) => (
            <div key={pageIdx} className="tag-page">
              <div className="tag-page-header">
                <strong>{business?.business_name || 'Price Tags'}</strong><br />
                Price Tags • {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                {filterCategory && ` • ${filterCategory}`}
              </div>
              <div className={`tag-grid cols-${layoutConfig.cols}`}>
                {pageProducts.map(p => (
                  <div key={p.id} className="price-tag">
                    {layout === 'shelf-strips' ? (
                      <>
                        <div>
                          <span className="tag-name">{p.name}</span>
                          {showSku && <span className="tag-sku" style={{ marginLeft: '8px' }}>{p.sku}</span>}
                          {showCategory && <span className="tag-category" style={{ marginLeft: '8px' }}>{p.category}</span>}
                        </div>
                        <div className="tag-price">{fmt(p.price)}</div>
                      </>
                    ) : (
                      <>
                        <div className="tag-name">{p.name}</div>
                        {showSku && <div className="tag-sku">{p.sku}</div>}
                        {showCategory && <div className="tag-category">{p.category}</div>}
                        <div className="tag-price">{fmt(p.price)}</div>
                        {showCostPrice && p.cost_price > 0 && <div className="tag-cost">Cost: {fmt(p.cost_price)}</div>}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ));
        })()}
      </div>
    </div>
  );
}
