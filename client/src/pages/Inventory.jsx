import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuthContext } from '../lib/AuthContext';
import { useProducts } from '../hooks/useProducts';
import { useStock } from '../hooks/useStock';
import { api } from '../lib/api';
import Modal from '../components/Modal';
import QrScanner from '../components/QrScanner';
import InventoryCount from '../components/InventoryCount';
import { QRCodeSVG } from 'qrcode.react';

export default function Inventory() {
  const { hasPermission } = useAuthContext();
  const { products, loading: productsLoading, error: productsError, addProduct, updateProduct, deleteProduct } = useProducts();
  const { movements, loading: stockLoading, fetchMovements, adjustStock, error: stockError } = useStock();

  const [locations, setLocations] = useState([]);
  const [activeTab, setActiveTab] = useState('products');

  // ─── Products Tab State ───
  const [productSearch, setProductSearch] = useState('');
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productFormError, setProductFormError] = useState('');
  const [isProductSubmitting, setIsProductSubmitting] = useState(false);
  const [qrLabelProduct, setQrLabelProduct] = useState(null);
  const [productFormData, setProductFormData] = useState({
    name: '', sku: '', category: '', price: '', initialQuantity: '', locationId: '', qr_code_data: ''
  });

  // Adjust Modal
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustData, setAdjustData] = useState({
    productId: '', locationId: '', quantityChange: '', movementType: 'RECEIPT', notes: '', shrinkageReason: ''
  });
  const [adjusting, setAdjusting] = useState(false);

  // Threshold Modal
  const [isThresholdModalOpen, setIsThresholdModalOpen] = useState(false);
  const [thresholdData, setThresholdData] = useState({ productId: '', locationId: '', threshold: '' });
  const [thresholding, setThresholding] = useState(false);
  const [thresholdError, setThresholdError] = useState('');

  // Transfers
  const [transfers, setTransfers] = useState([]);
  const [transfersLoading, setTransfersLoading] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferData, setTransferData] = useState({
    productId: '', fromLocationId: '', toLocationId: '', quantity: '', notes: ''
  });
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState('');

  // Audits (Cycle Counts)
  const [audits, setAudits] = useState([]);
  const [auditsLoading, setAuditsLoading] = useState(false);
  const [auditLocationId, setAuditLocationId] = useState('');
  const [auditCounts, setAuditCounts] = useState({});
  const [submittingAudit, setSubmittingAudit] = useState(false);
  const [auditResults, setAuditResults] = useState(null);

  // Batches
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchData, setBatchData] = useState({
    productId: '', locationId: '', batchNumber: '', quantity: '', expiryDate: '', notes: ''
  });
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchError, setBatchError] = useState('');

  // QR Scanner
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    fetchMovements();
    api.get('/locations').then(res => setLocations(res)).catch(() => setLocations([]));
  }, [fetchMovements]);

  // Fetch tab data on tab change
  useEffect(() => {
    if (activeTab === 'transfers') fetchTransfers();
    if (activeTab === 'audits') fetchAudits();
    if (activeTab === 'batches') fetchBatches();
  }, [activeTab]);

  const fetchTransfers = async () => {
    setTransfersLoading(true);
    try {
      const data = await api.get('/stock/transfers');
      setTransfers(data);
    } catch { setTransfers([]); }
    finally { setTransfersLoading(false); }
  };

  const fetchAudits = async () => {
    setAuditsLoading(true);
    try {
      const data = await api.get('/stock/audits');
      setAudits(data);
    } catch { setAudits([]); }
    finally { setAuditsLoading(false); }
  };

  const fetchBatches = async () => {
    setBatchesLoading(true);
    try {
      const data = await api.get('/stock/batches');
      setBatches(data);
    } catch { setBatches([]); }
    finally { setBatchesLoading(false); }
  };

  // Low stock products
  const lowStockProducts = useMemo(() => {
    const alerts = [];
    products.forEach(p => {
      p.product_inventory?.forEach(inv => {
        if (inv.quantity <= inv.low_stock_threshold) {
          alerts.push({ ...p, loc_id: inv.location_id, quantity: inv.quantity, threshold: inv.low_stock_threshold });
        }
      });
    });
    return alerts;
  }, [products]);

  // Products at audit location
  const auditProducts = useMemo(() => {
    if (!auditLocationId) return [];
    return products.map(p => {
      const inv = p.product_inventory?.find(i => i.location_id === auditLocationId);
      return { ...p, currentQty: inv?.quantity || 0 };
    }).filter(p => p.currentQty > 0 || p.product_inventory?.some(i => i.location_id === auditLocationId));
  }, [products, auditLocationId]);

  // Handle Adjustment Submit
  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    setAdjusting(true);
    let finalQtyChange = Number(adjustData.quantityChange);
    if (['SHRINKAGE', 'SALE'].includes(adjustData.movementType)) {
      finalQtyChange = -Math.abs(finalQtyChange);
    } else {
      finalQtyChange = Math.abs(finalQtyChange);
    }
    const result = await adjustStock(
      adjustData.productId, finalQtyChange, adjustData.movementType,
      adjustData.locationId, adjustData.notes,
      adjustData.movementType === 'SHRINKAGE' ? adjustData.shrinkageReason : null
    );
    if (result.success) {
      setIsAdjustModalOpen(false);
      setAdjustData({ productId: '', locationId: '', quantityChange: '', movementType: 'RECEIPT', notes: '', shrinkageReason: '' });
    }
    setAdjusting(false);
  };

  const handleThresholdSubmit = async (e) => {
    e.preventDefault();
    setThresholdError('');
    setThresholding(true);
    try {
      await api.put(`/stock/${thresholdData.productId}/locations/${thresholdData.locationId}/threshold`, {
        threshold: parseInt(thresholdData.threshold, 10)
      });
      setIsThresholdModalOpen(false);
      setThresholdData({ productId: '', locationId: '', threshold: '' });
      window.location.reload();
    } catch (err) {
      setThresholdError(err.message || 'Failed to update threshold');
    } finally {
      setThresholding(false);
    }
  };

  // Transfers
  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    setTransferError('');
    setTransferring(true);
    try {
      await api.post('/stock/transfers', {
        product_id: transferData.productId,
        from_location_id: transferData.fromLocationId,
        to_location_id: transferData.toLocationId,
        quantity: parseInt(transferData.quantity, 10),
        notes: transferData.notes
      });
      setIsTransferModalOpen(false);
      setTransferData({ productId: '', fromLocationId: '', toLocationId: '', quantity: '', notes: '' });
      fetchTransfers();
    } catch (err) {
      setTransferError(err.message || 'Failed to create transfer');
    } finally {
      setTransferring(false);
    }
  };

  const handleTransferAction = async (id, action) => {
    try {
      await api.put(`/stock/transfers/${id}/${action}`);
      fetchTransfers();
    } catch (err) {
      alert(err.message || `Failed to ${action} transfer`);
    }
  };

  // Audits
  const handleAuditSubmit = async () => {
    if (!auditLocationId) return;
    setSubmittingAudit(true);
    const counts = Object.entries(auditCounts)
      .filter(([, val]) => val !== '' && val !== undefined)
      .map(([productId, counted]) => ({
        product_id: productId,
        counted_quantity: parseInt(counted, 10)
      }));

    if (counts.length === 0) {
      alert('Please enter at least one count.');
      setSubmittingAudit(false);
      return;
    }

    try {
      const result = await api.post('/stock/audits', { location_id: auditLocationId, counts });
      setAuditResults(result);
      setAuditCounts({});
      fetchAudits();
    } catch (err) {
      alert(err.message || 'Failed to submit audit');
    } finally {
      setSubmittingAudit(false);
    }
  };

  // Batches
  const handleBatchSubmit = async (e) => {
    e.preventDefault();
    setBatchError('');
    setBatchSubmitting(true);
    try {
      await api.post('/stock/batches', {
        product_id: batchData.productId,
        location_id: batchData.locationId,
        batch_number: batchData.batchNumber,
        quantity: parseInt(batchData.quantity, 10),
        expiry_date: batchData.expiryDate,
        notes: batchData.notes
      });
      setIsBatchModalOpen(false);
      setBatchData({ productId: '', locationId: '', batchNumber: '', quantity: '', expiryDate: '', notes: '' });
      fetchBatches();
    } catch (err) {
      setBatchError(err.message || 'Failed to register batch');
    } finally {
      setBatchSubmitting(false);
    }
  };

  // QR Scanner handler
  const handleQrScan = async (decodedText) => {
    setShowScanner(false);
    try {
      const product = await api.get(`/products/lookup?qr=${encodeURIComponent(decodedText)}`);
      if (product) {
        setAdjustData(prev => ({ ...prev, productId: product.id }));
        setIsAdjustModalOpen(true);
      }
    } catch {
      alert(`No product found for QR code: ${decodedText}`);
    }
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const getTypeBadgeClass = (type) => {
    switch(type) {
      case 'RECEIPT': case 'TRANSFER_IN': return 'role-badge-manager';
      case 'SALE': case 'TRANSFER_OUT': return 'role-badge-salesperson';
      case 'SHRINKAGE': return 'role-badge-error';
      case 'RETURN': return 'role-badge-warning';
      case 'AUDIT': return 'role-badge';
      default: return 'role-badge-manager';
    }
  };

  const getExpiryStatus = (dateStr) => {
    const now = new Date();
    const expiry = new Date(dateStr);
    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return { class: 'expired', label: 'Expired', rowClass: 'batch-expired' };
    if (daysLeft <= 7) return { class: 'soon', label: `${daysLeft}d left`, rowClass: 'batch-expiring-soon' };
    return { class: 'ok', label: `${daysLeft}d left`, rowClass: '' };
  };

  // ─── Products Tab Handlers ───
  const filteredProducts = useMemo(() => {
    if (!productSearch) return products;
    const lower = productSearch.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(lower) ||
      p.sku.toLowerCase().includes(lower) ||
      p.category?.toLowerCase().includes(lower)
    );
  }, [products, productSearch]);

  const openAddProductModal = () => {
    setEditingProduct(null);
    setProductFormData({
      name: '', sku: '', category: 'General', price: '',
      initialQuantity: '', locationId: locations.length > 0 ? locations[0].id : '', qr_code_data: ''
    });
    setProductFormError('');
    setIsProductModalOpen(true);
  };

  const openEditProductModal = (product) => {
    setEditingProduct(product);
    setProductFormData({
      name: product.name, sku: product.sku, category: product.category, price: product.price,
      initialQuantity: '', locationId: '', qr_code_data: product.qr_code_data || ''
    });
    setProductFormError('');
    setIsProductModalOpen(true);
  };

  const closeProductModal = () => {
    setIsProductModalOpen(false);
    setEditingProduct(null);
    setProductFormError('');
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    setProductFormError('');
    setIsProductSubmitting(true);
    const payload = {
      name: productFormData.name, sku: productFormData.sku, category: productFormData.category,
      price: parseFloat(productFormData.price) || 0,
      initialQuantity: productFormData.initialQuantity, locationId: productFormData.locationId,
      qr_code_data: productFormData.qr_code_data || productFormData.sku
    };
    const result = editingProduct
      ? await updateProduct(editingProduct.id, payload)
      : await addProduct(payload);
    if (result.success) closeProductModal();
    else setProductFormError(result.error || 'An error occurred.');
    setIsProductSubmitting(false);
  };

  const handleDeleteProduct = async (id, name) => {
    if (window.confirm(`Delete ${name}? This cannot be undone.`)) {
      await deleteProduct(id);
    }
  };


  const tabs = [
    { id: 'products', label: 'Products' },
    { id: 'ledger', label: 'Ledger' },
    { id: 'transfers', label: 'Transfers' },
    { id: 'inventorycount', label: 'Inventory Count' },
    { id: 'audits', label: 'Cycle Counts' },
    { id: 'batches', label: 'Batches' },
  ];

  return (
    <div className="inventory-page">
      <div className="inventory-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ 
            fontSize: '2rem', 
            fontWeight: 700, 
            margin: '0 0 8px 0',
            background: 'linear-gradient(135deg, var(--color-text-primary) 0%, var(--color-accent-hover) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.02em'
          }}>
            Inventory Management
          </h1>
          <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.95rem', fontWeight: 500 }}>
            Track stock, transfers, audits, and batch expiries.
          </p>
        </div>
        {hasPermission('manage_inventory') && (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => setShowScanner(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Scan
            </button>
            <button className="btn btn-secondary" onClick={() => setIsThresholdModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 3v18M18 9l-6-6-6 6M18 15l-6 6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Thresholds
            </button>
            <button className="btn btn-primary" onClick={() => setIsAdjustModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-hover))', border: 'none', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Adjust Stock
            </button>
          </div>
        )}
      </div>

      {/* Low Stock Alerts */}
      {lowStockProducts.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: '24px', padding: '16px', borderRadius: '8px', backgroundColor: '#fffbeb', border: '1px solid #fef3c7' }}>
          <h3 style={{ color: '#d97706', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 9V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M12 17.5V18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M12 3L2 21H22L12 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            Low Stock Alerts ({lowStockProducts.length})
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {lowStockProducts.map((p, idx) => (
              <div key={`${p.id}-${idx}`} style={{ padding: '8px 12px', background: 'white', borderRadius: '6px', border: '1px solid #fcd34d', fontSize: '14px' }}>
                <strong>{p.name}</strong> • <span style={{ color: p.quantity === 0 ? '#ef4444' : '#d97706' }}>{p.quantity} left</span> 
                {locations.length > 1 && <span style={{ color: '#94a3b8' }}> @ {locations.find(l => l.id === p.loc_id)?.name || 'Unknown Loc'}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="inventory-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`inventory-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {/* ═══ PRODUCTS TAB ═══ */}
      {activeTab === 'products' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div className="search-bar" style={{ flex: 1, maxWidth: '400px' }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="search-icon">
                <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M18 18L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                placeholder="Search by name, SKU, or category..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="search-input"
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span className="badge badge-neutral">{filteredProducts.length} items</span>
              {hasPermission('manage_products') && (
                <button className="btn btn-primary" onClick={openAddProductModal}>+ Add Product</button>
              )}
            </div>
          </div>
          <div className="glass-panel">
            {productsLoading ? (
              <div className="table-loading"><div className="spinner"></div><p>Loading products...</p></div>
            ) : (
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Product</th><th>SKU</th><th>Category</th><th>Price</th><th>Stock</th>
                    {hasPermission('manage_products') && <th className="text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length === 0 ? (
                    <tr><td colSpan={hasPermission('manage_products') ? 6 : 5} className="text-center py-xl text-muted">No products found.</td></tr>
                  ) : (
                    filteredProducts.map(product => {
                      const totalStock = product.product_inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0;
                      const isLowStock = totalStock <= 5;
                      return (
                        <tr key={product.id} className={isLowStock ? 'row-warning' : ''}>
                          <td>
                            <div className="product-cell">
                              <div className="product-avatar">{product.name.charAt(0).toUpperCase()}</div>
                              <div className="product-info">
                                <span className="product-name">{product.name}</span>
                                {isLowStock && <span className="badge badge-warning badge-sm mt-xs">Low Stock</span>}
                              </div>
                            </div>
                          </td>
                          <td><code className="text-mono">{product.sku}</code></td>
                          <td><span className="badge badge-neutral">{product.category}</span></td>
                          <td className="font-medium">${Number(product.price).toFixed(2)}</td>
                          <td>
                            <div className="stock-cell">
                              <span className={`stock-count ${isLowStock ? 'text-warning font-bold' : ''}`}>{totalStock}</span>
                              <span className="stock-threshold text-muted text-sm">/ across locs</span>
                            </div>
                          </td>
                          {hasPermission('manage_products') && (
                            <td className="text-right">
                              <div className="action-buttons">
                                <button className="btn-icon" onClick={() => setQrLabelProduct(product)} title="Print QR Label">
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                    <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
                                    <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
                                    <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
                                    <rect x="14" y="14" width="3" height="3" fill="currentColor"/>
                                    <rect x="18" y="18" width="3" height="3" fill="currentColor"/>
                                    <rect x="14" y="18" width="3" height="3" fill="currentColor"/>
                                  </svg>
                                </button>
                                <button className="btn-icon" onClick={() => openEditProductModal(product)} title="Edit">
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </button>
                                <button className="btn-icon text-error hover-bg-error" onClick={() => handleDeleteProduct(product.id, product.name)} title="Delete">
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                    <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                  </svg>
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ═══ LEDGER TAB ═══ */}
      {activeTab === 'ledger' && (
        <div className="glass-panel" style={{ marginTop: '1rem' }}>
          <table className="glass-table">
            <thead>
              <tr>
                <th>Date</th><th>Product</th><th>Type</th><th>Change</th><th>User</th><th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {stockLoading ? (
                <tr><td colSpan="6" className="text-center py-xl text-muted">Loading movements...</td></tr>
              ) : movements.length === 0 ? (
                <tr><td colSpan="6" className="text-center py-xl text-muted">No stock movements found.</td></tr>
              ) : (
                movements.map(m => (
                  <tr key={m.id}>
                    <td className="text-muted">{formatDate(m.created_at)}</td>
                    <td className="font-medium">
                      {m.product?.name || 'Unknown'} <br/>
                      <small className="text-muted font-normal">{m.product?.sku}</small>
                    </td>
                    <td>
                      <span className={`role-badge ${getTypeBadgeClass(m.movement_type)}`} style={{ fontSize: '12px', padding: '4px 8px' }}>
                        {m.movement_type}
                      </span>
                    </td>
                    <td className="font-bold" style={{ color: m.quantity_change > 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                      {m.quantity_change > 0 ? '+' : ''}{m.quantity_change}
                    </td>
                    <td>{m.user?.email?.split('@')[0] || 'Unknown'}</td>
                    <td className="text-muted" style={{ fontSize: '14px', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.notes || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ TRANSFERS TAB ═══ */}
      {activeTab === 'transfers' && (
        <div>
          {hasPermission('manage_inventory') && (
            <div style={{ marginBottom: '1rem' }}>
              <button className="btn btn-primary" onClick={() => setIsTransferModalOpen(true)}>+ New Transfer</button>
            </div>
          )}
          <div className="glass-panel">
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Date</th><th>Product</th><th>From → To</th><th>Qty</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {transfersLoading ? (
                  <tr><td colSpan="6" className="text-center py-xl text-muted">Loading...</td></tr>
                ) : transfers.length === 0 ? (
                  <tr><td colSpan="6" className="text-center py-xl text-muted">No transfers found.</td></tr>
                ) : (
                  transfers.map(t => (
                    <tr key={t.id}>
                      <td className="text-muted">{formatDate(t.created_at)}</td>
                      <td className="font-medium">{t.product?.name}<br/><small className="text-muted">{t.product?.sku}</small></td>
                      <td>{t.from_location?.name} → {t.to_location?.name}</td>
                      <td className="font-bold">{t.quantity}</td>
                      <td><span className={`transfer-status ${t.status.toLowerCase()}`}>{t.status}</span></td>
                      <td>
                        {t.status === 'PENDING' && hasPermission('manage_inventory') && (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn btn-sm btn-primary" onClick={() => handleTransferAction(t.id, 'complete')}>Receive</button>
                            <button className="btn btn-sm btn-secondary" onClick={() => handleTransferAction(t.id, 'cancel')}>Cancel</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ INVENTORY COUNT TAB ═══ */}
      {activeTab === 'inventorycount' && (
        <InventoryCount locations={locations} products={products} />
      )}



      {/* ═══ CYCLE COUNTS TAB ═══ */}
      {activeTab === 'audits' && (
        <div>
          <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '1rem', fontWeight: 600 }}>New Cycle Count</h3>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Select Location</label>
              <select className="form-input" value={auditLocationId} onChange={e => { setAuditLocationId(e.target.value); setAuditCounts({}); setAuditResults(null); }}>
                <option value="">Choose a location...</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>

            {auditLocationId && auditProducts.length > 0 && (
              <>
                <div className="audit-grid">
                  <div className="audit-row" style={{ background: 'transparent', border: 'none', fontWeight: 600, fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                    <span>Product</span>
                    <span style={{ textAlign: 'center' }}>System Qty</span>
                    <span style={{ textAlign: 'center' }}>Physical Count</span>
                  </div>
                  {auditProducts.map(p => (
                    <div key={p.id} className="audit-row">
                      <span className="product-name">{p.name} <small className="text-muted">({p.sku})</small></span>
                      <span className="expected-qty">{p.currentQty}</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="—"
                        value={auditCounts[p.id] ?? ''}
                        onChange={e => setAuditCounts(prev => ({ ...prev, [p.id]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-primary" disabled={submittingAudit} onClick={handleAuditSubmit}>
                    {submittingAudit ? 'Submitting...' : 'Submit Cycle Count'}
                  </button>
                </div>
              </>
            )}

            {auditResults && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(34, 197, 94, 0.08)', borderRadius: '8px', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                <p style={{ fontWeight: 600, color: 'var(--color-success)' }}>{auditResults.message}</p>
                {auditResults.results?.filter(r => r.discrepancy !== 0).map((r, i) => {
                  const prod = products.find(p => p.id === r.product_id);
                  return (
                    <div key={i} style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                      <strong>{prod?.name || 'Unknown'}</strong>: Expected {r.expected}, Counted {r.counted} → <span className={r.discrepancy > 0 ? 'discrepancy-positive' : 'discrepancy-negative'}>{r.discrepancy > 0 ? '+' : ''}{r.discrepancy}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Audit History */}
          <div className="glass-panel">
            <h3 style={{ padding: '1rem 1.5rem', fontWeight: 600, borderBottom: '1px solid var(--color-border)' }}>Audit History</h3>
            <table className="glass-table">
              <thead>
                <tr><th>Date</th><th>Product</th><th>Location</th><th>Expected</th><th>Counted</th><th>Discrepancy</th><th>By</th></tr>
              </thead>
              <tbody>
                {auditsLoading ? (
                  <tr><td colSpan="7" className="text-center py-xl text-muted">Loading...</td></tr>
                ) : audits.length === 0 ? (
                  <tr><td colSpan="7" className="text-center py-xl text-muted">No audits yet.</td></tr>
                ) : (
                  audits.map(a => (
                    <tr key={a.id}>
                      <td className="text-muted">{formatDate(a.created_at)}</td>
                      <td className="font-medium">{a.product?.name}</td>
                      <td>{a.location?.name}</td>
                      <td style={{ textAlign: 'center' }}>{a.expected_quantity}</td>
                      <td style={{ textAlign: 'center' }}>{a.counted_quantity}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={a.discrepancy > 0 ? 'discrepancy-positive' : a.discrepancy < 0 ? 'discrepancy-negative' : 'discrepancy-zero'}>
                          {a.discrepancy > 0 ? '+' : ''}{a.discrepancy}
                        </span>
                      </td>
                      <td>{a.auditor?.email?.split('@')[0]}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ BATCHES TAB ═══ */}
      {activeTab === 'batches' && (
        <div>
          {hasPermission('manage_inventory') && (
            <div style={{ marginBottom: '1rem' }}>
              <button className="btn btn-primary" onClick={() => setIsBatchModalOpen(true)}>+ Register Batch</button>
            </div>
          )}
          <div className="glass-panel">
            <table className="glass-table">
              <thead>
                <tr><th>Product</th><th>Batch #</th><th>Location</th><th>Qty</th><th>Expiry</th><th>Status</th></tr>
              </thead>
              <tbody>
                {batchesLoading ? (
                  <tr><td colSpan="6" className="text-center py-xl text-muted">Loading...</td></tr>
                ) : batches.length === 0 ? (
                  <tr><td colSpan="6" className="text-center py-xl text-muted">No batches registered.</td></tr>
                ) : (
                  batches.map(b => {
                    const status = getExpiryStatus(b.expiry_date);
                    return (
                      <tr key={b.id} className={status.rowClass}>
                        <td className="font-medium">{b.product?.name}<br/><small className="text-muted">{b.product?.sku}</small></td>
                        <td><code className="text-mono">{b.batch_number}</code></td>
                        <td>{b.location?.name}</td>
                        <td className="font-bold">{b.quantity}</td>
                        <td>{new Date(b.expiry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                        <td><span className={`expiry-badge ${status.class}`}>{status.label}</span></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ MODALS ═══ */}

      {/* Adjust Modal */}
      <Modal isOpen={isAdjustModalOpen} onClose={() => !adjusting && setIsAdjustModalOpen(false)} title="Adjust Stock">
        <form onSubmit={handleAdjustSubmit} className="modal-form">
          {stockError && <div className="alert alert-error"><p>{stockError}</p></div>}
          <div className="form-group">
            <label>Product</label>
            <select required value={adjustData.productId} onChange={e => setAdjustData({...adjustData, productId: e.target.value})} className="form-input">
              <option value="">Select a product...</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Location</label>
            <select required value={adjustData.locationId} onChange={e => setAdjustData({...adjustData, locationId: e.target.value})} className="form-input">
              <option value="">Select a location...</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Movement Type</label>
            <select required value={adjustData.movementType} onChange={e => setAdjustData({...adjustData, movementType: e.target.value})} className="form-input">
              <option value="RECEIPT">Receive Stock (+)</option>
              <option value="ADJUSTMENT">Manual Adjustment</option>
              <option value="RETURN">Customer Return (+)</option>
              <option value="SHRINKAGE">Shrinkage / Damage (-)</option>
            </select>
          </div>
          {adjustData.movementType === 'SHRINKAGE' && (
            <div className="form-group">
              <label>Shrinkage Reason <span style={{ color: '#ef4444' }}>*</span></label>
              <select required value={adjustData.shrinkageReason} onChange={e => setAdjustData({...adjustData, shrinkageReason: e.target.value})} className="form-input">
                <option value="">Select reason...</option>
                <option value="theft_suspected">🚨 Theft Suspected</option>
                <option value="damage">💥 Damage / Broken / Expired</option>
                <option value="admin_error">📝 Admin / Counting Error</option>
                <option value="unknown">❓ Unknown / Unexplained</option>
              </select>
            </div>
          )}
          <div className="form-group">
            <label>Quantity Change (Absolute Number)</label>
            <input type="number" required min="1" value={adjustData.quantityChange} onChange={e => setAdjustData({...adjustData, quantityChange: e.target.value})} className="form-input" placeholder="e.g. 50" />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <input type="text" value={adjustData.notes} onChange={e => setAdjustData({...adjustData, notes: e.target.value})} className="form-input" placeholder="e.g. Received PO-1029" />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setIsAdjustModalOpen(false)} disabled={adjusting}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={adjusting || !adjustData.productId || !adjustData.quantityChange}>
              {adjusting ? 'Saving...' : 'Save Adjustment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Threshold Modal */}
      <Modal isOpen={isThresholdModalOpen} onClose={() => !thresholding && setIsThresholdModalOpen(false)} title="Manage Low Stock Threshold">
        <form onSubmit={handleThresholdSubmit} className="modal-form">
          {thresholdError && <div className="alert alert-error"><p>{thresholdError}</p></div>}
          <div className="form-group">
            <label>Product</label>
            <select required value={thresholdData.productId} onChange={e => setThresholdData({...thresholdData, productId: e.target.value})} className="form-input">
              <option value="">Select a product...</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Location</label>
            <select required value={thresholdData.locationId} onChange={e => {
              const locId = e.target.value;
              const selectedProd = products.find(p => p.id === thresholdData.productId);
              const existingInv = selectedProd?.product_inventory?.find(inv => inv.location_id === locId);
              setThresholdData({ ...thresholdData, locationId: locId, threshold: existingInv?.low_stock_threshold !== undefined ? existingInv.low_stock_threshold : '' });
            }} className="form-input" disabled={!thresholdData.productId}>
              <option value="">Select a location...</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Low Stock Alert Threshold</label>
            <input type="number" required min="0" value={thresholdData.threshold} onChange={e => setThresholdData({...thresholdData, threshold: e.target.value})} className="form-input" placeholder="e.g. 5" disabled={!thresholdData.locationId} />
            <small className="text-muted" style={{ display: 'block', marginTop: '4px' }}>
              The system will trigger an alert when stock at this location falls to or below this number.
            </small>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setIsThresholdModalOpen(false)} disabled={thresholding}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={thresholding || !thresholdData.productId || !thresholdData.locationId || thresholdData.threshold === ''}>
              {thresholding ? 'Saving...' : 'Save Threshold'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Transfer Modal */}
      <Modal isOpen={isTransferModalOpen} onClose={() => !transferring && setIsTransferModalOpen(false)} title="New Stock Transfer">
        <form onSubmit={handleTransferSubmit} className="modal-form">
          {transferError && <div className="alert alert-error"><p>{transferError}</p></div>}
          <div className="form-group">
            <label>Product</label>
            <select required value={transferData.productId} onChange={e => setTransferData({...transferData, productId: e.target.value})} className="form-input">
              <option value="">Select a product...</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>From Location</label>
            <select required value={transferData.fromLocationId} onChange={e => setTransferData({...transferData, fromLocationId: e.target.value})} className="form-input">
              <option value="">Source location...</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>To Location</label>
            <select required value={transferData.toLocationId} onChange={e => setTransferData({...transferData, toLocationId: e.target.value})} className="form-input">
              <option value="">Destination location...</option>
              {locations.filter(l => l.id !== transferData.fromLocationId).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Quantity</label>
            <input type="number" required min="1" value={transferData.quantity} onChange={e => setTransferData({...transferData, quantity: e.target.value})} className="form-input" placeholder="e.g. 25" />
          </div>
          <div className="form-group">
            <label>Notes (optional)</label>
            <input type="text" value={transferData.notes} onChange={e => setTransferData({...transferData, notes: e.target.value})} className="form-input" placeholder="e.g. Restocking branch B" />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setIsTransferModalOpen(false)} disabled={transferring}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={transferring || !transferData.productId || !transferData.fromLocationId || !transferData.toLocationId || !transferData.quantity}>
              {transferring ? 'Creating...' : 'Initiate Transfer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Batch Modal */}
      <Modal isOpen={isBatchModalOpen} onClose={() => !batchSubmitting && setIsBatchModalOpen(false)} title="Register Product Batch">
        <form onSubmit={handleBatchSubmit} className="modal-form">
          {batchError && <div className="alert alert-error"><p>{batchError}</p></div>}
          <div className="form-group">
            <label>Product</label>
            <select required value={batchData.productId} onChange={e => setBatchData({...batchData, productId: e.target.value})} className="form-input">
              <option value="">Select a product...</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Location</label>
            <select required value={batchData.locationId} onChange={e => setBatchData({...batchData, locationId: e.target.value})} className="form-input">
              <option value="">Select a location...</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Batch Number</label>
            <input type="text" required value={batchData.batchNumber} onChange={e => setBatchData({...batchData, batchNumber: e.target.value})} className="form-input" placeholder="e.g. LOT-2026-001" />
          </div>
          <div className="form-group">
            <label>Quantity</label>
            <input type="number" required min="1" value={batchData.quantity} onChange={e => setBatchData({...batchData, quantity: e.target.value})} className="form-input" placeholder="e.g. 100" />
          </div>
          <div className="form-group">
            <label>Expiry Date</label>
            <input type="date" required value={batchData.expiryDate} onChange={e => setBatchData({...batchData, expiryDate: e.target.value})} className="form-input" />
          </div>
          <div className="form-group">
            <label>Notes (optional)</label>
            <input type="text" value={batchData.notes} onChange={e => setBatchData({...batchData, notes: e.target.value})} className="form-input" placeholder="e.g. Supplier: Acme Corp" />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setIsBatchModalOpen(false)} disabled={batchSubmitting}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={batchSubmitting || !batchData.productId || !batchData.batchNumber || !batchData.expiryDate}>
              {batchSubmitting ? 'Saving...' : 'Register Batch'}
            </button>
          </div>
        </form>
      </Modal>
      {/* QR Scanner */}
      <QrScanner isOpen={showScanner} onClose={() => setShowScanner(false)} onScan={handleQrScan} />

      {/* ═══ Product Add/Edit Modal ═══ */}
      <Modal isOpen={isProductModalOpen} onClose={closeProductModal} title={editingProduct ? 'Edit Product' : 'Add New Product'}>
        <form onSubmit={handleProductSubmit} className="form-layout">
          {productFormError && <div className="alert alert-error"><p>{productFormError}</p></div>}
          <div className="form-group">
            <label htmlFor="prod-name">Product Name *</label>
            <input type="text" id="prod-name" className="form-input" required value={productFormData.name}
              onChange={e => setProductFormData({...productFormData, name: e.target.value})} placeholder="e.g. Wireless Headphones" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="prod-sku">SKU *</label>
              <input type="text" id="prod-sku" className="form-input text-mono" required value={productFormData.sku}
                onChange={e => setProductFormData({...productFormData, sku: e.target.value})} placeholder="WH-001" />
            </div>
            <div className="form-group">
              <label htmlFor="prod-category">Category</label>
              <input type="text" id="prod-category" className="form-input" value={productFormData.category}
                onChange={e => setProductFormData({...productFormData, category: e.target.value})} placeholder="Electronics" />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="prod-price">Price ($) *</label>
            <div className="input-prefix-wrapper">
              <span className="input-prefix">$</span>
              <input type="number" id="prod-price" className="form-input with-prefix" required min="0" step="0.01"
                value={productFormData.price} onChange={e => setProductFormData({...productFormData, price: e.target.value})} placeholder="99.99" />
            </div>
          </div>
          {!editingProduct && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="prod-qty">Initial Quantity</label>
                <input type="number" id="prod-qty" className="form-input" min="0" value={productFormData.initialQuantity}
                  onChange={e => setProductFormData({...productFormData, initialQuantity: e.target.value})} placeholder="e.g. 100" />
              </div>
              <div className="form-group">
                <label htmlFor="prod-loc">Location</label>
                <select id="prod-loc" className="form-input" value={productFormData.locationId}
                  onChange={e => setProductFormData({...productFormData, locationId: e.target.value})}>
                  <option value="">Select location...</option>
                  {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </select>
              </div>
            </div>
          )}
          <div className="form-group">
            <label htmlFor="prod-qr">QR Code Data</label>
            <input type="text" id="prod-qr" className="form-input text-mono" value={productFormData.qr_code_data}
              onChange={e => setProductFormData({...productFormData, qr_code_data: e.target.value})}
              placeholder={productFormData.sku || 'Auto-generated from SKU'} />
            <small className="text-muted" style={{ display: 'block', marginTop: '4px' }}>
              Leave blank to auto-use the SKU. This value is encoded in the printed QR label.
            </small>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={closeProductModal} disabled={isProductSubmitting}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isProductSubmitting}>
              {isProductSubmitting ? 'Saving...' : 'Save Product'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ═══ QR Label Modal ═══ */}
      <Modal isOpen={!!qrLabelProduct} onClose={() => setQrLabelProduct(null)} title="Print QR Label">
        {qrLabelProduct && (
          <div className="qr-print-label">
            <div className="qr-code-wrapper">
              <QRCodeSVG value={qrLabelProduct.qr_code_data || qrLabelProduct.sku} size={200} level="H" includeMargin={true} />
            </div>
            <div className="product-label-info">
              <div className="product-label-name">{qrLabelProduct.name}</div>
              <div className="product-label-sku">SKU: {qrLabelProduct.sku}</div>
              <div className="product-label-price">${Number(qrLabelProduct.price).toFixed(2)}</div>
            </div>
            <div className="modal-actions" style={{ marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setQrLabelProduct(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Print Label</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
