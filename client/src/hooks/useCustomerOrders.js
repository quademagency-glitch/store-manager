import { useState, useCallback } from 'react';
import { api } from '../lib/api';

export function useCustomerOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchOrders = useCallback(async (pageNum = 1, filters = {}) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: pageNum, limit: 25 });
      if (filters.status)      params.set('status', filters.status);
      if (filters.customer_id) params.set('customer_id', filters.customer_id);

      const data = await api.get(`/customer-orders?${params}`);
      setOrders(data.data || []);
      setPage(data.page || 1);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
      return data;
    } catch (err) {
      setError(err.message);
      return { data: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  const getOrder = useCallback(async (id) => {
    try {
      return await api.get(`/customer-orders/${id}`);
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  const createOrder = async (payload) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post('/customer-orders', payload);
      setOrders(prev => [data.order, ...prev]);
      return { success: true, order: data.order };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const updateOrder = async (id, payload) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.put(`/customer-orders/${id}`, payload);
      setOrders(prev => prev.map(o => o.id === id ? data.order : o));
      return { success: true, order: data.order };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id, status) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.put(`/customer-orders/${id}/status`, { status });
      setOrders(prev => prev.map(o => o.id === id ? { ...o, ...data.order } : o));
      return { success: true, order: data.order };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const deleteOrder = async (id) => {
    setLoading(true);
    setError(null);
    try {
      await api.delete(`/customer-orders/${id}`);
      setOrders(prev => prev.filter(o => o.id !== id));
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  return {
    orders,
    loading,
    error,
    page,
    totalPages,
    total,
    fetchOrders,
    getOrder,
    createOrder,
    updateOrder,
    updateStatus,
    deleteOrder,
    setError,
  };
}
