import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthContext } from '../lib/AuthContext';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import { usePrintDocument } from '../hooks/usePrintDocument';
import { useCurrency } from '../hooks/useCurrency';
import { reportError } from '../lib/errorReporting';
import ProductModal from '../features/inventory/components/ProductModal';
import { PageHeader, EmptyState, ErrorBanner, SkeletonRows } from '../components/ui';

const PAGE_SIZE = 25;

/* Column name → what a shopkeeper calls it. The server logs the raw column so
   the record stays queryable; the translation belongs here. */
const FIELD_LABELS = {
  name: 'Name',
  sku: 'SKU',
  category: 'Category',
  product_code: 'Product code',
  qr_code_data: 'QR code',
  requires_serial: 'Serial tracking',
};

/* Each movement type says what happened in the shop, not what the column says.
   VOID is here because migration 005 allowed it and 018 removed it: rows
   written in between still exist and must not render as a bare enum. */
const MOVEMENT_VERBS = {
  SALE: (n) => `Sold ${n}`,
  RECEIPT: (n) => `Received ${n}`,
  RETURN: (n) => `Customer returned ${n}`,
  SHRINKAGE: (n) => `Lost ${n} to damage or theft`,
  TRANSFER_IN: (n) => `Transferred in ${n}`,
  TRANSFER_OUT: (n) => `Transferred out ${n}`,
  AUDIT: (n) => `Stocktake corrected by ${n}`,
  ADJUSTMENT: (n) => `Adjusted by ${n}`,
  VOID: (n) => `Returned to stock by a void: ${n}`,
};

const units = (n) => `${n} ${Math.abs(n) === 1 ? 'unit' : 'units'}`;
const signed = (n) => `${n > 0 ? '+' : ''}${n}`;

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A value as it should read in a sentence: unset and empty are not the same. */
function describeValue(field, value) {
  if (value === null || value === undefined || value === '') return null;
  if (field === 'requires_serial') return value === 'true' ? 'on' : 'off';
  return value;
}

