import { useState, useMemo } from 'react';
import { useAuthContext } from '../lib/AuthContext';
import { useProducts } from '../hooks/useProducts';
import Modal from '../components/Modal';

export default function Products() {
  const { hasPermission, role } = useAuthContext();
  const { products, loading, error, addProduct, updateProduct, deleteProduct } = useProducts();
  
  const [searchTerm, setSearchTerm] = useState('');
  
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
    stock_quantity: '',
    low_stock_threshold: '5'
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
      stock_quantity: '0',
      low_stock_threshold: '5'
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
      stock_quantity: product.stock_quantity,
      low_stock_threshold: product.low_stock_threshold
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
      stock_quantity: parseInt(formData.stock_quantity, 10) || 0,
      low_stock_threshold: parseInt(formData.low_stock_threshold, 10) || 5
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
    if (window.confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) {
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

      <div className="content-card">
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

        {/* Data Table */}
        <div className="table-container">
          {loading ? (
            <div className="table-loading">
              <div className="spinner"></div>
              <p>Loading inventory...</p>
            </div>
          ) : (
            <table className="data-table">
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
                    const isLowStock = product.stock_quantity <= product.low_stock_threshold;
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
                              {product.stock_quantity}
                            </span>
                            <span className="stock-threshold text-muted text-sm">/ {product.low_stock_threshold}</span>
                          </div>
                        </td>
                        {hasPermission('manage_products') && (
                          <td className="text-right">
                            <div className="action-buttons">
                              <button 
                                className="btn-icon" 
                                onClick={() => openEditModal(product)}
                                aria-label="Edit product"
                                title="Edit"
                              >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                              <button 
                                className="btn-icon text-error hover-bg-error" 
                                onClick={() => handleDelete(product.id, product.name)}
                                aria-label="Delete product"
                                title="Delete"
                              >
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

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="stock_quantity">Current Stock</label>
              <input 
                type="number" 
                id="stock_quantity" 
                className="form-input" 
                value={formData.stock_quantity}
                onChange={(e) => setFormData({...formData, stock_quantity: e.target.value})}
                min="0"
                step="1"
              />
            </div>
            <div className="form-group">
              <label htmlFor="low_stock_threshold">Low Stock Alert At</label>
              <input 
                type="number" 
                id="low_stock_threshold" 
                className="form-input" 
                value={formData.low_stock_threshold}
                onChange={(e) => setFormData({...formData, low_stock_threshold: e.target.value})}
                min="0"
                step="1"
              />
            </div>
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
