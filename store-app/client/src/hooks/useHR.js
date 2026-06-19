import { useState, useCallback } from 'react';
import { api } from '../lib/api';

export function useHR() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Attendance
  const [attendanceStatus, setAttendanceStatus] = useState(null);
  const [myAttendance, setMyAttendance] = useState({ data: [], total: 0, page: 1, totalPages: 1 });
  const [attendanceLogs, setAttendanceLogs] = useState({ data: [], total: 0, page: 1, totalPages: 1 });

  // Schedules
  const [schedules, setSchedules] = useState([]);

  // Commissions
  const [commissionRules, setCommissionRules] = useState([]);
  const [commissions, setCommissions] = useState({ data: [], summary: {}, total: 0, page: 1, totalPages: 1 });

  // ─── Attendance ───

  const fetchAttendanceStatus = useCallback(async () => {
    try {
      const data = await api.get('/hr/attendance/status');
      setAttendanceStatus(data);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  const clockIn = useCallback(async (note, latitude, longitude) => {
    setLoading(true);
    setError(null);
    try {
      const body = { note: note || undefined };
      if (latitude != null) body.latitude = latitude;
      if (longitude != null) body.longitude = longitude;
      const data = await api.post('/hr/clock-in', body);
      setAttendanceStatus({ clocked_in: true, active_log: data.log });
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clockOut = useCallback(async (note, latitude, longitude) => {
    setLoading(true);
    setError(null);
    try {
      const body = { note: note || undefined };
      if (latitude != null) body.latitude = latitude;
      if (longitude != null) body.longitude = longitude;
      const data = await api.post('/hr/clock-out', body);
      setAttendanceStatus({ clocked_in: false, active_log: null });
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMyAttendance = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (params.page) qs.set('page', params.page);
      if (params.startDate) qs.set('startDate', params.startDate);
      if (params.endDate) qs.set('endDate', params.endDate);
      const data = await api.get(`/hr/attendance/me?${qs.toString()}`);
      setMyAttendance(data);
      return data;
    } catch (err) {
      setError(err.message);
      return { data: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAttendanceLogs = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (params.page) qs.set('page', params.page);
      if (params.startDate) qs.set('startDate', params.startDate);
      if (params.endDate) qs.set('endDate', params.endDate);
      if (params.userId) qs.set('userId', params.userId);
      if (params.locationId) qs.set('locationId', params.locationId);
      const data = await api.get(`/hr/attendance?${qs.toString()}`);
      setAttendanceLogs(data);
      return data;
    } catch (err) {
      setError(err.message);
      return { data: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Schedules ───

  const fetchSchedules = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (params.startDate) qs.set('startDate', params.startDate);
      if (params.endDate) qs.set('endDate', params.endDate);
      if (params.locationId) qs.set('locationId', params.locationId);
      const data = await api.get(`/hr/schedules?${qs.toString()}`);
      setSchedules(data);
      return data;
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const createShift = useCallback(async (shiftData) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post('/hr/schedules', shiftData);
      setSchedules(prev => [data, ...prev]);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateShift = useCallback(async (id, updates) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.patch(`/hr/schedules/${id}`, updates);
      setSchedules(prev => prev.map(s => s.id === id ? data : s));
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteShift = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      await api.delete(`/hr/schedules/${id}`);
      setSchedules(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Commission Rules ───

  const fetchCommissionRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/hr/commission-rules');
      setCommissionRules(data);
      return data;
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const createCommissionRule = useCallback(async (ruleData) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post('/hr/commission-rules', ruleData);
      setCommissionRules(prev => [data, ...prev]);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateCommissionRule = useCallback(async (id, updates) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.patch(`/hr/commission-rules/${id}`, updates);
      setCommissionRules(prev => prev.map(r => r.id === id ? data : r));
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteCommissionRule = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      await api.delete(`/hr/commission-rules/${id}`);
      setCommissionRules(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Commissions Ledger ───

  const fetchCommissions = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (params.page) qs.set('page', params.page);
      if (params.userId) qs.set('userId', params.userId);
      if (params.startDate) qs.set('startDate', params.startDate);
      if (params.endDate) qs.set('endDate', params.endDate);
      if (params.unpaidOnly) qs.set('unpaidOnly', 'true');
      const data = await api.get(`/hr/commissions?${qs.toString()}`);
      setCommissions(data);
      return data;
    } catch (err) {
      setError(err.message);
      return { data: [], summary: {} };
    } finally {
      setLoading(false);
    }
  }, []);

  const payoutCommissions = useCallback(async (userId, commissionIds) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post('/hr/commissions/payout', {
        user_id: userId,
        commission_ids: commissionIds,
      });
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Payroll Export ───

  const exportPayroll = useCallback(async (startDate, endDate) => {
    try {
      const response = await api.getRaw(`/hr/payroll-export?startDate=${startDate}&endDate=${endDate}&format=csv`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll_${startDate}_${endDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  return {
    loading,
    error,
    // Attendance
    attendanceStatus,
    myAttendance,
    attendanceLogs,
    fetchAttendanceStatus,
    clockIn,
    clockOut,
    fetchMyAttendance,
    fetchAttendanceLogs,
    // Schedules
    schedules,
    fetchSchedules,
    createShift,
    updateShift,
    deleteShift,
    // Commission Rules
    commissionRules,
    fetchCommissionRules,
    createCommissionRule,
    updateCommissionRule,
    deleteCommissionRule,
    // Commission Ledger
    commissions,
    fetchCommissions,
    payoutCommissions,
    // Payroll
    exportPayroll,
  };
}
