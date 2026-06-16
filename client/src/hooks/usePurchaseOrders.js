import { useState, useCallback } from 'react';
import { api } from '../lib/api';

export function usePurchaseOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);

  const fetchOrders = useCallback(async (pageNum = 1, status = '') => {
    setLoading(true);
    setError(null);
    try {
      const params = `?page=${pageNum}&limit=25${status ? `&status=${status}` : ''}`;
      const data = await api.get(`/purchase-orders${params}`);
      setOrders(data.data || []);
      setPage(data.page || 1);
      setTotalPages(data.totalPages || 1);
      setTotalOrders(data.total || 0);
      return data;
    } catch (err) {
      setError(err.message || 'Failed to fetch purchase orders');
      return { data: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOrder = useCallback(async (id) => {
    try {
      return await api.get(`/purchase-orders/${id}`);
    } catch (err) {
      setError(err.message || 'Failed to fetch purchase order');
      return null;
    }
  }, []);

  const createOrder = useCallback(async (orderData) => {
    try {
      const result = await api.post('/purchase-orders', orderData);
      await fetchOrders();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to create purchase order' };
    }
  }, [fetchOrders]);

  const updateOrder = useCallback(async (id, orderData) => {
    try {
      const result = await api.put(`/purchase-orders/${id}`, orderData);
      await fetchOrders();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to update purchase order' };
    }
  }, [fetchOrders]);

  const sendOrder = useCallback(async (id) => {
    try {
      const result = await api.put(`/purchase-orders/${id}/send`);
      await fetchOrders();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to send purchase order' };
    }
  }, [fetchOrders]);

  const cancelOrder = useCallback(async (id) => {
    try {
      const result = await api.put(`/purchase-orders/${id}/cancel`);
      await fetchOrders();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to cancel purchase order' };
    }
  }, [fetchOrders]);

  const receiveGoods = useCallback(async (id, receiveData) => {
    try {
      const result = await api.post(`/purchase-orders/${id}/receive`, receiveData);
      await fetchOrders();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to receive goods' };
    }
  }, [fetchOrders]);

  return {
    orders,
    loading,
    error,
    setError,
    page,
    totalPages,
    totalOrders,
    fetchOrders,
    fetchOrder,
    createOrder,
    updateOrder,
    sendOrder,
    cancelOrder,
    receiveGoods
  };
}
