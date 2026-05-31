import { useState, useCallback } from 'react';
import { api } from '../lib/api';

export function useAnalytics() {
  const [summary, setSummary] = useState(null);
  const [shrinkageEvents, setShrinkageEvents] = useState([]);
  const [reconciliationData, setReconciliationData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/analytics/summary');
      setSummary(data);
      return data;
    } catch (err) {
      const message = err.message || 'Failed to fetch analytics summary';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchShrinkageEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/analytics/shrinkage');
      setShrinkageEvents(data);
      return data;
    } catch (err) {
      const message = err.message || 'Failed to fetch shrinkage events';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReconciliation = useCallback(async (dateString) => {
    setLoading(true);
    setError(null);
    try {
      const url = dateString ? `/analytics/reconciliation?date=${dateString}` : '/analytics/reconciliation';
      const data = await api.get(url);
      setReconciliationData(data);
      return data;
    } catch (err) {
      const message = err.message || 'Failed to fetch reconciliation data';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    summary,
    shrinkageEvents,
    reconciliationData,
    loading,
    error,
    fetchSummary,
    fetchShrinkageEvents,
    fetchReconciliation
  };
}
