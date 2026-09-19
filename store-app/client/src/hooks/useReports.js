import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../lib/api';

export function useReports() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pnl, setPnl] = useState(null);
  const [arAging, setArAging] = useState(null);

  const requestId = useRef(0);
  useEffect(() => () => { requestId.current += 1; }, []);

  const fetchPnl = useCallback(async (startDate, endDate, locationId) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    setPnl(null);
    setArAging(null);
    try {
      if (!startDate || !endDate || startDate > endDate) throw new Error('Select a valid start and end date.');
      const qs = new URLSearchParams({ startDate, endDate });
      if (locationId) qs.set('locationId', locationId);
      const data = await api.get(`/reports/pnl?${qs.toString()}`);
      if (id === requestId.current) setPnl(data);
      return data;
    } catch (err) {
      if (id === requestId.current) setError(err.message);
      return null;
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  const fetchArAging = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    setPnl(null);
    setArAging(null);
    try {
      const data = await api.get('/reports/ar-aging');
      if (id === requestId.current) setArAging(data);
      return data;
    } catch (err) {
      if (id === requestId.current) setError(err.message);
      return null;
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  return { loading, error, pnl, arAging, fetchPnl, fetchArAging };
}
