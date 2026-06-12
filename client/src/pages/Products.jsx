import { useState, useMemo, useEffect } from 'react';
import { useAuthContext } from '../lib/AuthContext';
import { useProducts } from '../hooks/useProducts';
import Modal from '../components/Modal';
import { api } from '../lib/api';
import { useConfirm } from '../hooks/useConfirm';

export default function Products() {
  const { hasPermission } = useAuthContext();
  const confirm = useConfirm();
  const { products, loading, error, addProduct, updateProduct, deleteProduct } = useProducts();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    api.get('/locations').then(res => setLocations(res)).catch(() => setLocations([]));
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
    qr_code_data: ''
  });

  // Filter products based on search term
  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products;
    const lower = searchTerm.toLowerCase();
    return products.filter(p => 
      p.name.toLowerCase().includes(lower) || 
      p.sku.toLowerCase().includes(lower) ||
      p.category.toLowerCase().includes(lower)
    );
  }, [products, searchTerm]);

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
      qr_code_data: ''
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
      qr_code_data: product.qr_code_data || ''
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
      qr_code_data: formData.qr_code_data || formData.sku
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
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="page-subtitle">Manage products, pricing, and stock levels.</p>
        </div>
        {hasPermission('manage_products') && (
          <button className="btn btn-primary" onClick={openAddModal}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 4V16M4 10H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Add Product
          </button>
        )}
      </header>

      <div className="glass-panel" style={{ marginTop: '1rem' }}>
        {/* Toolbar */}
        <div className="toolbar">
          <div className="search-bar">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="search-icon">
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M18 18L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input 
              type="text" 
              placeholder="Search by name, SKU, or category..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
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
            <div className="table-loading">
              <div className="spinner"></div>
              <p>Loading inventory...</p>
            </div>
          ) : (
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Product Details</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Stock</th>
                  {hasPermission('manage_products') && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={hasPermission('manage_products') ? 6 : 5} className="text-center py-xl text-muted">
                      No products found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map(product => {
                    const totalStock = product.product_inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0;
                    const isLowStock = totalStock <= 5;
                    return (
                      <tr key={product.id} className={isLowStock ? 'row-warning' : ''}>
                        <td>
                          <div className="product-cell">
                            <div className="product-avatar">
                              {product.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="product-info">
                              <span className="product-name">{product.name}</span>
                              {isLowStock && (
                                <span className="badge badge-warning badge-sm mt-xs">Low Stock</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td><code className="text-mono">{product.sku}</code></td>
                        <td>
                          <span className="badge badge-neutral">{product.category}</span>
                        </td>
                        <td className="font-medium">${Number(product.price).toFixed(2)}</td>
                        <td>
                          <div className="stock-cell">
                            <span className={`stock-count ${isLowStock ? 'text-warning font-bold' : ''}`}>
                              {totalStock}
                            </span>
                            <span className="stock-threshold text-muted text-sm">/ across locs</span>
                          </div>
                        </td>
                          {hasPermission('manage_products') && (
                          <td className="text-right">
                            <div className="action-buttons">
                              <button className="btn-icon" onClick={() => openEditModal(product)} title="Edit">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                              <button className="btn-icon text-error hover-bg-error" onClick={() => handleDelete(product.id, product.name)} title="Delete">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                  <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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

        {/* Mobile cards */}
        <div className="mobile-card-view">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div className="spinner mx-auto" />
              <p className="mt-sm text-muted">Loading inventory...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>
              No products found matching your search.
            </div>
          ) : filteredProducts.map(product => {
            const totalStock = product.product_inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0;
            const isLowStock = totalStock <= 5;
            return (
              <div key={product.id} className="m-card" style={isLowStock ? { borderLeft: '3px solid var(--color-warning)' } : {}}>
                <div className="m-card-top">
                  <div className="product-avatar" style={{ flexShrink: 0 }}>{product.name.charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div className="m-card-title">
                      {product.name}
                      {isLowStock && <span className="badge badge-warning badge-sm" style={{ marginLeft: '6px' }}>Low Stock</span>}
                    </div>
                    <div className="m-card-sub"><code>{product.sku}</code></div>
                  </div>
                  <span className="badge badge-neutral" style={{ flexShrink: 0 }}>{product.category}</span>
                </div>
                <div className="m-card-row">
                  <span>Price: <strong>${Number(product.price).toFixed(2)}</strong></span>
                  <span style={{ color: isLowStock ? 'var(--color-warning)' : undefined, fontWeight: isLowStock ? 700 : undefined }}>
                    Stock: {totalStock}
                  </span>
                </div>
                {hasPermission('manage_products') && (
                  <div className="m-card-actions">
                    <button className="btn btn-sm btn-outline" onClick={() => openEditModal(product)}>Edit</button>
                    <button className="btn btn-sm btn-outline text-error" onClick={() => handleDelete(product.id, product.name)}>Delete</button>
                  </div>
                )}
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
            <label htmlFor="price">Price ($) *</label>
            <div className="input-prefix-wrapper">
              <span className="input-prefix">$</span>
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

          <div className="modal-footer">
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
        </form>
      </Modal>
    </div>
  );
}
