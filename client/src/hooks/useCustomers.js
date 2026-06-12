import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import { saveCustomersToIDB, getCustomersFromIDB } from '../lib/idb';

export function useCustomers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCustomers, setTotalCustomers] = useState(0);

  const fetchCustomers = useCallback(async (pageNum = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(`/customers?page=${pageNum}&limit=50`);
      setCustomers(data.data || []);
      setPage(data.page || 1);
      setTotalPages(data.totalPages || 1);
      setTotalCustomers(data.total || 0);
      saveCustomersToIDB(data.data || []).catch(console.error);
      return data;
    } catch (err) {
      if (import.meta.env.DEV) console.warn('Network fetch failed, trying offline cache...', err);
      try {
        const cached = await getCustomersFromIDB();
        if (cached && cached.length > 0) {
          setCustomers(cached);
          return cached;
        } else {
          setError('Offline and no cached customers available.');
        }
      } catch (_idbErr) {
        setError('Offline and failed to load cache.');
      }
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const searchCustomers = useCallback(async (query) => {
    if (!query) return [];
    try {
      const data = await api.get(`/customers/search?q=${encodeURIComponent(query)}`);
      return data;
    } catch (err) {
      if (import.meta.env.DEV) console.error('Search failed:', err);
      return [];
    }
  }, []);

  const createCustomer = async (customerData) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post('/customers', customerData);
      
      setCustomers(prev => [...prev, data.customer].sort((a, b) => a.name.localeCompare(b.name)));
      return { success: true, customer: data.customer };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const updateCustomer = async (id, updates) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.put(`/customers/${id}`, updates);

      setCustomers(prev => prev.map(c => c.id === id ? data.customer : c));
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const deleteCustomer = async (id) => {
    setLoading(true);
    setError(null);
    try {
      await api.delete(`/customers/${id}`);

      setCustomers(prev => prev.filter(c => c.id !== id));
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const sendVerificationCode = async (id) => {
    setLoading(true);
    setError(null);
    try {
      await api.post(`/customers/${id}/send-verification`);
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const verifyCustomerCode = async (id, code) => {
    setLoading(true);
    setError(null);
    try {
      await api.post(`/customers/${id}/verify`, { code });
      setCustomers(prev => prev.map(c => c.id === id ? { ...c, is_verified: true } : c));
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  return {
    customers,
    loading,
    error,
    fetchCustomers,
    searchCustomers,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    sendVerificationCode,
    verifyCustomerCode,
    setError,
    page,
    totalPages,
    totalCustomers
  };
}
