import { useState, useCallback } from 'react';
import { api } from '../lib/api';

export function useAnalytics() {
  const [summary, setSummary] = useState(null);
  const [shrinkageEvents, setShrinkageEvents] = useState([]);
  const [reconciliationData, setReconciliationData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [recentActivity, setRecentActivity] = useState([]);

  // Chart data states
  const [salesTrend, setSalesTrend] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [inventoryHealth, setInventoryHealth] = useState([]);
  const [staffPerformance, setStaffPerformance] = useState([]);
  
  const fetchRecentActivity = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/analytics/recent-activity');
      setRecentActivity(data);
      return data;
    } catch (err) {
      const message = err.message || 'Failed to fetch recent activity';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

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

  // ─── Chart Data Fetchers ───

  const fetchSalesTrend = useCallback(async () => {
    try {
      const data = await api.get('/analytics/sales-trend');
      setSalesTrend(data);
      return data;
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, []);

  const fetchTopProducts = useCallback(async () => {
    try {
      const data = await api.get('/analytics/top-products');
      setTopProducts(data);
      return data;
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, []);

  const fetchInventoryHealth = useCallback(async () => {
    try {
      const data = await api.get('/analytics/inventory-health');
      setInventoryHealth(data);
      return data;
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, []);

  const fetchStaffPerformance = useCallback(async () => {
    try {
      const data = await api.get('/analytics/staff-performance');
      setStaffPerformance(data);
      return data;
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, []);

  return {
    summary,
    shrinkageEvents,
    reconciliationData,
    recentActivity,
    loading,
    error,
    fetchSummary,
    fetchShrinkageEvents,
    fetchReconciliation,
    fetchRecentActivity,
    // Charts
    salesTrend,
    topProducts,
    inventoryHealth,
    staffPerformance,
    fetchSalesTrend,
    fetchTopProducts,
    fetchInventoryHealth,
    fetchStaffPerformance,
  };
}

