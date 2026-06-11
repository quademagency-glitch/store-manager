import { useState, useCallback } from 'react';
import { api } from '../lib/api';

export function useStock() {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalMovements, setTotalMovements] = useState(0);

  const fetchMovements = useCallback(async (pageNum = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(`/stock?page=${pageNum}&limit=50`);
      setMovements(data.data || []);
      setPage(data.page || 1);
      setTotalPages(data.totalPages || 1);
      setTotalMovements(data.total || 0);
      return data;
    } catch (err) {
      const message = err.message || 'Failed to fetch stock movements';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const adjustStock = useCallback(async (productId, quantityChange, type, locationId, notes = '', shrinkageReason = null) => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        product_id: productId,
        quantity_change: Number(quantityChange),
        movement_type: type,
        location_id: locationId,
        notes
      };

      if (type === 'SHRINKAGE' && shrinkageReason) {
        payload.shrinkage_reason = shrinkageReason;
      }

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
    adjustStock,
    page,
    totalPages,
    totalMovements
  };
}
