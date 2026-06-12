import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { useCurrency } from '../../../hooks/useCurrency';
import { usePrintDocument } from '../../../hooks/usePrintDocument';
import { useToast } from '../../../hooks/useToast';
import { useConfirm } from '../../../hooks/useConfirm';

export default function BulkPriceUpdate({ onComplete }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { business } = usePrintDocument();
  const { fmt } = useCurrency(business);

  const [categories, setCategories] = useState([]);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSku, setFilterSku] = useState('');
  const [mode, setMode] = useState('markup_percent');
  const [value, setValue] = useState('');
  const [rounding, setRounding] = useState('0.01');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    api.get('/pricing/categories').then(setCategories).catch(() => setCategories([]));
  }, []);

  const modes = [
    { id: 'markup_percent', label: 'Markup %', icon: '↑', hint: 'Increase prices by percentage', color: 'var(--color-success)' },
    { id: 'markdown_percent', label: 'Markdown %', icon: '↓', hint: 'Decrease prices by percentage', color: 'var(--color-error)' },
    { id: 'fixed_amount', label: 'Fixed Amount', icon: '±', hint: 'Add or subtract a fixed amount', color: 'var(--color-primary)' },
    { id: 'set_price', label: 'Set Price', icon: '=', hint: 'Set all matched to exact price', color: 'var(--color-warning)' },
  ];

  const roundingOptions = [
    { value: '0.01', label: 'Nearest 0.01 (exact)' },
    { value: '0.05', label: 'Nearest 0.05' },
    { value: '0.10', label: 'Nearest 0.10' },
    { value: '0.50', label: 'Nearest 0.50' },
    { value: '1.00', label: 'Nearest 1.00' },
  ];

  const handlePreview = async () => {
    if (!value || isNaN(parseFloat(value))) {
      toast.error('Enter a valid number');
      return;
    }
    setPreviewLoading(true);
    try {
      const filters = {};
      if (filterCategory) filters.category = filterCategory;
      if (filterSku) filters.sku_pattern = filterSku;

      const result = await api.post('/pricing/preview', {
        filters,
        mode,
        value: parseFloat(value),
        rounding: parseFloat(rounding)
      });
      setPreview(result);
    } catch (err) {
      toast.error(err.message || 'Preview failed');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleApply = async () => {
    if (!preview || preview.count === 0) return;

    const changedProducts = preview.products.filter(p => p.change !== 0);
    if (changedProducts.length === 0) {
      toast.info('No price changes to apply');
      return;
    }

    const confirmed = await confirm({
      title: 'Apply Price Update',
      message: `This will update prices for ${changedProducts.length} product(s). This action is logged in the audit trail.`,
      confirmText: 'Apply Changes',
      variant: 'warning'
    });

    if (!confirmed) return;

    setApplying(true);
    try {
      const filters = {};
      if (filterCategory) filters.category = filterCategory;
      if (filterSku) filters.sku_pattern = filterSku;

      const result = await api.put('/pricing/bulk-update', {
        filters,
        mode,
        value: parseFloat(value),
        rounding: parseFloat(rounding),
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

  const changedCount = preview ? preview.products.filter(p => p.change !== 0).length : 0;

  return (
    <div style={{ marginTop: '1rem' }}>
      {/* Controls Row */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ fontWeight: 600, marginBottom: '16px', fontSize: '1rem' }}>Bulk Price Update</h3>

        {/* Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Filter by Category</label>
            <select className="form-input" value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPreview(null); }}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Filter by SKU (contains)</label>
            <input className="form-input" placeholder="e.g. ELEC or PHN" value={filterSku} onChange={e => { setFilterSku(e.target.value); setPreview(null); }} />
          </div>
        </div>

        {/* Mode Selector */}
        <div style={{ marginBottom: '16px' }}>
          <label className="form-label" style={{ fontSize: '0.8rem' }}>Update Mode</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
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
            <label className="form-label" style={{ fontSize: '0.8rem' }}>
              {mode === 'markup_percent' ? 'Markup (%)' :
               mode === 'markdown_percent' ? 'Markdown (%)' :
               mode === 'fixed_amount' ? 'Amount (+/-)' : 'New Price'}
            </label>
            <input
              type="number"
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
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Rounding</label>
            <select className="form-input" value={rounding} onChange={e => { setRounding(e.target.value); setPreview(null); }}>
              {roundingOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Reason (optional)</label>
            <input className="form-input" placeholder="e.g. Q3 price review" value={reason} onChange={e => setReason(e.target.value)} />
          </div>
        </div>

        {/* Preview Button */}
        <button
          className="btn btn-primary"
          onClick={handlePreview}
          disabled={previewLoading || !value}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
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
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
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

          {/* Preview Table */}
          <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '16px' }}>
            <table className="glass-table">
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <th>Product</th><th>SKU</th><th>Category</th>
                  <th style={{ textAlign: 'right' }}>Current</th>
                  <th style={{ textAlign: 'right' }}>New Price</th>
                  <th style={{ textAlign: 'right' }}>Change</th>
                  <th style={{ textAlign: 'right' }}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {preview.products.map(p => (
                  <tr key={p.id} style={{ opacity: p.change === 0 ? 0.5 : 1 }}>
                    <td className="font-medium">{p.name}</td>
                    <td><code className="text-mono" style={{ fontSize: '0.85rem' }}>{p.sku}</code></td>
                    <td><span className="badge badge-neutral">{p.category}</span></td>
                    <td style={{ textAlign: 'right' }}>{fmt(p.current_price)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: p.change > 0 ? 'var(--color-success)' : p.change < 0 ? 'var(--color-error)' : 'var(--color-text-muted)' }}>
                      {fmt(p.new_price)}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                      {p.change !== 0 && (
                        <span style={{ color: p.change > 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                          {p.change > 0 ? '+' : ''}{fmt(p.change)} ({p.change_percent > 0 ? '+' : ''}{p.change_percent}%)
                        </span>
                      )}
                      {p.change === 0 && <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                      {p.margin ? `${p.margin}%` : '—'}
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
              style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {applying ? 'Applying...' : `Apply to ${changedCount} Product(s)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
