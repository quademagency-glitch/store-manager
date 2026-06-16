import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { useCurrency } from '../../../hooks/useCurrency';
import { usePrintDocument } from '../../../hooks/usePrintDocument';

export default function PriceChangeHistory() {
  const { business } = usePrintDocument();
  const { fmt } = useCurrency(business);

  const [history, setHistory] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterBatch, setFilterBatch] = useState('');

  const fetchHistory = async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: 50 });
      if (filterBatch) params.append('batch_id', filterBatch);

      const result = await api.get(`/pricing/history?${params}`);
      setHistory(result.data || []);
      setTotal(result.total || 0);
      setPage(result.page || 1);
      setTotalPages(result.total_pages || 1);
    } catch (err) {
      console.error('Failed to fetch price history:', err);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(1);
  }, [filterBatch]);

  const getChangeLabel = (type) => {
    switch (type) {
      case 'markup_percent': return { label: 'Markup %', color: 'var(--color-success)' };
      case 'markdown_percent': return { label: 'Markdown %', color: 'var(--color-error)' };
      case 'fixed_amount': return { label: 'Fixed Amt', color: 'var(--color-primary)' };
      case 'set_price': return { label: 'Set Price', color: 'var(--color-warning)' };
      case 'manual': return { label: 'Manual', color: 'var(--color-text-secondary)' };
      default: return { label: type, color: 'var(--color-text-muted)' };
    }
  };

  // Group by batch
  const grouped = {};
  history.forEach(entry => {
    const key = entry.batch_id || entry.id;
    if (!grouped[key]) grouped[key] = { entries: [], batch_id: entry.batch_id, date: entry.created_at, type: entry.change_type, reason: entry.reason };
    grouped[key].entries.push(entry);
  });

  return (
    <div style={{ marginTop: '1rem' }}>
      {/* Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
          {total} price change{total !== 1 ? 's' : ''} recorded
        </span>
        {filterBatch && (
          <button className="btn btn-secondary btn-sm" onClick={() => setFilterBatch('')}>
            Clear batch filter
          </button>
        )}
      </div>

      <div className="glass-panel">
        {loading ? (
          <div className="table-loading"><div className="spinner"></div><p>Loading history...</p></div>
        ) : history.length === 0 ? (
          <div className="text-center py-xl text-muted" style={{ padding: '48px 0' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3, margin: '0 auto 12px' }}>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M12 8v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <p>No price changes recorded yet.</p>
          </div>
        ) : (
          <>
            {Object.entries(grouped).map(([batchKey, batch]) => {
              const changeInfo = getChangeLabel(batch.type);
              const isBulk = batch.entries.length > 1;

              return (
                <div key={batchKey} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {/* Batch Header */}
                  {isBulk && (
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '12px 16px', background: 'var(--color-bg-tertiary)',
                      cursor: batch.batch_id ? 'pointer' : 'default'
                    }}
                      onClick={() => batch.batch_id && setFilterBatch(batch.batch_id)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{
                          padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600,
                          background: `${changeInfo.color}15`, color: changeInfo.color
                        }}>
                          {changeInfo.label}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                          Bulk update — {batch.entries.length} products
                        </span>
                        {batch.reason && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>"{batch.reason}"</span>}
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                        {new Date(batch.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}

                  {/* Entries */}
                  <table className="glass-table" style={{ marginBottom: 0 }}>
                    {!isBulk && (
                      <thead>
                        <tr>
                          <th>Date</th><th>Product</th><th>SKU</th><th>Type</th>
                          <th style={{ textAlign: 'right' }}>Old Price</th>
                          <th style={{ textAlign: 'right' }}>New Price</th>
                          <th style={{ textAlign: 'right' }}>Change</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                    )}
                    <tbody>
                      {batch.entries.map(entry => {
                        const ci = getChangeLabel(entry.change_type);
                        const change = parseFloat(entry.new_price) - parseFloat(entry.old_price);
                        return (
                          <tr key={entry.id}>
                            <td className="text-muted" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                              {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </td>
                            <td className="font-medium">{entry.product?.name || '—'}</td>
                            <td><code className="text-mono" style={{ fontSize: '0.85rem' }}>{entry.product?.sku || '—'}</code></td>
                            <td>
                              {!isBulk && (
                                <span style={{
                                  padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600,
                                  background: `${ci.color}15`, color: ci.color
                                }}>
                                  {ci.label}
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right', textDecoration: 'line-through', color: 'var(--color-text-muted)' }}>{fmt(entry.old_price)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(entry.new_price)}</td>
                            <td style={{ textAlign: 'right', color: change > 0 ? 'var(--color-success)' : 'var(--color-error)', fontSize: '0.85rem' }}>
                              {change > 0 ? '+' : ''}{fmt(change)}
                            </td>
                            <td className="text-muted" style={{ fontSize: '0.85rem', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {entry.reason || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="text-sm text-muted">Page {page} of {totalPages}</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => fetchHistory(Math.max(1, page - 1))} disabled={page === 1}>Previous</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => fetchHistory(Math.min(totalPages, page + 1))} disabled={page === totalPages}>Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
