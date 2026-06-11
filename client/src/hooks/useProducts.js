import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { saveProductsToIDB, getProductsFromIDB } from '../lib/idb';

export function useProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/products');
      setProducts(data);
      saveProductsToIDB(data).catch(console.error); // Cache for offline
    } catch (err) {
      if (import.meta.env.DEV) console.warn('Network fetch failed, trying offline cache...', err);
      try {
        const cached = await getProductsFromIDB();
        if (cached && cached.length > 0) {
          setProducts(cached);
          // Don't show error if we have cached data
        } else {
          setError('Offline and no cached products available.');
        }
      } catch (idbErr) {
        setError('Offline and failed to load cache.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const addProduct = async (productData) => {
    try {
      const newProduct = await api.post('/products', productData);
      setProducts(prev => [...prev, newProduct].sort((a, b) => a.name.localeCompare(b.name)));
      return { success: true, data: newProduct };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const updateProduct = async (id, productData) => {
    try {
      const updatedProduct = await api.put(`/products/${id}`, productData);
      setProducts(prev => prev.map(p => p.id === id ? updatedProduct : p));
      return { success: true, data: updatedProduct };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const deleteProduct = async (id) => {
    try {
      await api.delete(`/products/${id}`);
      setProducts(prev => prev.filter(p => p.id !== id));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  return {
    products,
    loading,
    error,
    refreshProducts: fetchProducts,
    addProduct,
    updateProduct,
    deleteProduct
  };
}
