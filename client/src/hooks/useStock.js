import { useState, useCallback } from 'react';
import { api } from '../lib/api';

export function useStock() {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchMovements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/stock');
      setMovements(data);
      return data;
    } catch (err) {
      const message = err.message || 'Failed to fetch stock movements';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const adjustStock = useCallback(async (productId, quantityChange, type, notes = '') => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        product_id: productId,
        quantity_change: Number(quantityChange),
        movement_type: type,
        notes
      };

      const result = await api.post('/stock/adjust', payload);
      // Refresh movements after adjustment
      await fetchMovements();
      return { success: true, data: result };
    } catch (err) {
      const message = err.message || 'Failed to adjust stock';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, [fetchMovements]);

  return {
    movements,
    loading,
    error,
    setError,
    fetchMovements,
    adjustStock
  };
}
