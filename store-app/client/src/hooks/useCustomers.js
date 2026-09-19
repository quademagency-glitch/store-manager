import { useState, useCallback } from 'react';
import { api, scopedApi } from '../lib/api';
import { useOfflineScope } from './useOfflineScope';
import { saveCustomersToIDB, getCustomersFromIDB } from '../lib/idb';
import { reportError } from '../lib/errorReporting';

export function useCustomers() {
  const scope = useOfflineScope();
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
      const data = await (scope ? scopedApi(scope) : api).get(`/customers?page=${pageNum}&limit=50`);
      setCustomers(data.data || []);
      setPage(data.page || 1);
      setTotalPages(data.totalPages || 1);
      setTotalCustomers(data.total || 0);
      // See useProducts, offline-cache write failure, reported not surfaced.
      if (scope) saveCustomersToIDB(data.data || [], scope).catch(err => reportError(err, { context: 'idb:save-customers' }));
      return data;
    } catch (err) {
      if (err.status || err.scopeChanged) { setError(err.message); return []; }
      if (import.meta.env.DEV) console.warn('Network fetch failed, trying offline cache...', err);
      try {
        const cached = await getCustomersFromIDB(scope);
        if (cached && cached.length > 0) {
          setCustomers(cached);
          return cached;
        } else {
          setError('Offline and no cached customers available.');
        }
      } catch {
        setError('Offline and failed to load cache.');
      }
      return [];
    } finally {
      setLoading(false);
    }
  }, [scope]);

  const fetchCustomer = useCallback(async (id) => {
    try {
      return await api.get(`/customers/${id}`);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Fetch customer failed:', err);
      return null;
    }
  }, []);

  const searchCustomers = useCallback(async (query) => {
    if (!query) return [];
    try {
      const data = await (scope ? scopedApi(scope) : api).get(`/customers/search?q=${encodeURIComponent(query)}`);
      if (scope) saveCustomersToIDB(data, scope).catch(err => reportError(err, { context: 'idb:search-customers' }));
      return data;
    } catch (err) {
      if (err.status || err.scopeChanged || !scope) return [];
      const cached = await getCustomersFromIDB(scope).catch(() => []);
      const term = query.toLowerCase();
      return cached.filter(c => [c.name, c.phone, c.customer_code].some(v => String(v || '').toLowerCase().includes(term)));
    }
  }, [scope]);

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
    fetchCustomer,
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
