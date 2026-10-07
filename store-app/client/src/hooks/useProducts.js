import { useState, useEffect, useCallback, useRef } from 'react';
import { api, scopedApi } from '../lib/api';
import { useOfflineScope } from './useOfflineScope';
import { saveProductsToIDB, getProductsFromIDB, getProductCacheInfo } from '../lib/idb';
import { reportError } from '../lib/errorReporting';

export function useProducts() {
  const scope = useOfflineScope();
  const requests = useRef(0);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cacheInfo, setCacheInfo] = useState(null);

  const fetchProducts = useCallback(async () => {
    const request = ++requests.current;
    setLoading(true);
    setCacheInfo(null);
    setProducts([]);
    setError(null);
    try {
      const data = await (scope ? scopedApi(scope) : api).get('/products');
      if (request !== requests.current) return [];
      setProducts(data);
      setCacheInfo({ offline: false, savedAt: Date.now() });
      // Cache for offline. A failed IDB write degrades offline mode only,
      // report it, don't surface it.
      if (scope) saveProductsToIDB(data, scope).catch(err => reportError(err, { context: 'idb:save-products' }));
    } catch (err) {
      if (request !== requests.current) return [];
      if (err.status || err.scopeChanged) { setError(err.message); return []; }
      if (import.meta.env.DEV) console.warn('Network fetch failed, trying offline cache...', err);
      try {
        const cached = await getProductsFromIDB(scope);
        const savedAt = await getProductCacheInfo(scope);
        if (request !== requests.current) return [];
        if (cached && cached.length > 0) {
          setProducts(cached);
          setCacheInfo({ offline: true, savedAt });
          // Don't show error if we have cached data
        } else {
          setError('Offline and no cached products available.');
        }
      } catch {
        if (request === requests.current) setError('Offline and failed to load cache.');
      }
    } finally {
      if (request === requests.current) setLoading(false);
    }
  }, [scope]);

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
    cacheInfo,
    loading,
    error,
    refreshProducts: fetchProducts,
    addProduct,
    updateProduct,
    deleteProduct
  };
}
