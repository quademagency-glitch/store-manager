import { useState, useCallback } from 'react';
import { api } from '../lib/api';

export function useInventoryAnalytics() {
  const [summary, setSummary] = useState(null);
  const [valuation, setValuation] = useState(null);
  const [turnover, setTurnover] = useState(null);
  const [deadStock, setDeadStock] = useState(null);
  const [reorderSuggestions, setReorderSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await api.get('/inventory-analytics/summary');
      setSummary(data);
      return data;
    } catch (err) {
      setError(err.message || 'Failed to fetch summary');
      return null;
    }
  }, []);

  const fetchValuation = useCallback(async () => {
    try {
      const data = await api.get('/inventory-analytics/valuation');
      setValuation(data);
      return data;
    } catch (err) {
      setError(err.message || 'Failed to fetch valuation');
      return null;
    }
  }, []);

  const fetchTurnover = useCallback(async (days = 30) => {
    try {
      const data = await api.get(`/inventory-analytics/turnover?days=${days}`);
      setTurnover(data);
      return data;
    } catch (err) {
      setError(err.message || 'Failed to fetch turnover');
      return null;
    }
  }, []);

  const fetchDeadStock = useCallback(async (days = 60) => {
    try {
      const data = await api.get(`/inventory-analytics/dead-stock?days=${days}`);
      setDeadStock(data);
      return data;
    } catch (err) {
      setError(err.message || 'Failed to fetch dead stock');
      return null;
    }
  }, []);

  const fetchReorderSuggestions = useCallback(async () => {
    try {
      const data = await api.get('/inventory-analytics/reorder-suggestions');
      setReorderSuggestions(data);
      return data;
    } catch (err) {
      setError(err.message || 'Failed to fetch reorder suggestions');
      return null;
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        fetchSummary(),
        fetchValuation(),
        fetchTurnover(),
        fetchDeadStock(),
        fetchReorderSuggestions()
      ]);
    } catch (err) {
      setError(err.message || 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  }, [fetchSummary, fetchValuation, fetchTurnover, fetchDeadStock, fetchReorderSuggestions]);

  return {
    summary,
    valuation,
    turnover,
    deadStock,
    reorderSuggestions,
    loading,
    error,
    fetchAll,
    fetchSummary,
    fetchValuation,
    fetchTurnover,
    fetchDeadStock,
    fetchReorderSuggestions
  };
}
