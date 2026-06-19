import { useState, useCallback } from 'react';
import { api } from '../lib/api';

export function useLoyalty() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [rules, setRules] = useState(null);
  const [pointsBalance, setPointsBalance] = useState(0);
  const [pointsLedger, setPointsLedger] = useState({ data: [], total: 0, page: 1, totalPages: 1 });
  const [giftCards, setGiftCards] = useState({ data: [], total: 0, page: 1, totalPages: 1 });
  const [storeCreditBalance, setStoreCreditBalance] = useState(0);

  // ─── Rules ───

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/loyalty/rules');
      setRules(data);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const saveRules = useCallback(async (ruleData) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post('/loyalty/rules', ruleData);
      setRules(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Points ───

  const fetchBalance = useCallback(async (customerId) => {
    try {
      const data = await api.get(`/loyalty/balance/${customerId}`);
      setPointsBalance(data.points);
      return data.points;
    } catch (err) {
      setError(err.message);
      return 0;
    }
  }, []);

  const fetchLedger = useCallback(async (customerId, params = {}) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (params.page) qs.set('page', params.page);
      const data = await api.get(`/loyalty/ledger/${customerId}?${qs.toString()}`);
      setPointsLedger(data);
      return data;
    } catch (err) {
      setError(err.message);
      return { data: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  const redeemPoints = useCallback(async (customerId, points, saleId, note) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post('/loyalty/redeem', {
        customer_id: customerId,
        points,
        sale_id: saleId || undefined,
        note,
      });
      setPointsBalance(data.new_balance);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Gift Cards ───

  const fetchGiftCards = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (params.page) qs.set('page', params.page);
      const data = await api.get(`/loyalty/gift-cards?${qs.toString()}`);
      setGiftCards(data);
      return data;
    } catch (err) {
      setError(err.message);
      return { data: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  const issueGiftCard = useCallback(async (amount, customerId, expiresAt) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post('/loyalty/gift-cards', {
        amount,
        customer_id: customerId || undefined,
        expires_at: expiresAt || undefined,
      });
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const lookupGiftCard = useCallback(async (code) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(`/loyalty/gift-cards/lookup/${code}`);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const redeemGiftCard = useCallback(async (code, amount) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post('/loyalty/gift-cards/redeem', { code, amount });
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Store Credit ───

  const fetchStoreCredit = useCallback(async (customerId) => {
    try {
      const data = await api.get(`/loyalty/store-credit/${customerId}`);
      setStoreCreditBalance(data.balance);
      return data.balance;
    } catch (err) {
      setError(err.message);
      return 0;
    }
  }, []);

  const issueStoreCredit = useCallback(async (customerId, amount, type, saleId, note) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post('/loyalty/store-credit', {
        customer_id: customerId,
        amount,
        type,
        sale_id: saleId || undefined,
        note,
      });
      setStoreCreditBalance(data.new_balance);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    rules,
    pointsBalance,
    pointsLedger,
    giftCards,
    storeCreditBalance,
    fetchRules,
    saveRules,
    fetchBalance,
    fetchLedger,
    redeemPoints,
    fetchGiftCards,
    issueGiftCard,
    lookupGiftCard,
    redeemGiftCard,
    fetchStoreCredit,
    issueStoreCredit,
  };
}
