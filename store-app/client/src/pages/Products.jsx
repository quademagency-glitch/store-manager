import { useState, useMemo, useEffect } from 'react';
import { useAuthContext } from '../lib/AuthContext';
import { useProducts } from '../hooks/useProducts';
import Modal from '../components/Modal';
import { api } from '../lib/api';
import { useConfirm } from '../hooks/useConfirm';
import { usePrintDocument } from '../hooks/usePrintDocument';
import { useCurrency } from '../hooks/useCurrency';
import { EmptyStateRow, PageHeader, SkeletonTable } from '../components/ui';
import { reportError } from '../lib/errorReporting';

export default function Products() {
  const { hasPermission } = useAuthContext();
  const confirm = useConfirm();
  const { business } = usePrintDocument();
  const { fmt, currencySymbol } = useCurrency(business);
  const { products, loading, error, addProduct, updateProduct, deleteProduct } = useProducts();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [locations, setLocations] = useState([]);
  const [locationFilter, setLocationFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');

  useEffect(() => {
    api.get('/locations')
      .then(res => setLocations(res))
      .catch(err => {
        setLocations([]);
        reportError(err, { context: 'products:locations' });
      });
  }, []);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: '',
    price: '',
    initialQuantity: '',
    locationId: '',
    qr_code_data: '',
    product_code: '',
    requires_serial: true
  });

  // Filter products based on search term and stock filter
  const filteredProducts = useMemo(() => {
    let result = products;

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(lower) || 
        p.sku.toLowerCase().includes(lower) ||
        p.category.toLowerCase().includes(lower) ||
        (p.product_code && p.product_code.toLowerCase().includes(lower))
      );
    }

    if (stockFilter !== 'all') {
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
  }, [products, searchTerm, stockFilter, locationFilter]);

  // Handlers for modal
  const openAddModal = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      sku: '',
      category: 'General',
      price: '',
      initialQuantity: '',
      locationId: locations.length > 0 ? locations[0].id : '',
      qr_code_data: '',
      product_code: '',
      requires_serial: true
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      sku: product.sku,
      category: product.category,
      price: product.price,
      initialQuantity: '',
      locationId: '',
      qr_code_data: product.qr_code_data || '',
      product_code: product.product_code || '',
      requires_serial: product.requires_serial !== false
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const closeAndResetModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setFormError('');
  };

  // Form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setIsSubmitting(true);

    const payload = {
      name: formData.name,
      sku: formData.sku,
      category: formData.category,
      price: parseFloat(formData.price) || 0,
      initialQuantity: formData.initialQuantity,
      locationId: formData.locationId,
      qr_code_data: formData.qr_code_data || formData.sku,
      product_code: formData.product_code || null,
      requires_serial: formData.requires_serial
    };

    let result;
    if (editingProduct) {
      result = await updateProduct(editingProduct.id, payload);
    } else {
      result = await addProduct(payload);
    }

    if (result.success) {
      closeAndResetModal();
    } else {
      setFormError(result.error || 'An error occurred while saving.');
    }
    
    setIsSubmitting(false);
  };

  // Delete handler
  const handleDelete = async (id, name) => {
    const confirmed = await confirm({ title: 'Delete Product', message: `Are you sure you want to delete ${name}? This action cannot be undone.`, variant: 'danger', confirmText: 'Delete' });
    if (confirmed) {
      await deleteProduct(id);
      setIsModalOpen(false);
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        title="Products"
        subtitle="Manage products, pricing, and stock levels."
        actions={hasPermission('manage_products') && (
          <button className="btn btn-primary fab-mobile" onClick={openAddModal}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="fab-icon">
              <path d="M10 4V16M4 10H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="fab-text">Add Product</span>
          </button>
        )}
      />

      <div className="glass-panel mt-md">
        {/* Toolbar */}
        <div className="toolbar">
          <div className="search-bar">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="search-icon">
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M18 18L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input 
              type="text" 
              placeholder="Search by name, SKU..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="filter-group flex gap-sm flex-wrap">
            <select 
              className="form-input" 
              value={locationFilter} 
              onChange={(e) => setLocationFilter(e.target.value)}
              style={{ minWidth: '150px' }}
            >
              <option value="all">All Locations</option>
              {locations.map(loc => (
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
          <div className="toolbar-stats">
            <span className="badge badge-neutral">{filteredProducts.length} items</span>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="alert alert-error">
            <p>{error}</p>
          </div>
        )}

        {/* Desktop table */}
        <div className="table-container desktop-table-view">
          {loading ? (
            <SkeletonTable rows={6} cols={5} caption="Loading inventory" />
          ) : (
            <table className="glass-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Stock</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <EmptyStateRow colSpan={5} icon="clipboard" title="No products found matching your search" />
                ) : (
                  filteredProducts.map(product => {
                    const displayStock = locationFilter === 'all'
                      ? (product.product_inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0)
                      : (product.product_inventory?.find(inv => inv.location_id === locationFilter)?.quantity || 0);
                    const threshold = locationFilter === 'all'
                      ? (product.product_inventory?.[0]?.low_stock_threshold ?? 5)
                      : (product.product_inventory?.find(inv => inv.location_id === locationFilter)?.low_stock_threshold ?? 5);
                    const isLowStock = displayStock <= threshold;
                    const isOutOfStock = displayStock === 0;
                    return (
                      <tr
                        key={product.id}
                        className={isLowStock ? 'row-warning' : ''}
                        style={{ cursor: hasPermission('manage_products') ? 'pointer' : 'default' }}
                        onClick={() => hasPermission('manage_products') && openEditModal(product)}
                      >
                        <td><code className="text-mono">{product.sku}</code></td>
                        <td>
                          <div className="product-cell">
                            <div className="product-avatar">
                              {product.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="product-info">
                              <span className="product-name">{product.name}</span>
                              {product.product_code && (
                                <span className="text-muted text-sm block">{product.product_code}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="badge badge-neutral font-medium">
                            {product.category || '-'}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                            {fmt(product.price)}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-sm">
                            <span className={`stock-count ${isOutOfStock ? 'text-error font-bold' : isLowStock ? 'text-warning font-bold' : ''}`}>
                              {displayStock}
                            </span>
                            {isOutOfStock ? (
                              <span className="badge badge-error badge-sm">Out</span>
                            ) : isLowStock ? (
                              <span className="badge badge-warning badge-sm">Low</span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Mobile cards */}
        <div className="mobile-card-view">
          {loading ? (
            <div className="text-center p-xl">
              <div className="spinner mx-auto" />
              <p className="mt-sm text-muted">Loading inventory...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center p-xl text-secondary">
              No products found matching your search.
            </div>
          ) : filteredProducts.map(product => {
            const displayStock = locationFilter === 'all'
              ? (product.product_inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0)
              : (product.product_inventory?.find(inv => inv.location_id === locationFilter)?.quantity || 0);
            const threshold = locationFilter === 'all'
              ? (product.product_inventory?.[0]?.low_stock_threshold ?? 5)
              : (product.product_inventory?.find(inv => inv.location_id === locationFilter)?.low_stock_threshold ?? 5);
            const isLowStock = displayStock <= threshold;
            const isOutOfStock = displayStock === 0;
            const stockBorderColor = isOutOfStock ? 'var(--color-error)' : isLowStock ? 'var(--color-warning)' : undefined;
            return (
              <div
                key={product.id}
                className="m-card"
                style={{ ...(stockBorderColor ? { borderLeft: `3px solid ${stockBorderColor}` } : {}), cursor: hasPermission('manage_products') ? 'pointer' : 'default' }}
                onClick={() => hasPermission('manage_products') && openEditModal(product)}
              >
                <div className="m-card-top">
                  <div className="product-avatar" style={{ flexShrink: 0 }}>{product.name.charAt(0).toUpperCase()}</div>
                  <div className="flex-1">
                    <div className="m-card-title">
                      {product.name}
                      {isOutOfStock ? (
                        <span className="badge badge-error badge-sm" style={{ marginLeft: '6px' }}>Out of Stock</span>
                      ) : isLowStock ? (
                        <span className="badge badge-warning badge-sm" style={{ marginLeft: '6px' }}>Low Stock</span>
                      ) : null}
                    </div>
                    <div className="m-card-sub">
                      <code>{product.sku}</code>
                      {product.category && <span style={{ marginLeft: '8px', color: 'var(--color-text-secondary)' }}>{product.category}</span>}
                    </div>
                  </div>
                </div>
                <div className="m-card-row flex justify-between">
                  <span style={{ color: isOutOfStock ? 'var(--color-error)' : isLowStock ? 'var(--color-warning)' : 'var(--color-text-secondary)', fontWeight: isLowStock ? 700 : undefined }}>
                    Stock: {displayStock}
                  </span>
                  <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(product.price)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add / Edit Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={closeAndResetModal} 
        title={editingProduct ? "Edit Product" : "Add New Product"}
      >
        <form onSubmit={handleSubmit} className="form-layout">
          {formError && (
            <div className="alert alert-error">
              <p>{formError}</p>
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="name">Product Name *</label>
            <input 
              type="text" 
              id="name" 
              className="form-input" 
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required
              placeholder="e.g. Wireless Headphones"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="sku">SKU *</label>
              <input 
                type="text" 
                id="sku" 
                className="form-input text-mono" 
                value={formData.sku}
                onChange={(e) => setFormData({...formData, sku: e.target.value})}
                required
                placeholder="WH-001"
              />
            </div>
            <div className="form-group">
              <label htmlFor="category">Category</label>
              <input 
                type="text" 
                id="category" 
                className="form-input" 
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                placeholder="Electronics"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="product_code">Manufacturer Serial/Model Number (Optional)</label>
            <input 
              type="text" 
              id="product_code" 
              className="form-input" 
              value={formData.product_code}
              onChange={(e) => setFormData({...formData, product_code: e.target.value})}
              placeholder="e.g. SN-123456789"
            />
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.requires_serial}
                onChange={(e) => setFormData({ ...formData, requires_serial: e.target.checked })}
                style={{ marginTop: '3px', flexShrink: 0 }}
              />
              <span>
                <span className="font-medium">Require serial number scan at sale</span>
                <small className="text-muted" style={{ display: 'block', marginTop: '2px' }}>
                  Applies in Double QR tracking mode. When on, a serial number must be scanned for
                  each unit at intake and checkout. Turn off for item types that have no serial.
                </small>
              </span>
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="price">Price ({currencySymbol}) *</label>
            <div className="input-prefix-wrapper">
              <span className="input-prefix">{currencySymbol}</span>
              <input 
                type="number" 
                id="price" 
                className="form-input with-prefix" 
                value={formData.price}
                onChange={(e) => setFormData({...formData, price: e.target.value})}
                required
                min="0"
                step="0.01"
                placeholder="99.99"
              />
            </div>
          </div>

          {!editingProduct && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="initialQuantity">Initial Quantity</label>
                <input 
                  type="number" 
                  id="initialQuantity" 
                  className="form-input" 
                  value={formData.initialQuantity}
                  onChange={(e) => setFormData({...formData, initialQuantity: e.target.value})}
                  min="0"
                  placeholder="e.g. 100"
                />
              </div>
              <div className="form-group">
                <label htmlFor="locationId">Location</label>
                <select 
                  id="locationId" 
                  className="form-input" 
                  value={formData.locationId}
                  onChange={(e) => setFormData({...formData, locationId: e.target.value})}
                >
                  <option value="">Select location...</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="qr_code_data">QR Code Data</label>
            <input 
              type="text" 
              id="qr_code_data" 
              className="form-input text-mono" 
              value={formData.qr_code_data}
              onChange={(e) => setFormData({...formData, qr_code_data: e.target.value})}
              placeholder={formData.sku || 'Auto-generated from SKU'}
            />
            <small className="text-muted" style={{ display: 'block', marginTop: '4px' }}>
              Leave blank to auto-use the SKU. This value is encoded in the printed QR label.
            </small>
          </div>

          <div className="modal-footer" style={{ display: 'flex', justifyContent: editingProduct ? 'space-between' : 'flex-end', width: '100%' }}>
            {editingProduct && (
              <button 
                type="button" 
                className="btn btn-outline text-error" 
                onClick={() => handleDelete(editingProduct.id, editingProduct.name)}
                disabled={isSubmitting}
              >
                Delete Product
              </button>
            )}
            <div className="flex gap-sm">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={closeAndResetModal}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Save Product'}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
