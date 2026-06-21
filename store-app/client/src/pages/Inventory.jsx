import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthContext } from '../lib/AuthContext';
import { useProducts } from '../hooks/useProducts';
import { useStock } from '../hooks/useStock';
import { api } from '../lib/api';
import Modal from '../components/Modal';
import InventoryCount from '../components/InventoryCount';
import TrackingModal from '../components/TrackingModal';
import SoldUnitsModal from '../components/SoldUnitsModal';
import ProductModal from '../features/inventory/components/ProductModal';
import AdjustStockModal from '../features/inventory/components/AdjustStockModal';
import ThresholdModal from '../features/inventory/components/ThresholdModal';
import TransferModal from '../features/inventory/components/TransferModal';
import BatchModal from '../features/inventory/components/BatchModal';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import { usePrintDocument } from '../hooks/usePrintDocument';
import { useCurrency } from '../hooks/useCurrency';
import PurchaseOrderDocument from '../components/PurchaseOrderDocument';
import InventoryAnalytics from '../features/inventory/components/InventoryAnalytics';
import BulkPriceUpdate from '../features/inventory/components/BulkPriceUpdate';
import PriceTagPrinter from '../features/inventory/components/PriceTagPrinter';
import PriceListPrint from '../features/inventory/components/PriceListPrint';
import PriceChangeHistory from '../features/inventory/components/PriceChangeHistory';
import { useExportCsv } from '../hooks/useExportCsv';

