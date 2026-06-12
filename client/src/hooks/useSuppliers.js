import { useState, useCallback } from 'react';
import { api } from '../lib/api';

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSuppliers = useCallback(async (showArchived = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(`/suppliers${showArchived ? '?archived=true' : ''}`);
      setSuppliers(data || []);
      return data;
    } catch (err) {
      setError(err.message || 'Failed to fetch suppliers');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSupplier = useCallback(async (id) => {
    try {
      return await api.get(`/suppliers/${id}`);
    } catch (err) {
      setError(err.message || 'Failed to fetch supplier');
      return null;
    }
  }, []);

  const addSupplier = useCallback(async (supplierData) => {
    try {
      const result = await api.post('/suppliers', supplierData);
      await fetchSuppliers();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to create supplier' };
    }
  }, [fetchSuppliers]);

  const updateSupplier = useCallback(async (id, supplierData) => {
    try {
      const result = await api.put(`/suppliers/${id}`, supplierData);
      await fetchSuppliers();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to update supplier' };
    }
  }, [fetchSuppliers]);

  const archiveSupplier = useCallback(async (id) => {
    try {
      const result = await api.put(`/suppliers/${id}/archive`);
      await fetchSuppliers();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to archive supplier' };
    }
  }, [fetchSuppliers]);

  return {
    suppliers,
    loading,
    error,
    setError,
    fetchSuppliers,
    fetchSupplier,
    addSupplier,
    updateSupplier,
    archiveSupplier
  };
}
