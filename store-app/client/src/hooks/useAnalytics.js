import { useState, useCallback, useRef } from 'react';
import { api } from '../lib/api';

export function useAnalytics() {
  const [resources, setResources] = useState({});
  const requests = useRef({});
  const fetchResource = useCallback(async (key, path) => {
    const request = (requests.current[key] || 0) + 1;
    requests.current[key] = request;
    setResources(prev => ({ ...prev, [key]: { data:null, updatedAt:null, loading:true, error:null } }));
    try {
      const data = await api.get(path);
      if (requests.current[key] === request) setResources(prev => ({ ...prev, [key]: { data, loading: false, error: null, updatedAt: Date.now() } }));
      return data;
    } catch (err) {
      if (requests.current[key] === request) setResources(prev => ({ ...prev, [key]: { ...prev[key], loading: false, error: err.message || 'Could not load this information.' } }));
      return null;
    }
  }, []);
  const fetchSummary = useCallback(() => fetchResource('summary', '/analytics/summary'), [fetchResource]);
  const fetchRecentActivity = useCallback(() => fetchResource('recentActivity', '/analytics/recent-activity'), [fetchResource]);
  const fetchShrinkageEvents = useCallback(() => fetchResource('shrinkageEvents', '/analytics/shrinkage'), [fetchResource]);
  const fetchReconciliation = useCallback(date => fetchResource('reconciliationData', `/analytics/reconciliation${date ? `?date=${encodeURIComponent(date)}` : ''}`), [fetchResource]);
  const fetchSalesTrend = useCallback(() => fetchResource('salesTrend', '/analytics/sales-trend'), [fetchResource]);
  const fetchTopProducts = useCallback(() => fetchResource('topProducts', '/analytics/top-products'), [fetchResource]);
  const fetchInventoryHealth = useCallback(() => fetchResource('inventoryHealth', '/analytics/inventory-health'), [fetchResource]);
  const fetchStaffPerformance = useCallback(() => fetchResource('staffPerformance', '/analytics/staff-performance'), [fetchResource]);
  const data = key => resources[key]?.error ? null : resources[key]?.data;
  return {
    resources, summary: data('summary') || null,
    recentActivity: data('recentActivity') || [], shrinkageEvents: data('shrinkageEvents') || [],
    reconciliationData: data('reconciliationData') || [], salesTrend: data('salesTrend') || [],
    topProducts: data('topProducts') || [], inventoryHealth: data('inventoryHealth') || [], staffPerformance: data('staffPerformance') || [],
    loading: Object.values(resources).some(row => row.loading),
    error: Object.values(resources).map(row => row.error).filter(Boolean).join(' ') || null,
    fetchSummary, fetchRecentActivity, fetchShrinkageEvents, fetchReconciliation, fetchSalesTrend, fetchTopProducts, fetchInventoryHealth, fetchStaffPerformance,
  };
}
