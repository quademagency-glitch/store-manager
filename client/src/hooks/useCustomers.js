import { useState, useCallback } from 'react';
import { api } from '../lib/api';

export function useCustomers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/customers');
      setCustomers(data);
      return data;
    } catch (err) {
      setError(err.message);
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
      console.error('Search failed:', err);
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
    setError
  };
}
