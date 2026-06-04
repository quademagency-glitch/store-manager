import { useState, useCallback } from 'react';
import { api } from '../lib/api';

export function useSales() {
  const [cart, setCart] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ── Cart Management ─────────────────────────────────

  const addToCart = useCallback((product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product_id === product.id);
      if (existing) {
        // Increment quantity (respect stock limit)
        if (existing.quantity >= product.stock_quantity) return prev;
        return prev.map(item =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      // Add new item
      return [...prev, {
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        price: Number(product.price),
        stock_quantity: product.stock_quantity,
        quantity: 1,
      }];
    });
  }, []);

  const removeFromCart = useCallback((productId) => {
    setCart(prev => prev.filter(item => item.product_id !== productId));
  }, []);

  const updateQuantity = useCallback((productId, newQuantity) => {
    if (newQuantity < 1) {
      setCart(prev => prev.filter(item => item.product_id !== productId));
      return;
    }
    setCart(prev =>
      prev.map(item =>
        item.product_id === productId
          ? { ...item, quantity: Math.min(newQuantity, item.stock_quantity) }
          : item
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  // ── Derived Values ──────────────────────────────────

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // ── API Calls ───────────────────────────────────────

  const createSale = useCallback(async (paymentMethod, customerId = null) => {
    setError(null);
    setLoading(true);
    try {
      const payload = {
        items: cart.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.price,
        })),
        payment_method: paymentMethod,
        total_amount: cartTotal,
        subtotal: cartTotal,
        tax: 0,
        discount: 0,
        customer_id: customerId,
      };

      const response = await api.post('/sales', payload);
      const saleData = response.sale || response;

      // Build complete receipt from cart data + sale metadata
      // (the backend only returns the sales row, not joined sale_items)
      const receiptData = {
        ...saleData,
        payment_method: saleData.payment_method || paymentMethod,
        total_amount: saleData.total_amount || cartTotal,
        sale_items: cart.map(item => ({
          id: item.product_id,
          quantity: item.quantity,
          unit_price: item.price,
          product: { name: item.name, sku: item.sku },
        })),
      };

      setCart([]);
      return { success: true, data: receiptData };
    } catch (err) {
      const message = err.message || 'Failed to complete sale';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, [cart, cartTotal]);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/sales');
      setSales(data);
      return data;
    } catch (err) {
      setError(err.message || 'Failed to fetch sales');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const voidSale = useCallback(async (saleId) => {
    setLoading(true);
    setError(null);
    try {
      await api.put(`/sales/${saleId}/void`);
      setSales(prev => prev.map(s => s.id === saleId ? { ...s, status: 'voided' } : s));
      return { success: true };
    } catch (err) {
      const message = err.message || 'Failed to void sale';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteSale = useCallback(async (saleId) => {
    setLoading(true);
    setError(null);
    try {
      await api.delete(`/sales/${saleId}`);
      setSales(prev => prev.filter(s => s.id !== saleId));
      return { success: true };
    } catch (err) {
      const message = err.message || 'Failed to delete sale';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    // Cart
    cart,
    cartTotal,
    cartItemCount,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,

    // Sales data
    sales,
    fetchSales,
    voidSale,
    deleteSale,

    // API
    createSale,
    loading,
    error,
    setError,
  };
}