function describeEdit(event) {
  const label = FIELD_LABELS[event.field] || event.field;
  const from = describeValue(event.field, event.old_value);
  const to = describeValue(event.field, event.new_value);

  if (from && to) return `${label} changed from “${from}” to “${to}”`;
  if (to) return `${label} set to “${to}”`;
  return `${label} cleared`;
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuthContext();
  const toast = useToast();
  const confirm = useConfirm();
  const { business } = usePrintDocument();
  const { fmt, currencySymbol } = useCurrency(business);

  const canManage = hasPermission('manage_products');

  const [product, setProduct] = useState(null);
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [includes, setIncludes] = useState({ stock: true, edits: true, prices: true });

  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const loadProduct = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prod, s] = await Promise.all([
        api.get(`/products/${id}`),
        /* Stats are supporting detail, not the page. A shop whose stats query
           fails should still see the product and its history rather than an
           error where the whole page used to be. */
        api.get(`/products/${id}/stats`).catch((err) => {
          reportError(err, { context: 'product-detail:stats' });
          return null;
        }),
      ]);
      setProduct(prod);
      setStats(s);
    } catch (err) {
      setError(err);
      reportError(err, { context: 'product-detail:product' });
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadHistory = useCallback(async (nextPage) => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await api.get(`/products/${id}/history?page=${nextPage}&limit=${PAGE_SIZE}`);
      const rows = res.data || [];
      setEvents((prev) => (nextPage === 1 ? rows : [...prev, ...rows]));
      setHasMore(!!res.hasMore);
      if (res.includes) setIncludes(res.includes);
      setPage(nextPage);
    } catch (err) {
      setHistoryError(err);
      reportError(err, { context: 'product-detail:history' });
    } finally {
      setHistoryLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadProduct();
    loadHistory(1);
  }, [loadProduct, loadHistory]);

  const handleEditSubmit = async (data) => {
    setFormError('');
    setIsSubmitting(true);
    try {
      const payload = {
        name: data.name,
        sku: data.sku,
        category: data.category,
        price: parseFloat(data.price),
        qr_code_data: data.qr_code_data,
      };
      /* Only send a cost when one was typed. '' would become NaN, and NaN
         serialises to null, which would wipe a cost price the form never
         meant to touch. */
      if (data.cost_price !== '' && data.cost_price !== undefined && data.cost_price !== null) {
        payload.cost_price = parseFloat(data.cost_price);
      }

      const updated = await api.put(`/products/${id}`, payload);
      setProduct(updated);
      setIsEditOpen(false);
      toast.success('Product updated');
      // The edit just wrote its own history rows; show them.
      loadHistory(1);
      api.get(`/products/${id}/stats`).then(setStats).catch(() => {});
    } catch (err) {
      setFormError(err.message || 'Failed to update product');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (productId, name) => {
    const confirmed = await confirm({
      title: 'Delete Product',
      message: `Delete ${name}? This cannot be undone.`,
      variant: 'danger',
      confirmText: 'Delete',
    });
    if (!confirmed) return;
    try {
      await api.delete(`/products/${productId}`);
      toast.success(`${name} deleted`);
      navigate('/inventory');
    } catch (err) {
      setFormError(err.message || 'Failed to delete product');
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem' }}>
        <div className="spinner mx-auto"></div>
        <p className="mt-sm text-muted">Loading product...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="glass-panel mt-xl" style={{ textAlign: 'center', padding: '3rem' }}>
        <ErrorBanner error={error} onRetry={loadProduct} />
        <p>Product not found.</p>
        <button className="btn btn-secondary mt-lg" onClick={() => navigate('/inventory')}>
          Back to Inventory
        </button>
      </div>
    );
  }

  const totalStock = stats
    ? stats.stock_by_location.reduce((sum, l) => sum + (l.quantity || 0), 0)
    : (product.product_inventory || []).reduce((sum, i) => sum + (i.quantity || 0), 0);
  const lowThreshold = (product.product_inventory || [])[0]?.low_stock_threshold ?? 5;
  const isLowStock = totalStock <= lowThreshold;

  return (
    <div>
      <button className="btn btn-outline btn-sm mb-lg" onClick={() => navigate('/inventory')}>
        ← Back to Inventory
      </button>

      <PageHeader
        title={product.name}
        badge={isLowStock ? <span className="badge badge-warning badge-sm">Low Stock</span> : null}
        subtitle={
          <>
            <code className="text-mono">{product.sku}</code>
            {product.category ? ` · ${product.category}` : ''}
            {` · ${fmt(product.price)}`}
          </>
        }
        actions={
          canManage ? (
            <button className="btn btn-primary" onClick={() => { setFormError(''); setIsEditOpen(true); }}>
              Edit Product
            </button>
          ) : null
        }
      />

      <ErrorBanner error={error} onRetry={loadProduct} />

      <div className="pd-stats">
        <div className="pd-stat">
          <span className="pd-stat-label">In stock</span>
          <span className={`pd-stat-value ${isLowStock ? 'text-warning' : ''}`}>{totalStock}</span>
        </div>
        <div className="pd-stat">
          <span className="pd-stat-label">Sold{stats ? ` · last ${stats.window_days} days` : ''}</span>
          <span className="pd-stat-value">{stats ? stats.units_sold : '—'}</span>
        </div>
        <div className="pd-stat">
          <span className="pd-stat-label">Revenue{stats ? ` · last ${stats.window_days} days` : ''}</span>
          {/* null revenue is "not allowed to see it", which is not the same as
              zero, so it must not render as GH₵0.00. */}
          <span className="pd-stat-value">
            {stats && stats.revenue !== null && stats.revenue !== undefined ? fmt(stats.revenue) : '—'}
          </span>
        </div>
        <div className="pd-stat">
          <span className="pd-stat-label">Last sold</span>
          <span className="pd-stat-value pd-stat-value--sm">
            {stats && stats.last_sold_at ? formatDay(stats.last_sold_at) : 'Never'}
          </span>
        </div>
      </div>

      {stats && stats.stock_by_location.length > 0 && (
        <section className="pd-section">
          <h2 className="pd-section-title">Stock by branch</h2>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Quantity</th>
                  <th>Low stock below</th>
                </tr>
              </thead>
              <tbody>
                {stats.stock_by_location.map((loc) => (
                  <tr key={loc.location_id} className={loc.quantity <= loc.low_stock_threshold ? 'row-warning' : ''}>
                    <td>{loc.location || 'Unassigned'}</td>
                    <td>{loc.quantity}</td>
                    <td className="text-muted">{loc.low_stock_threshold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {stats && stats.batches.length > 0 && (
        <section className="pd-section">
          <h2 className="pd-section-title">Batches</h2>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Quantity</th>
                  <th>Expires</th>
                  <th>Branch</th>
                </tr>
              </thead>
              <tbody>
                {stats.batches.map((b) => (
                  <tr key={b.id}>
                    <td><code className="text-mono">{b.batch_number}</code></td>
                    <td>{b.quantity}</td>
                    <td>{b.expiry_date ? formatDay(b.expiry_date) : '—'}</td>
                    <td>{b.location ? b.location.name : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="pd-section">
        <h2 className="pd-section-title">History</h2>

        <ErrorBanner error={historyError} onRetry={() => loadHistory(1)} />

        {historyLoading && events.length === 0 ? (
          <SkeletonRows rows={4} />
        ) : events.length === 0 ? (
          <EmptyState
            icon="clipboard"
            title="Nothing has happened to this product yet"
            hint="Sales, deliveries, stock adjustments and price changes all show up here."
          />
        ) : (
          <>
            <ol className="pd-timeline">
              {events.map((event) => (
                <li key={event.id} className={`pd-event pd-event--${event.kind}`}>
                  <div className="pd-event-mark" aria-hidden="true">
                    {event.kind === 'stock' ? signed(event.quantity_change) : event.kind === 'price' ? currencySymbol : '✎'}
                  </div>
                  <div className="pd-event-body">
                    <p className="pd-event-title">
                      {event.kind === 'stock' && (
                        (MOVEMENT_VERBS[event.movement_type] || ((n) => `${event.movement_type} ${n}`))(
                          event.movement_type === 'ADJUSTMENT' || event.movement_type === 'AUDIT'
                            ? signed(event.quantity_change)
                            : units(Math.abs(event.quantity_change)),
                        )
                      )}
                      {event.kind === 'price' && (
                        <>
                          {Number(event.old_price) !== Number(event.new_price) && (
                            <>Price {fmt(event.old_price)} → {fmt(event.new_price)}</>
                          )}
                          {Number(event.old_cost_price) !== Number(event.new_cost_price) && (
                            <>
                              {Number(event.old_price) !== Number(event.new_price) ? ', ' : ''}
                              Cost {fmt(event.old_cost_price)} → {fmt(event.new_cost_price)}
                            </>
                          )}
                          {event.is_bulk && <span className="badge badge-neutral badge-sm ml-xs">Bulk update</span>}
                        </>
                      )}
                      {event.kind === 'edit' && describeEdit(event)}
                    </p>
                    <p className="pd-event-meta">
                      {[event.actor, event.location, formatWhen(event.at)].filter(Boolean).join(' · ')}
                    </p>
                    {(event.notes || event.reason) && (
                      <p className="pd-event-note">{event.notes || event.reason}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            {/* Only worth saying when there is a list to be incomplete. An
                empty history plus this note reads as "hidden from you". */}
            {includes.prices === false && (
              <p className="text-muted text-sm mt-md">
                Price changes are not shown, they need the Manage Products permission.
              </p>
            )}

            {hasMore && (
              <div className="pd-more">
                <button
                  className="btn btn-secondary"
                  onClick={() => loadHistory(page + 1)}
                  disabled={historyLoading}
                >
                  {historyLoading ? 'Loading...' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <ProductModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onSubmit={handleEditSubmit}
        onDelete={handleDelete}
        editingProduct={product}
        locations={[]}
        currencySymbol={currencySymbol}
        isSubmitting={isSubmitting}
        error={formError}
      />
    </div>
  );
}
