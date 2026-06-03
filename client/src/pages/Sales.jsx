import { useState, useMemo } from 'react';
import { useAuthContext } from '../lib/AuthContext';
import { useProducts } from '../hooks/useProducts';
import { useSales } from '../hooks/useSales';
import Modal from '../components/Modal';
import SalesHistory from '../components/SalesHistory';

export default function Sales() {
  const { user } = useAuthContext();
  const { products, loading: productsLoading } = useProducts();
  const {
    cart,
    cartTotal,
    cartItemCount,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    createSale,
    loading: saleLoading,
    error: saleError,
    setError,
  } = useSales();

  const [searchTerm, setSearchTerm] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [receiptData, setReceiptData] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [saleSuccess, setSaleSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState('pos');

  // Filter products by search
  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products;
    const lower = searchTerm.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(lower) ||
      p.sku.toLowerCase().includes(lower) ||
      p.category.toLowerCase().includes(lower)
    );
  }, [products, searchTerm]);

  // Check if product is in cart
  const getCartItem = (productId) => cart.find(item => item.product_id === productId);

  // Complete the sale
  const handleCompleteSale = async () => {
    if (cart.length === 0) return;
    setError(null);

    const result = await createSale(paymentMethod);
    if (result.success) {
      setReceiptData(result.data);
      setShowReceipt(true);
      setSaleSuccess(true);
      // Reset success animation after delay
      setTimeout(() => setSaleSuccess(false), 2000);
    }
  };

  // Close receipt and reset
  const closeReceipt = () => {
    setShowReceipt(false);
    setReceiptData(null);
  };

  // Format currency
  const fmt = (amount) => `$${Number(amount).toFixed(2)}`;

  // Format timestamp
  const formatTime = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const paymentMethods = [
    { value: 'cash', label: 'Cash', icon: '💵' },
    { value: 'card', label: 'Card', icon: '💳' },
    { value: 'mobile', label: 'Mobile', icon: '📱' },
  ];

  return (
    <>
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="dashboard-title">Point of Sale</h1>
          <p className="dashboard-subtitle">Process transactions and manage cart.</p>
        </div>
        <div className="filter-group" style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            className={`btn ${activeTab === 'pos' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('pos')}
          >
            New Sale
          </button>
          <button 
            className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('history')}
          >
            Sales History
          </button>
        </div>
      </header>

      {activeTab === 'pos' ? (
        <div className="pos-container">
          {/* ─── Left Panel: Product Catalog ─── */}
        <div className="pos-products-area">
          <div className="toolbar" style={{ borderRadius: 'var(--radius-md)', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Catalog ({filteredProducts.length})</h2>
            <div className="search-bar">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="search-icon">
                <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M18 18L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              {searchTerm && (
                <button 
                  className="btn-icon" 
                  style={{ width: '24px', height: '24px' }}
                  onClick={() => setSearchTerm('')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {productsLoading ? (
            <div className="empty-state">
              <div className="loading-spinner" style={{ margin: '0 auto 1rem auto' }}></div>
              <p>Loading catalog...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <h2>No products found</h2>
              <p className="text-muted">Try adjusting your search criteria</p>
            </div>
          ) : (
            <div className="product-grid">
              {filteredProducts.map(product => {
                const inCart = getCartItem(product.id);
                const userLocationId = user?.user_metadata?.location_id;
                const localStock = userLocationId 
                  ? (product.product_inventory?.find(inv => inv.location_id === userLocationId)?.quantity || 0)
                  : (product.product_inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0);

                const lowStockThreshold = product.product_inventory?.[0]?.low_stock_threshold || 5;
                const outOfStock = localStock <= 0;
                const maxedOut = inCart && inCart.quantity >= localStock;

                return (
                  <div
                    key={product.id}
                    className="product-card"
                    style={{ 
                      opacity: outOfStock ? 0.6 : 1,
                      borderColor: inCart ? 'var(--color-primary)' : 'var(--color-border)',
                      position: 'relative'
                    }}
                    onClick={() => {
                      if (!outOfStock && !inCart) addToCart({ ...product, stock_quantity: localStock });
                    }}
                  >
                    {inCart && (
                      <div style={{
                        position: 'absolute', top: '-8px', right: '-8px', 
                        background: 'var(--color-primary)', color: '#fff',
                        width: '24px', height: '24px', borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.75rem', fontWeight: 'bold', boxShadow: 'var(--shadow-sm)'
                      }}>
                        {inCart.quantity}
                      </div>
                    )}
                    
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem', fontWeight: 600 }}>{product.name}</h3>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                      SKU: {product.sku}
                    </div>
                    
                    <p style={{ color: 'var(--color-primary)', fontWeight: 700, fontSize: '1.25rem', marginBottom: '0.5rem' }}>
                      {fmt(product.price)}
                    </p>
                    
                    <div style={{ marginBottom: '1rem' }}>
                      {outOfStock ? (
                        <span className="badge badge-error">Out of Stock</span>
                      ) : localStock <= lowStockThreshold ? (
                        <span className="badge badge-warning">{localStock} Left</span>
                      ) : (
                        <span className="badge badge-success">{localStock} in stock</span>
                      )}
                    </div>

                    {inCart ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} onClick={e => e.stopPropagation()}>
                        <button className="btn-icon" style={{ border: '1px solid var(--color-border)' }} onClick={() => updateQuantity(product.id, inCart.quantity - 1)}>
                          -
                        </button>
                        <span style={{ fontWeight: 600, width: '20px' }}>{inCart.quantity}</span>
                        <button className="btn-icon" style={{ border: '1px solid var(--color-border)' }} disabled={maxedOut} onClick={() => updateQuantity(product.id, inCart.quantity + 1)}>
                          +
                        </button>
                      </div>
                    ) : (
                      <button className="btn btn-secondary" style={{ width: '100%' }} disabled={outOfStock}>
                        Add to Cart
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── Right Panel: Cart & Checkout ─── */}
        <div className="pos-cart-area">
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(24, 24, 27, 0.4)' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--color-primary)' }}>
                <circle cx="9" cy="20" r="1.5" stroke="currentColor" strokeWidth="2" />
                <circle cx="18" cy="20" r="1.5" stroke="currentColor" strokeWidth="2" />
                <path d="M2 2H4.5L7 14H19L21.5 6H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Current Sale
            </h2>
            {cart.length > 0 && (
              <button className="btn-icon text-error" onClick={clearCart} title="Clear Cart">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
            {cart.length === 0 ? (
              <div className="empty-state" style={{ border: 'none', background: 'transparent', padding: '2rem 1rem' }}>
                <div className="empty-state-icon" style={{ color: 'var(--color-border-hover)' }}>🛒</div>
                <p className="text-muted">Cart is empty.<br/>Add products to begin.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {cart.map(item => (
                  <div key={item.product_id} style={{ display: 'flex', flexDirection: 'column', padding: '1rem', background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontWeight: 600 }}>{item.name}</span>
                      <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{fmt(item.price * item.quantity)}</span>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{item.sku}</span>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button className="btn-icon" style={{ width: '24px', height: '24px', border: '1px solid var(--color-border)' }} onClick={() => updateQuantity(item.product_id, item.quantity - 1)}>-</button>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, width: '16px', textAlign: 'center' }}>{item.quantity}</span>
                        <button className="btn-icon" style={{ width: '24px', height: '24px', border: '1px solid var(--color-border)' }} onClick={() => updateQuantity(item.product_id, item.quantity + 1)} disabled={item.quantity >= item.stock_quantity}>+</button>
                        
                        <button className="btn-icon text-error" style={{ width: '28px', height: '28px', marginLeft: '0.5rem' }} onClick={() => removeFromCart(item.product_id)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {cart.length > 0 && (
            <div style={{ padding: '1.5rem', background: 'rgba(24, 24, 27, 0.4)', borderTop: '1px solid var(--color-border)' }}>
              {saleError && (
                <div className="alert-error mb-xl">
                  {saleError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                <span>Subtotal ({cartItemCount} items)</span>
                <span>{fmt(cartTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: 700 }}>
                <span>Total</span>
                <span style={{ color: 'var(--color-primary)' }}>{fmt(cartTotal)}</span>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                  Payment Method
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                  {paymentMethods.map(method => (
                    <button
                      key={method.value}
                      onClick={() => setPaymentMethod(method.value)}
                      style={{
                        padding: '0.75rem 0',
                        background: paymentMethod === method.value ? 'rgba(99, 102, 241, 0.1)' : 'var(--color-bg-base)',
                        border: `1px solid ${paymentMethod === method.value ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        borderRadius: 'var(--radius-md)',
                        color: paymentMethod === method.value ? 'var(--color-primary)' : 'var(--color-text-primary)',
                        cursor: 'pointer',
                        fontWeight: 500,
                        transition: 'all var(--transition-fast)'
                      }}
                    >
                      <div style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{method.icon}</div>
                      <div style={{ fontSize: '0.8rem' }}>{method.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                className="btn btn-primary"
                style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', fontWeight: 600 }}
                onClick={handleCompleteSale}
                disabled={saleLoading || cart.length === 0}
              >
                {saleLoading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div className="loading-spinner" style={{ width: '20px', height: '20px', borderWidth: '2px' }}></div>
                    Processing...
                  </span>
                ) : saleSuccess ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M5 13L9 17L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Payment Complete!
                  </span>
                ) : (
                  `Checkout — ${fmt(cartTotal)}`
                )}
              </button>
            </div>
          )}
        </div>
      </div>
      ) : (
        <SalesHistory />
      )}

      {/* ─── Receipt Modal ─── */}
      <Modal
        isOpen={showReceipt}
        onClose={closeReceipt}
        title="Transaction Receipt"
      >
        {receiptData && (
          <div className="modal-body" style={{ textAlign: 'center' }}>
            <div style={{ 
              width: '64px', height: '64px', borderRadius: '50%', 
              background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-success)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.5rem auto'
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M5 13L9 17L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            
            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Payment Successful</h3>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem' }}>
              {formatTime(receiptData.created_at)}
            </p>

            <div style={{ background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', textAlign: 'left', marginBottom: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px dashed var(--color-border)' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Receipt #</span>
                <span style={{ fontFamily: 'monospace' }}>{receiptData.id?.slice(0, 8)?.toUpperCase()}</span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Method</span>
                <span className="badge badge-neutral">
                  {paymentMethods.find(m => m.value === receiptData.payment_method)?.icon}{' '}
                  {receiptData.payment_method?.toUpperCase()}
                </span>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>
                  <span>Item</span>
                  <span style={{ textAlign: 'center' }}>Qty</span>
                  <span style={{ textAlign: 'right' }}>Total</span>
                </div>
                {receiptData.sale_items?.map(item => (
                  <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.product?.name || 'Product'}</span>
                    <span style={{ textAlign: 'center' }}>{item.quantity}</span>
                    <span style={{ textAlign: 'right', fontWeight: 500 }}>{fmt(item.unit_price * item.quantity)}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '1rem', borderTop: '1px dashed var(--color-border)', fontSize: '1.25rem', fontWeight: 700 }}>
                <span>Total</span>
                <span style={{ color: 'var(--color-primary)' }}>{fmt(receiptData.total_amount)}</span>
              </div>
            </div>

            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" style={{ minWidth: '200px' }} onClick={closeReceipt}>
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
