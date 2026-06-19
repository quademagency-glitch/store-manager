import { useState, useCallback } from 'react';
import { api } from '../lib/api';

/**
 * Shared data hook for the Accounts Receivable / Accounts Payable ledgers.
 * @param {'ar'|'ap'} kind
 */
export function useBillingLedger(kind) {
  const basePath = kind === 'ar' ? '/ar' : '/ap';
  const docKey = kind === 'ar' ? 'invoices' : 'bills';

  const [documents, setDocuments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [aging, setAging] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchDocuments = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))
      ).toString();
      const res = await api.get(`${basePath}/${docKey}${query ? `?${query}` : ''}`);
      setDocuments(res.data || []);
      setTotal(res.total || 0);
      setPage(res.page || 1);
      setTotalPages(res.totalPages || 1);
      return res;
    } catch (err) {
      setError(err.message || `Failed to fetch ${docKey}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [basePath, docKey]);

  const fetchDocument = useCallback(async (id) => {
    try {
      return await api.get(`${basePath}/${docKey}/${id}`);
    } catch (err) {
      setError(err.message || 'Failed to fetch document');
      return null;
    }
  }, [basePath, docKey]);

  const createDocument = useCallback(async (payload) => {
    try {
      const result = await api.post(`${basePath}/${docKey}`, payload);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to create' };
    }
  }, [basePath, docKey]);

  const recordPayment = useCallback(async (documentId, payload) => {
    try {
      const result = await api.post(`${basePath}/${docKey}/${documentId}/payments`, payload);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to record payment' };
    }
  }, [basePath, docKey]);

  const voidPayment = useCallback(async (paymentId) => {
    try {
      const result = await api.put(`${basePath}/payments/${paymentId}/void`);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to void payment' };
    }
  }, [basePath]);

  const voidDocument = useCallback(async (documentId) => {
    try {
      const result = await api.put(`${basePath}/${docKey}/${documentId}/void`);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to void' };
    }
  }, [basePath, docKey]);

  const fetchAging = useCallback(async () => {
    try {
      const res = await api.get(`${basePath}/aging`);
      setAging(res);
      return res;
    } catch (err) {
      setError(err.message || 'Failed to fetch aging report');
      return null;
    }
  }, [basePath]);

  return {
    documents, total, page, totalPages, aging, loading, error, setError,
    fetchDocuments, fetchDocument, createDocument, recordPayment, voidPayment, voidDocument, fetchAging,
  };
}
