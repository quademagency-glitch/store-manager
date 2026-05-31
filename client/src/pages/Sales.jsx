import { useState, useMemo } from 'react';
import { useProducts } from '../hooks/useProducts';
import { useSales } from '../hooks/useSales';
import Modal from '../components/Modal';

export default function Sales() {
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
    <div className="sales-page">
      {/* ─── Left Panel: Product Catalog ─── */}
      <section className="sales-catalog" id="sales-catalog">
        <div className="catalog-header">
          <h1 className="catalog-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M4 8L12 4L20 8V16L12 20L4 16V8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <path d="M12 12V20" stroke="currentColor" strokeWidth="2" />
              <path d="M4 8L12 12L20 8" stroke="currentColor" strokeWidth="2" />
            </svg>
            Products
          </h1>
          <span className="catalog-count">{filteredProducts.length} items</span>
        </div>

        <div className="catalog-search">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="catalog-search-icon">
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M18 18L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="catalog-search-input"
            id="sales-product-search"
          />
          {searchTerm && (
            <button className="catalog-search-clear" onClick={() => setSearchTerm('')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        <div className="catalog-grid">
          {productsLoading ? (
            <div className="catalog-loading">
              <div className="spinner"></div>
              <p>Loading products...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="catalog-empty">
              <span className="catalog-empty-icon">🔍</span>
              <p>No products found</p>
            </div>
          ) : (
            filteredProducts.map(product => {
              const inCart = getCartItem(product.id);
              const outOfStock = product.stock_quantity <= 0;
              const maxedOut = inCart && inCart.quantity >= product.stock_quantity;

              return (
                <div
                  key={product.id}
                  className={`product-card ${outOfStock ? 'product-card-disabled' : ''} ${inCart ? 'product-card-selected' : ''}`}
                  id={`product-${product.id}`}
                >
                  <div className="product-card-top">
                    <div className="product-card-avatar">
                      {product.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="product-card-meta">
                      <span className="product-card-name">{product.name}</span>
                      <span className="product-card-sku">{product.sku}</span>
                    </div>
                  </div>

                  <div className="product-card-middle">
                    <span className="product-card-price">{fmt(product.price)}</span>
                    <span className={`product-card-stock ${outOfStock ? 'out-of-stock' : product.stock_quantity <= product.low_stock_threshold ? 'low-stock' : ''}`}>
                      {outOfStock ? 'Out of stock' : `${product.stock_quantity} in stock`}
                    </span>
                  </div>

                  <div className="product-card-bottom">
                    {inCart ? (
                      <div className="product-card-qty-control">
                        <button
                          className="qty-btn"
                          onClick={() => updateQuantity(product.id, inCart.quantity - 1)}
                          aria-label="Decrease quantity"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M5 12H19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                          </svg>
                        </button>
                        <span className="qty-value">{inCart.quantity}</span>
                        <button
                          className="qty-btn"
                          onClick={() => updateQuantity(product.id, inCart.quantity + 1)}
                          disabled={maxedOut}
                          aria-label="Increase quantity"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M12 5V19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                            <path d="M5 12H19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <button
                        className="add-to-cart-btn"
                        onClick={() => addToCart(product)}
                        disabled={outOfStock}
                        id={`add-${product.id}`}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M12 5V19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          <path d="M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                        Add
                      </button>
                    )}
                  </div>

                  {inCart && <div className="product-card-selected-indicator" />}
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ─── Right Panel: Cart & Checkout ─── */}
      <aside className="sales-cart" id="sales-cart">
        <div className="cart-header">
          <h2 className="cart-title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="9" cy="20" r="1.5" stroke="currentColor" strokeWidth="2" />
              <circle cx="18" cy="20" r="1.5" stroke="currentColor" strokeWidth="2" />
              <path d="M2 2H4.5L7 14H19L21.5 6H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Cart
          </h2>
          {cart.length > 0 && (
            <button className="cart-clear-btn" onClick={clearCart}>
              Clear all
            </button>
          )}
        </div>

        {/* Cart Items */}
        <div className="cart-items">
          {cart.length === 0 ? (
            <div className="cart-empty">
              <div className="cart-empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <circle cx="9" cy="20" r="1.5" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="18" cy="20" r="1.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M2 2H4.5L7 14H19L21.5 6H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="cart-empty-text">Your cart is empty</p>
              <p className="cart-empty-hint">Search and add products to start a sale</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.product_id} className="cart-item">
                <div className="cart-item-info">
                  <span className="cart-item-name">{item.name}</span>
                  <span className="cart-item-sku">{item.sku}</span>
                </div>
                <div className="cart-item-controls">
                  <div className="cart-item-qty">
                    <button
                      className="qty-btn qty-btn-sm"
                      onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M5 12H19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                      </svg>
                    </button>
                    <span className="qty-value-sm">{item.quantity}</span>
                    <button
                      className="qty-btn qty-btn-sm"
                      onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                      disabled={item.quantity >= item.stock_quantity}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M12 5V19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        <path d="M5 12H19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  <span className="cart-item-price">{fmt(item.price * item.quantity)}</span>
                  <button
                    className="cart-item-remove"
                    onClick={() => removeFromCart(item.product_id)}
                    aria-label={`Remove ${item.name}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Checkout Section */}
        {cart.length > 0 && (
          <div className="cart-checkout">
            {/* Error Message */}
            {saleError && (
              <div className="alert alert-error cart-error">
                <p>{saleError}</p>
              </div>
            )}

            {/* Subtotal */}
            <div className="cart-summary">
              <div className="cart-summary-row">
                <span className="cart-summary-label">Items</span>
                <span className="cart-summary-value">{cartItemCount}</span>
              </div>
              <div className="cart-summary-row cart-summary-total">
                <span className="cart-summary-label">Total</span>
                <span className="cart-summary-value">{fmt(cartTotal)}</span>
              </div>
            </div>

            {/* Payment Method */}
            <div className="payment-selector">
              <span className="payment-label">Payment Method</span>
              <div className="payment-options">
                {paymentMethods.map(method => (
                  <button
                    key={method.value}
                    className={`payment-option ${paymentMethod === method.value ? 'payment-option-active' : ''}`}
                    onClick={() => setPaymentMethod(method.value)}
                    id={`payment-${method.value}`}
                  >
                    <span className="payment-option-icon">{method.icon}</span>
                    <span className="payment-option-label">{method.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Complete Button */}
            <button
              className={`complete-sale-btn ${saleSuccess ? 'complete-sale-success' : ''}`}
              onClick={handleCompleteSale}
              disabled={saleLoading || cart.length === 0}
              id="complete-sale-btn"
            >
              {saleLoading ? (
                <span className="complete-sale-loading">
                  <span className="login-button-spinner"></span>
                  Processing...
                </span>
              ) : saleSuccess ? (
                <span className="complete-sale-done">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13L9 17L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Sale Complete!
                </span>
              ) : (
                <>
                  Complete Sale — {fmt(cartTotal)}
                </>
              )}
            </button>
          </div>
        )}
      </aside>

      {/* ─── Receipt Modal ─── */}
      <Modal
        isOpen={showReceipt}
        onClose={closeReceipt}
        title="Sale Receipt"
      >
        {receiptData && (
          <div className="receipt">
            <div className="receipt-header">
              <div className="receipt-check">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path d="M8 12L11 15L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="receipt-title">Sale Completed</h3>
              <p className="receipt-time">{formatTime(receiptData.created_at)}</p>
            </div>

            <div className="receipt-details">
              <div className="receipt-row receipt-id">
                <span>Sale ID</span>
                <code>{receiptData.id?.slice(0, 8)}...</code>
              </div>
              <div className="receipt-row">
                <span>Payment</span>
                <span className="receipt-payment-badge">
                  {paymentMethods.find(m => m.value === receiptData.payment_method)?.icon}{' '}
                  {receiptData.payment_method.charAt(0).toUpperCase() + receiptData.payment_method.slice(1)}
                </span>
              </div>
            </div>

            <div className="receipt-items">
              <div className="receipt-items-header">
                <span>Item</span>
                <span>Qty</span>
                <span>Price</span>
                <span>Total</span>
              </div>
              {receiptData.sale_items?.map(item => (
                <div key={item.id} className="receipt-item-row">
                  <span className="receipt-item-name">{item.product?.name || 'Product'}</span>
                  <span>{item.quantity}</span>
                  <span>{fmt(item.unit_price)}</span>
                  <span className="receipt-item-total">{fmt(item.unit_price * item.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="receipt-total">
              <span>Total</span>
              <span className="receipt-total-amount">{fmt(receiptData.total_amount)}</span>
            </div>

            <button className="btn btn-primary receipt-close-btn" onClick={closeReceipt}>
              Done
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
