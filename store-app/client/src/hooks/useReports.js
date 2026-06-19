import { useState, useCallback } from 'react';
import { api } from '../lib/api';

export function useReports() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pnl, setPnl] = useState(null);
  const [arAging, setArAging] = useState(null);

  const fetchPnl = useCallback(async (startDate, endDate, locationId) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ startDate, endDate });
      if (locationId) qs.set('locationId', locationId);
      const data = await api.get(`/reports/pnl?${qs.toString()}`);
      setPnl(data);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchArAging = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/reports/ar-aging');
      setArAging(data);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, pnl, arAging, fetchPnl, fetchArAging };
}