function PricingTabContent({ refreshProducts }) {
  const [activeSection, setActiveSection] = useState('bulk-update');
  const sections = [
    { id: 'bulk-update', label: 'Bulk Update' },
    { id: 'price-tags', label: 'Price Tags' },
    { id: 'price-list', label: 'Price List' },
    { id: 'history', label: 'Change History' },
  ];

  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {sections.map(s => (
          <button
            key={s.id}
            className={`btn btn-sm ${activeSection === s.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveSection(s.id)}
            style={activeSection === s.id ? { background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-hover))', border: 'none', boxShadow: '0 2px 8px rgba(99,102,241,0.3)' } : {}}
          >
            {s.label}
          </button>
        ))}
      </div>
      {activeSection === 'bulk-update' && <BulkPriceUpdate onComplete={refreshProducts} />}
      {activeSection === 'price-tags' && <PriceTagPrinter />}
      {activeSection === 'price-list' && <PriceListPrint />}
      {activeSection === 'history' && <PriceChangeHistory />}
    </div>
  );
}

export default function Inventory() {
  const { hasPermission } = useAuthContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const { business, printElement } = usePrintDocument();
  const { fmt } = useCurrency(business);
  const { exportCsv } = useExportCsv();
  const { products, loading: productsLoading, addProduct, updateProduct, deleteProduct, fetchProducts } = useProducts();
  const { movements, loading: stockLoading, fetchMovements, adjustStock, page: stockPage, totalPages: stockTotalPages, totalMovements } = useStock();
  const { role, locationIds } = useAuthContext();
  const isManagerOrAdmin = ['Business Admin', 'Manager', 'Platform Admin'].includes(role);

  const [locations, setLocations] = useState([]);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'products');

  // ─── Products Tab State ───
  const [productSearch, setProductSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productFormError, setProductFormError] = useState('');
  const [isProductSubmitting, setIsProductSubmitting] = useState(false);
  // Adjust Modal
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  // Threshold Modal
  const [isThresholdModalOpen, setIsThresholdModalOpen] = useState(false);
  const [thresholding, setThresholding] = useState(false);
  const [thresholdError, setThresholdError] = useState('');

  // Transfers
  const [transfers, setTransfers] = useState([]);
  const [transfersLoading, setTransfersLoading] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState('');

  // Audits (Cycle Counts)
  const [audits, setAudits] = useState([]);
  const [auditsLoading, setAuditsLoading] = useState(false);
  const [auditLocationId, setAuditLocationId] = useState(searchParams.get('location') || '');
  const [auditCounts, setAuditCounts] = useState({});
  const [submittingAudit, setSubmittingAudit] = useState(false);
  const [auditResults, setAuditResults] = useState(null);

  // Batches
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchError, setBatchError] = useState('');

  // Tracking Modal
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [selectedTrackingProduct, setSelectedTrackingProduct] = useState(null);

  // Sold Units Modal
  const [isSoldUnitsModalOpen, setIsSoldUnitsModalOpen] = useState(false);
  const [selectedSoldProduct, setSelectedSoldProduct] = useState(null);

  // GRN State
  const [showGrnModal, setShowGrnModal] = useState(false);
  const [grnData, setGrnData] = useState(null);

  useEffect(() => {
    fetchMovements(stockPage);
    api.get('/locations').then(res => {
      setLocations(res);
      if (!isManagerOrAdmin && res.length > 0) {
        const userLocs = res.filter(loc => locationIds.includes(loc.id));
        if (userLocs.length > 0 && locationFilter === 'all') {
          setLocationFilter(userLocs[0].id);
        }
      }
    }).catch(() => setLocations([]));
  }, [fetchMovements, stockPage, isManagerOrAdmin, locationIds]);


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

  // Fetch tab data on tab change
  useEffect(() => {
    if (activeTab === 'transfers') fetchTransfers();
    if (activeTab === 'audits') fetchAudits();
    if (activeTab === 'batches') fetchBatches();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const handleAdjustSubmit = async (adjustData) => {
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
      // If RECEIPT, offer GRN print
      if (adjustData.movementType === 'RECEIPT') {
        const product = products.find(p => p.id === adjustData.productId);
        setGrnData({
          items: [{
            product_name: product?.name || 'Unknown',
            sku: product?.sku || '',
            quantity: Math.abs(finalQtyChange),
            unit_cost: product?.price || 0,
          }],
          notes: adjustData.notes,
          date: new Date().toISOString(),
        });
        setShowGrnModal(true);
      }
    }
    setAdjusting(false);
  };

  const handleThresholdSubmit = async (thresholdData) => {
    setThresholdError('');
    setThresholding(true);
    try {
      await api.put(`/stock/${thresholdData.productId}/locations/${thresholdData.locationId}/threshold`, {
        threshold: parseInt(thresholdData.threshold, 10)
      });
      setIsThresholdModalOpen(false);
      window.location.reload();
    } catch (err) {
      setThresholdError(err.message || 'Failed to update threshold');
    } finally {
      setThresholding(false);
    }
  };

  // Transfers
  const handleTransferSubmit = async (transferData) => {
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
      toast.error(err.message || `Failed to ${action} transfer`);
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
      toast.warning('Please enter at least one count.');
      setSubmittingAudit(false);
      return;
    }

    try {
      const result = await api.post('/stock/audits', { location_id: auditLocationId, counts });
      setAuditResults(result);
      setAuditCounts({});
      fetchAudits();
    } catch (err) {
      toast.error(err.message || 'Failed to submit audit');
    } finally {
      setSubmittingAudit(false);
    }
  };

  // Batches
  const handleBatchSubmit = async (batchData) => {
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
      fetchBatches();
    } catch (err) {
      setBatchError(err.message || 'Failed to create batch');
    } finally {
      setBatchSubmitting(false);
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
  const visibleLocations = isManagerOrAdmin ? locations : locations.filter(loc => locationIds.includes(loc.id));

  const filteredProducts = useMemo(() => {
    let result = products;

    if (productSearch) {
      const lower = productSearch.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(lower) ||
        p.sku.toLowerCase().includes(lower) ||
        (p.product_code && p.product_code.toLowerCase().includes(lower)) ||
        p.category?.toLowerCase().includes(lower)
      );
    }

    if (!isManagerOrAdmin && locationFilter === 'all' && visibleLocations.length > 0) {
      // Force filter to first assigned location if non-admin tries to view all
      const forcedLocation = visibleLocations[0].id;
      result = result.filter(p => {
        const total = p.product_inventory?.find(inv => inv.location_id === forcedLocation)?.quantity || 0;
        if (stockFilter === 'in_stock') return total > 0;
        if (stockFilter === 'low_stock') return total > 0 && total <= 5;
        if (stockFilter === 'out_of_stock') return total === 0;
        return true;
      });
    } else if (stockFilter !== 'all' || locationFilter !== 'all') {
      result = result.filter(p => {
        const total = locationFilter === 'all' 
          ? (p.product_inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0)
          : (p.product_inventory?.find(inv => inv.location_id === locationFilter)?.quantity || 0);
          
        if (stockFilter === 'in_stock') return total > 0;
        if (stockFilter === 'low_stock') return total > 0 && total <= 5;
        if (stockFilter === 'out_of_stock') return total === 0;
        return true;
      });
    }

    return result;
  }, [products, productSearch, stockFilter, locationFilter, isManagerOrAdmin, visibleLocations]);

  const openAddProductModal = () => {
    setEditingProduct(null);
    setProductFormError('');
    setIsProductModalOpen(true);
  };

  const openEditProductModal = (product) => {
    setEditingProduct(product);
    setProductFormError('');
    setIsProductModalOpen(true);
  };

  const closeProductModal = () => {
    setIsProductModalOpen(false);
    setEditingProduct(null);
    setProductFormError('');
  };

  const handleProductSubmit = async (data) => {
    setProductFormError('');
    setIsProductSubmitting(true);
    try {
      if (editingProduct) {
        const result = await updateProduct(editingProduct.id, {
          name: data.name,
          sku: data.sku,
          category: data.category,
          price: parseFloat(data.price),
          qr_code_data: data.qr_code_data
        });
        if (!result.success) throw new Error(result.error || 'Failed to update product');
      } else {
        const result = await addProduct({
          name: data.name,
          sku: data.sku,
          category: data.category,
          price: parseFloat(data.price),
          initialQuantity: data.initialQuantity ? parseInt(data.initialQuantity, 10) : 0,
          locationId: data.locationId,
          qr_code_data: data.qr_code_data
        });
        if (!result.success) throw new Error(result.error || 'Failed to add product');
      }
      closeProductModal();
    } catch (err) {
      setProductFormError(err.message);
    } finally {
      setIsProductSubmitting(false);
    }
  };

  const handleDeleteProduct = async (id, name) => {
    const confirmed = await confirm({ title: 'Delete Product', message: `Delete ${name}? This cannot be undone.`, variant: 'danger', confirmText: 'Delete' });
    if (confirmed) {
      await deleteProduct(id);
      closeProductModal();
    }
  };


  const tabs = [
    { id: 'products', label: 'Products' },
    { id: 'ledger', label: 'Ledger' },
    { id: 'transfers', label: 'Transfers' },
    { id: 'inventorycount', label: 'Inventory Count' },
    { id: 'audits', label: 'Cycle Counts' },
    { id: 'batches', label: 'Batches' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'pricing', label: 'Pricing' },
  ];

  const tabsScrollRef = useRef(null);
  const [tabsFade, setTabsFade] = useState({ left: false, right: false });

  const updateTabsFade = () => {
    const el = tabsScrollRef.current;
    if (!el) return;
    setTabsFade({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  };

  useEffect(() => { updateTabsFade(); }, []);

  return (
    <div className="inventory-page">
      <div className="inventory-header page-header">
        <div>
          <h1 className="page-title">Inventory Management</h1>
          <p className="page-subtitle">Track stock, transfers, audits, and batch expiries.</p>
        </div>
        {hasPermission('manage_inventory') && (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => exportCsv(filteredProducts, [
              { key: 'sku', label: 'SKU' },
              { key: 'name', label: 'Product Name' },
              { key: 'category', label: 'Category' },
              { key: 'price', label: 'Price', format: (v) => Number(v).toFixed(2) },
              { key: 'stock_quantity', label: 'Stock', format: (_, row) => {
                return (row.product_inventory?.reduce((s, i) => s + i.quantity, 0) || 0).toString();
              }},
            ], 'inventory')} disabled={filteredProducts.length === 0}>
              Export CSV
            </button>
            {hasPermission('manage_financials') && (
              <button className="btn btn-secondary" onClick={() => navigate('/imports/products')}>
                Import
              </button>
            )}
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
        <div style={{ marginBottom: '24px', padding: '16px', borderRadius: 'var(--radius-lg)', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <h3 style={{ color: 'var(--color-warning)', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 9V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M12 17.5V18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M12 3L2 21H22L12 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            Low Stock Alerts ({lowStockProducts.length})
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {lowStockProducts.map((p, idx) => (
              <div key={`${p.id}-${idx}`} style={{ padding: '6px 10px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(245,158,11,0.3)', fontSize: '0.825rem', display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{p.name}</span>
                <span style={{ color: p.quantity === 0 ? 'var(--color-error)' : 'var(--color-warning)', fontWeight: 700 }}>{p.quantity} left</span>
                {locations.length > 1 && <span style={{ color: 'var(--color-text-muted)' }}>@ {locations.find(l => l.id === p.loc_id)?.name || 'Unknown'}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className={`inventory-tabs-wrap ${tabsFade.left ? 'fade-left' : ''} ${tabsFade.right ? 'fade-right' : ''}`}>
        <div className="inventory-tabs" ref={tabsScrollRef} onScroll={updateTabsFade}>
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
                placeholder="Search by name, SKU..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="search-input"
              />
            </div>
            <div className="filter-group" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 1, margin: '0 10px' }}>
              <select 
                className="form-input" 
                value={locationFilter} 
                onChange={(e) => setLocationFilter(e.target.value)}
                style={{ minWidth: '150px' }}
              >
                {isManagerOrAdmin && <option value="all">All Locations</option>}
                {visibleLocations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
              <select  
                className="form-input" 
                value={stockFilter} 
                onChange={(e) => setStockFilter(e.target.value)}
                style={{ minWidth: '150px' }}
              >
                <option value="all">All Stock Levels</option>
                <option value="in_stock">In Stock</option>
                <option value="low_stock">Low Stock (≤5)</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span className="badge badge-neutral">{filteredProducts.length} items</span>
              {hasPermission('manage_products') && (
                <button className="btn btn-primary fab-mobile" onClick={openAddProductModal} title="Add Product">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="fab-icon">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  <span className="fab-text">+ Add Product</span>
                </button>
              )}
            </div>
          </div>
          <div className="glass-panel">
            {productsLoading ? (
              <div className="table-loading"><div className="spinner"></div><p>Loading products...</p></div>
            ) : (<>
              <div className="desktop-table-view">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Model</th>
                    <th>Quantity available</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length === 0 ? (
                    <tr><td colSpan={3} className="text-center py-xl text-muted">No products found.</td></tr>
                  ) : (
                    filteredProducts.map(product => {
                      const displayStock = locationFilter === 'all'
                        ? (product.product_inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0)
                        : (product.product_inventory?.find(inv => inv.location_id === locationFilter)?.quantity || 0);
                      const isLowStock = displayStock <= 5;
                      
                      return (
                        <tr 
                          key={product.id} 
                          className={isLowStock ? 'row-warning' : ''}
                          style={{ cursor: hasPermission('manage_products') ? 'pointer' : 'default' }}
                          onClick={() => hasPermission('manage_products') && openEditProductModal(product)}
                        >
                          <td><code className="text-mono">{product.sku}</code></td>
                          <td>
                            <div className="product-cell">
                              <div className="product-info">
                                <span className="product-name">{product.name}</span>
                                {product.product_code && (
                                  <span className="text-muted text-sm" style={{display: 'block'}}>{product.product_code}</span>
                                )}
                                {isLowStock && <span className="badge badge-warning badge-sm mt-xs">Low Stock</span>}
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="stock-cell">
                              <span 
                                className={`stock-count ${isLowStock ? 'text-warning font-bold' : ''}`}
                                style={{ cursor: 'pointer', textDecoration: 'underline' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTrackingProduct(product);
                                  setIsTrackingModalOpen(true);
                                }}
                              >
                                {displayStock}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              </div>
              <div className="mobile-card-view">
                {filteredProducts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-secondary)' }}>No products found.</div>
                ) : filteredProducts.map(product => {
                  const displayStock = locationFilter === 'all'
                    ? (product.product_inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0)
                    : (product.product_inventory?.find(inv => inv.location_id === locationFilter)?.quantity || 0);
                  const isLowStock = displayStock <= 5;
                  return (
                    <div 
                      key={product.id} 
                      className="m-card"
                      style={{ cursor: hasPermission('manage_products') ? 'pointer' : 'default' }}
                      onClick={() => hasPermission('manage_products') && openEditProductModal(product)}
                    >
                      <div className="m-card-top">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                          <div style={{ minWidth: 0 }}>
                            <div className="m-card-title">{product.name}</div>
                            {isLowStock && <span className="badge badge-warning badge-sm">Low Stock</span>}
                            <div className="m-card-meta">
                              <code>{product.sku}</code>
                              {product.product_code && <span style={{marginLeft: '8px', color: 'var(--color-text-secondary)'}}>{product.product_code}</span>}
                            </div>
                          </div>
                        </div>
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          <div 
                            className="m-card-amount" 
                            style={{ color: isLowStock ? 'var(--color-warning)' : undefined, cursor: 'pointer', textDecoration: 'underline' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTrackingProduct(product);
                              setIsTrackingModalOpen(true);
                            }}
                          >
                            {displayStock} in stock
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>)}
          </div>
        </div>
      )}

      {/* ═══ LEDGER TAB ═══ */}
      {activeTab === 'ledger' && (
        <div className="glass-panel" style={{ marginTop: '1rem' }}>
          <div className="desktop-table-view">
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
          <div className="mobile-card-view">
            {stockLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner mx-auto" /><p className="mt-sm text-muted">Loading...</p></div>
            ) : movements.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-secondary)' }}>No stock movements found.</div>
            ) : movements.map(m => (
              <div key={m.id} className="m-card">
                <div className="m-card-top">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="m-card-title">{m.product?.name || 'Unknown'}</div>
                    <div className="m-card-meta"><code>{m.product?.sku}</code> · {m.user?.email?.split('@')[0] || 'Unknown'}</div>
                    <div className="m-card-meta">{formatDate(m.created_at)}</div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <span className={`role-badge ${getTypeBadgeClass(m.movement_type)}`} style={{ fontSize: '11px', padding: '3px 6px' }}>{m.movement_type}</span>
                    <div className="m-card-amount" style={{ color: m.quantity_change > 0 ? 'var(--color-success)' : 'var(--color-error)', marginTop: '4px' }}>
                      {m.quantity_change > 0 ? '+' : ''}{m.quantity_change}
                    </div>
                  </div>
                </div>
                {m.notes && m.notes !== '-' && <div className="m-card-sub" style={{ marginTop: '6px' }}>{m.notes}</div>}
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {stockTotalPages > 1 && (
            <div style={{ padding: '16px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="text-sm text-muted">
                Showing {(stockPage - 1) * 50 + 1} to {Math.min(stockPage * 50, totalMovements)} of {totalMovements} movements
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => fetchMovements(Math.max(1, stockPage - 1))}
                  disabled={stockPage === 1}
                >
                  Previous
                </button>
                <button 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => fetchMovements(Math.min(stockTotalPages, stockPage + 1))}
                  disabled={stockPage === stockTotalPages}
                >
                  Next
                </button>
              </div>
            </div>
          )}
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
            <div className="desktop-table-view">
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
            <div className="mobile-card-view">
              {transfersLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner mx-auto" /><p className="mt-sm text-muted">Loading...</p></div>
              ) : transfers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-secondary)' }}>No transfers found.</div>
              ) : transfers.map(t => (
                <div key={t.id} className="m-card">
                  <div className="m-card-top">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="m-card-title">{t.product?.name}</div>
                      <div className="m-card-meta"><code>{t.product?.sku}</code></div>
                      <div className="m-card-sub">{t.from_location?.name} → {t.to_location?.name}</div>
                      <div className="m-card-meta">{formatDate(t.created_at)}</div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <span className={`transfer-status ${t.status.toLowerCase()}`}>{t.status}</span>
                      <div className="m-card-amount" style={{ marginTop: '4px', fontSize: '1rem' }}>{t.quantity} units</div>
                    </div>
                  </div>
                  {t.status === 'PENDING' && hasPermission('manage_inventory') && (
                    <div className="m-card-actions">
                      <button className="btn btn-sm btn-primary" onClick={() => handleTransferAction(t.id, 'complete')}>Receive</button>
                      <button className="btn btn-sm btn-secondary" onClick={() => handleTransferAction(t.id, 'cancel')}>Cancel</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
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
            <div className="desktop-table-view">
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
            <div className="mobile-card-view">
              {auditsLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner mx-auto" /><p className="mt-sm text-muted">Loading...</p></div>
              ) : audits.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-secondary)' }}>No audits yet.</div>
              ) : audits.map(a => (
                <div key={a.id} className="m-card">
                  <div className="m-card-top">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="m-card-title">{a.product?.name}</div>
                      <div className="m-card-sub">{a.location?.name}</div>
                      <div className="m-card-meta">{formatDate(a.created_at)} · {a.auditor?.email?.split('@')[0]}</div>
                    </div>
                    <span className={a.discrepancy > 0 ? 'discrepancy-positive' : a.discrepancy < 0 ? 'discrepancy-negative' : 'discrepancy-zero'} style={{ fontWeight: 700, fontSize: '1.1rem', flexShrink: 0 }}>
                      {a.discrepancy > 0 ? '+' : ''}{a.discrepancy}
                    </span>
                  </div>
                  <div className="m-card-row"><span>Expected</span><span>{a.expected_quantity}</span></div>
                  <div className="m-card-row"><span>Counted</span><span>{a.counted_quantity}</span></div>
                </div>
              ))}
            </div>
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
            <div className="desktop-table-view">
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
            <div className="mobile-card-view">
              {batchesLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner mx-auto" /><p className="mt-sm text-muted">Loading...</p></div>
              ) : batches.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-secondary)' }}>No batches registered.</div>
              ) : batches.map(b => {
                const status = getExpiryStatus(b.expiry_date);
                return (
                  <div key={b.id} className={`m-card${status.rowClass ? ' ' + status.rowClass : ''}`}>
                    <div className="m-card-top">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="m-card-title">{b.product?.name}</div>
                        <div className="m-card-meta"><code>{b.product?.sku}</code> · <code>{b.batch_number}</code></div>
                        <div className="m-card-sub">{b.location?.name}</div>
                      </div>
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <span className={`expiry-badge ${status.class}`}>{status.label}</span>
                        <div className="m-card-amount" style={{ fontSize: '1rem', marginTop: '4px' }}>{b.quantity} units</div>
                      </div>
                    </div>
                    <div className="m-card-row">
                      <span>Expiry</span>
                      <span>{new Date(b.expiry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ ANALYTICS TAB ═══ */}
      {activeTab === 'analytics' && (
        <InventoryAnalytics />
      )}

      {/* ═══ PRICING TAB ═══ */}
      {activeTab === 'pricing' && (
        <PricingTabContent refreshProducts={fetchProducts} />
      )}

      {/* ═══ MODALS ═══ */}

      {/* Extracted Modals */}
      <AdjustStockModal 
        isOpen={isAdjustModalOpen} 
        onClose={() => setIsAdjustModalOpen(false)} 
        onSubmit={handleAdjustSubmit} 
        locations={locations} 
        products={products} 
        adjusting={adjusting} 
      />

      <ThresholdModal 
        isOpen={isThresholdModalOpen} 
        onClose={() => setIsThresholdModalOpen(false)} 
        onSubmit={handleThresholdSubmit} 
        locations={locations} 
        products={products} 
        thresholding={thresholding} 
        error={thresholdError} 
      />

      <TransferModal 
        isOpen={isTransferModalOpen} 
        onClose={() => setIsTransferModalOpen(false)} 
        onSubmit={handleTransferSubmit} 
        locations={locations} 
        products={products} 
        transferring={transferring} 
        error={transferError} 
      />

      <BatchModal 
        isOpen={isBatchModalOpen} 
        onClose={() => setIsBatchModalOpen(false)} 
        onSubmit={handleBatchSubmit} 
        locations={locations} 
        products={products} 
        submitting={batchSubmitting} 
        error={batchError} 
      />

      <ProductModal 
        isOpen={isProductModalOpen} 
        onClose={closeProductModal} 
        onSubmit={handleProductSubmit} 
        onDelete={handleDeleteProduct}
        editingProduct={editingProduct} 
        locations={locations} 
        isSubmitting={isProductSubmitting} 
        error={productFormError} 
      />


      <TrackingModal 
        isOpen={isTrackingModalOpen} 
        onClose={() => {
          setIsTrackingModalOpen(false);
          setSelectedTrackingProduct(null);
        }}
        product={selectedTrackingProduct}
        locations={locations}
        isDoubleMode={business?.qr_tracking_mode === 'double'}
        activeLocationFilter={locationFilter}
      />
      
      <SoldUnitsModal
        isOpen={isSoldUnitsModalOpen}
        onClose={() => {
          setIsSoldUnitsModalOpen(false);
          setSelectedSoldProduct(null);
        }}
        product={selectedSoldProduct}
      />

      {/* GRN Print Modal */}
      <Modal isOpen={showGrnModal} onClose={() => setShowGrnModal(false)} title="Goods Received Note" size="large">
        {grnData && (
          <div style={{ padding: '0.5rem' }}>
            <PurchaseOrderDocument
              business={business}
              items={grnData.items}
              notes={grnData.notes}
              date={grnData.date}
              purchaseOrder={grnData.purchaseOrder || null}
              fmt={fmt}
              documentType="grn"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button className="btn btn-outline" onClick={() => setShowGrnModal(false)}>Close</button>
              <button className="btn btn-primary" onClick={() => printElement('printable-grn', 'a4')} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Print GRN
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
