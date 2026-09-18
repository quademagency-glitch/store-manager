import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { useCurrency } from '../../../hooks/useCurrency';
import { usePrintDocument } from '../../../hooks/usePrintDocument';
import { useToast } from '../../../hooks/useToast';
import { useConfirm } from '../../../hooks/useConfirm';
import { reportError } from '../../../lib/errorReporting';

export default function BulkPriceUpdate({ onComplete }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { business } = usePrintDocument();
  const { fmt } = useCurrency(business);

  const [categories, setCategories] = useState([]);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSku, setFilterSku] = useState('');
  const [unpricedOnly, setUnpricedOnly] = useState(false);
  /* ids the run will actually touch. Empty set means "everything the preview
     matched", so a preview that has not been narrowed behaves as it always
     did, and a deliberate selection of none is still respected. */
  const [excluded, setExcluded] = useState(() => new Set());
  const [mode, setMode] = useState('markup_percent');
  const [value, setValue] = useState('');
  const [rounding, setRounding] = useState('0.01');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applying, setApplying] = useState(false);

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

  const modes = [
    { id: 'markup_percent', label: 'Markup %', icon: '↑', hint: 'Increase prices by percentage', color: 'var(--color-success)' },
    { id: 'markdown_percent', label: 'Markdown %', icon: '↓', hint: 'Decrease prices by percentage', color: 'var(--color-error)' },
    { id: 'fixed_amount', label: 'Fixed Amount', icon: '±', hint: 'Add or subtract a fixed amount', color: 'var(--color-primary)' },
    { id: 'set_price', label: 'Set Price', icon: '=', hint: 'Set all matched to exact price', color: 'var(--color-warning)' },
    // The other four all work off the CURRENT selling price, so a product
    // imported with a cost and no price could never be priced: 0 plus 30% is
    // still 0. This one starts from cost instead, which is what a cost-only
    // import needs afterwards.
    { id: 'cost_markup_percent', label: 'From Cost %', icon: '⤢', hint: 'Set price = cost + this percentage', color: 'var(--color-info, var(--color-primary))' },
  ];

  const roundingOptions = [
    { value: '0.01', label: 'Nearest 0.01 (exact)' },
    { value: '0.05', label: 'Nearest 0.05' },
    { value: '0.10', label: 'Nearest 0.10' },
    { value: '0.50', label: 'Nearest 0.50' },
    { value: '1.00', label: 'Nearest 1.00' },
    /* Not a step like the others: 99, 199, 299 are 100 apart, so the server
       has a rule for it rather than a number. See roundToCharm99. */
    { value: 'charm-99', label: 'Nearest 99 (16,099)' },
  ];

  /* Takes the mode explicitly so the "use From Cost %" button can switch and
     re-run in one click, rather than previewing with the mode that is being
     replaced. Call it as handlePreview(), never as an onClick handler
     directly: React would pass the click event in as the mode. */
  const buildFilters = () => {
    const filters = {};
    if (filterCategory) filters.category = filterCategory;
    if (filterSku) filters.sku_pattern = filterSku;
    if (unpricedOnly) filters.unpriced_only = true;
    return filters;
  };

  const handlePreview = async (useMode = mode) => {
    if (!value || isNaN(parseFloat(value))) {
      toast.error('Enter a valid number');
      return;
    }
    setPreviewLoading(true);
    try {
      const filters = buildFilters();

      const result = await api.post('/pricing/preview', {
        filters,
        mode: useMode,
        value: parseFloat(value),
        rounding
      });
      setPreview(result);
      setExcluded(new Set());
    } catch (err) {
      toast.error(err.message || 'Preview failed');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleApply = async () => {
    if (!preview || selectedProducts.length === 0) return;

    const confirmed = await confirm({
      title: 'Apply Price Update',
      message: `This will update prices for ${selectedProducts.length} product(s). This action is logged in the audit trail.`,
      confirmText: 'Apply Changes',
      variant: 'warning'
    });

    if (!confirmed) return;

    setApplying(true);
    try {
      /* Pin the run to exactly the rows still ticked. Without this the apply
         re-runs the filters server-side and could touch a product the user
         had just unticked, or one added since the preview. */
      const filters = { ...buildFilters(), product_ids: selectedProducts.map(p => p.id) };

      const result = await api.put('/pricing/bulk-update', {
        filters,
        mode,
        value: parseFloat(value),
        rounding,
        reason
      });
      toast.success(result.message);
      setPreview(null);
      setValue('');
      setReason('');
      if (onComplete) onComplete();
    } catch (err) {
      toast.error(err.message || 'Update failed');
    } finally {
      setApplying(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    handlePreview(nextMode);
  };

  /* A row is in the run when it would change something AND has not been
     unticked. Skipped rows are never in it: the server refuses them anyway,
     and offering a tick box that does nothing is worse than offering none. */
  const changeableProducts = preview ? preview.products.filter(p => !p.skipped && p.change !== 0) : [];
  const selectedProducts = changeableProducts.filter(p => !excluded.has(p.id));
  const changedCount = selectedProducts.length;

  const toggleRow = (id) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setExcluded(prev => (
      prev.size > 0 ? new Set() : new Set(changeableProducts.map(p => p.id))
    ));
  };
  const skippedNoPrice = preview ? (preview.skipped_no_price || 0) : 0;
  const skippedNoCost = preview ? (preview.skipped_count || 0) - skippedNoPrice : 0;

  return (
    <div className="mt-md">
      {/* Controls Row */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ fontWeight: 600, marginBottom: '16px', fontSize: '1rem' }}>Bulk Price Update</h3>

        {/* Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="bulk-price-category" style={{ fontSize: '0.8rem' }}>Filter by Category</label>
            <select className="form-input" id="bulk-price-category" value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPreview(null); }}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="bulk-price-sku" style={{ fontSize: '0.8rem' }}>Filter by SKU (contains)</label>
            <input className="form-input" id="bulk-price-sku" placeholder="e.g. ELEC or PHN" value={filterSku} onChange={e => { setFilterSku(e.target.value); setPreview(null); }} />
          </div>
        </div>

        {/* The filter a shop needs straight after importing a supplier's
            sheet: price the new arrivals without touching everything else. */}
        <label className="bulk-price-check mb-md">
          <input
            type="checkbox"
            checked={unpricedOnly}
            onChange={e => { setUnpricedOnly(e.target.checked); setPreview(null); }}
          />
          <span>Only products with no selling price yet</span>
        </label>

        {/* Mode Selector */}
        <div className="mb-md">
          <label className="form-label" style={{ fontSize: '0.8rem' }}>Update Mode</label>
          <div className="bulk-price-mode-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
            {modes.map(m => (
              <button
                key={m.id}
                onClick={() => { setMode(m.id); setPreview(null); }}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: mode === m.id ? `2px solid ${m.color}` : '2px solid var(--color-border)',
                  background: mode === m.id ? `${m.color}11` : 'var(--color-bg-secondary)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontSize: '1.4rem', marginBottom: '4px' }}>{m.icon}</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: mode === m.id ? m.color : 'var(--color-text-primary)' }}>{m.label}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{m.hint}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Value + Rounding */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="bulk-price-value" style={{ fontSize: '0.8rem' }}>
              {mode === 'markup_percent' ? 'Markup (%)' :
               mode === 'markdown_percent' ? 'Markdown (%)' :
               mode === 'cost_markup_percent' ? 'Markup on cost (%)' :
               mode === 'fixed_amount' ? 'Amount (+/-)' : 'New Price'}
            </label>
            <input
              type="number"
              id="bulk-price-value"
              className="form-input"
              value={value}
              onChange={e => { setValue(e.target.value); setPreview(null); }}
              placeholder={mode.includes('percent') ? 'e.g. 15' : 'e.g. 5.00'}
              step={mode.includes('percent') ? '1' : '0.01'}
              min={mode === 'markdown_percent' ? '0' : undefined}
              max={mode === 'markdown_percent' ? '100' : undefined}
              style={{ fontSize: '1.1rem', fontWeight: 600 }}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="bulk-price-rounding" style={{ fontSize: '0.8rem' }}>Rounding</label>
            <select className="form-input" id="bulk-price-rounding" value={rounding} onChange={e => { setRounding(e.target.value); setPreview(null); }}>
              {roundingOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="bulk-price-reason" style={{ fontSize: '0.8rem' }}>Reason (optional)</label>
            <input className="form-input" id="bulk-price-reason" placeholder="e.g. Q3 price review" value={reason} onChange={e => setReason(e.target.value)} />
          </div>
        </div>

        {/* Preview Button */}
        <button
          className="btn btn-primary flex items-center gap-sm"
          onClick={() => handlePreview()}
          disabled={previewLoading || !value}
        >
          {previewLoading ? (
            <><div className="spinner" style={{ width: '16px', height: '16px' }}></div> Calculating...</>
          ) : (
            <><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 8v4l2.5 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> Preview Changes</>
          )}
        </button>
      </div>

      {/* Preview Results */}
      {preview && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          {/* Summary Banner */}
          <div className="flex gap-md mb-md flex-wrap">
            <div style={{ padding: '12px 20px', background: 'var(--color-bg-tertiary)', borderRadius: '8px', flex: 1, minWidth: '150px' }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>Products</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-primary)' }}>{preview.count}</div>
            </div>
            <div style={{ padding: '12px 20px', background: 'var(--color-bg-tertiary)', borderRadius: '8px', flex: 1, minWidth: '150px' }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>Will Change</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: changedCount > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>{changedCount}</div>
            </div>
            <div style={{ padding: '12px 20px', background: 'var(--color-bg-tertiary)', borderRadius: '8px', flex: 1, minWidth: '150px' }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>Total Before</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{fmt(preview.total_current)}</div>
            </div>
            <div style={{ padding: '12px 20px', background: 'var(--color-bg-tertiary)', borderRadius: '8px', flex: 1, minWidth: '150px' }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>Total After</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: preview.total_new > preview.total_current ? 'var(--color-success)' : 'var(--color-error)' }}>{fmt(preview.total_new)}</div>
            </div>
          </div>

          {/* Two opposite dead ends, and the count alone explains neither.
              A markup on cost cannot be worked out without a cost, and
              applying it anyway would rewrite a real price to zero. A markup
              on the PRICE cannot move a price of 0, which is every product a
              cost-only import just created, and that one has a way out: the
              same run, from cost instead. */}
          {skippedNoCost > 0 && (
            <div className="bulk-price-note mb-md">
              {skippedNoCost} product(s) have no cost price recorded and will be left unchanged.
            </div>
          )}
          {skippedNoPrice > 0 && (
            <div className="bulk-price-note mb-md">
              <span>
                {skippedNoPrice} product(s) have no selling price yet, so a percentage of it
                is still nothing. Price them from what you paid instead.
              </span>
              {preview.suggested_mode === 'cost_markup_percent' && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => switchMode('cost_markup_percent')}
                  disabled={previewLoading}
                >
                  Use From Cost % instead
                </button>
              )}
            </div>
          )}

          {/* Preview Table */}
          <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '16px' }}>
            <table className="glass-table">
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <th style={{ width: '2.5rem' }}>
                    <input
                      type="checkbox"
                      aria-label="Select all products"
                      checked={changeableProducts.length > 0 && excluded.size === 0}
                      onChange={toggleAll}
                      disabled={changeableProducts.length === 0}
                    />
                  </th>
                  <th>Product</th><th>SKU</th><th>Category</th>
                  <th className="text-right">Current</th>
                  <th className="text-right">New Price</th>
                  <th className="text-right">Change</th>
                  <th className="text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {preview.products.map(p => (
                  <tr key={p.id} style={{ opacity: p.change === 0 ? 0.5 : 1 }}>
                    <td>
                      {/* Nothing to tick on a row the run cannot move. */}
                      {!p.skipped && p.change !== 0 && (
                        <input
                          type="checkbox"
                          aria-label={`Include ${p.name}`}
                          checked={!excluded.has(p.id)}
                          onChange={() => toggleRow(p.id)}
                        />
                      )}
                    </td>
                    <td className="font-medium">{p.name}</td>
                    <td><code className="text-mono" style={{ fontSize: '0.85rem' }}>{p.sku}</code></td>
                    <td><span className="badge badge-neutral">{p.category}</span></td>
                    <td className="text-right">{fmt(p.current_price)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: p.change > 0 ? 'var(--color-success)' : p.change < 0 ? 'var(--color-error)' : 'var(--color-text-muted)' }}>
                      {fmt(p.new_price)}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                      {p.change !== 0 && (
                        <span style={{ color: p.change > 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                          {p.change > 0 ? '+' : ''}{fmt(p.change)} ({p.change_percent > 0 ? '+' : ''}{p.change_percent}%)
                        </span>
                      )}
                      {p.change === 0 && <span className="text-muted">-</span>}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                      {p.margin ? `${p.margin}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Apply Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button className="btn btn-secondary" onClick={() => setPreview(null)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={handleApply}
              disabled={applying || changedCount === 0}
              style={{ background: 'linear-gradient(135deg, var(--color-success), #16a34a)', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {applying ? 'Applying...' : `Apply to ${changedCount} Product(s)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
