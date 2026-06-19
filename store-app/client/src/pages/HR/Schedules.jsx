import { useState, useEffect, useMemo } from 'react';
import { useHR } from '../../hooks/useHR';
import { useAuthContext } from '../../lib/AuthContext';
import { useToast } from '../../hooks/useToast';
import { api } from '../../lib/api';
import '../../styles/hr.css';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getWeekDates(offset = 0) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - start.getDay() + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

export default function Schedules() {
  const { hasPermission } = useAuthContext();
  const toast = useToast();
  const { loading, schedules, fetchSchedules, createShift, deleteShift } = useHR();

  const [weekOffset, setWeekOffset] = useState(0);
  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [newShift, setNewShift] = useState({
    user_id: '', location_id: '', date: '', start_time: '08:00', end_time: '17:00', role_label: '',
  });

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const weekStart = toDateStr(weekDates[0]);
  const weekEnd = toDateStr(weekDates[6]);

  useEffect(() => {
    fetchSchedules({ startDate: weekStart, endDate: weekEnd, locationId: selectedLocation || undefined });
  }, [fetchSchedules, weekStart, weekEnd, selectedLocation]);

  useEffect(() => {
    api.get('/users').then(res => {
      if (Array.isArray(res)) setUsers(res);
      else if (res?.data) setUsers(res.data);
    }).catch(() => {});
    api.get('/locations').then(res => {
      if (Array.isArray(res)) {
        setLocations(res);
        if (res.length > 0 && !selectedLocation) setSelectedLocation(res[0].id);
      }
    }).catch(() => {});
  }, []);

  const handleAddShift = async () => {
    try {
      await createShift({ ...newShift, location_id: newShift.location_id || selectedLocation });
      toast.success('Shift created!');
      setShowModal(false);
      setNewShift({ user_id: '', location_id: '', date: '', start_time: '08:00', end_time: '17:00', role_label: '' });
      fetchSchedules({ startDate: weekStart, endDate: weekEnd, locationId: selectedLocation || undefined });
    } catch (err) {
      toast.error(err.message || 'Failed to create shift');
    }
  };

  const handleDeleteShift = async (id) => {
    try {
      await deleteShift(id);
      toast.success('Shift deleted');
    } catch (err) {
      toast.error(err.message || 'Failed to delete shift');
    }
  };

  // Group schedules by user for the grid
  const scheduleGrid = useMemo(() => {
    const grid = {};
    (schedules || []).forEach(s => {
      const uid = s.user_id;
      if (!grid[uid]) {
        grid[uid] = { user: s.user, shifts: {} };
      }
      const dateKey = s.date;
      if (!grid[uid].shifts[dateKey]) grid[uid].shifts[dateKey] = [];
      grid[uid].shifts[dateKey].push(s);
    });
    return Object.values(grid);
  }, [schedules]);

  const canManage = hasPermission('manage_users');

  return (
    <div className="hr-page">
      <div className="page-header">
        <div>
          <h1>Shift Schedules</h1>
          <p className="page-subtitle">Weekly shift calendar</p>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add Shift</button>
        )}
      </div>

      {/* Week Nav + Location Filter */}
      <div className="hr-filter-bar">
        <div className="hr-week-nav">
          <button className="btn btn-secondary btn-sm" onClick={() => setWeekOffset(w => w - 1)}>← Prev</button>
          <span className="hr-week-label">
            {weekDates[0].toLocaleDateString([], { month: 'short', day: 'numeric' })} — {weekDates[6].toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={() => setWeekOffset(w => w + 1)}>Next →</button>
          {weekOffset !== 0 && (
            <button className="btn btn-secondary btn-sm" onClick={() => setWeekOffset(0)}>Today</button>
          )}
        </div>
        {locations.length > 1 && (
          <select
            className="form-input"
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            style={{ maxWidth: '200px' }}
          >
            <option value="">All Locations</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
      </div>

      {/* Schedule Grid */}
      <div className="schedule-grid-wrapper">
        <table className="schedule-grid">
          <thead>
            <tr>
              <th className="schedule-user-col">Staff</th>
              {weekDates.map((d, i) => {
                const isToday = toDateStr(d) === toDateStr(new Date());
                return (
                  <th key={i} className={`schedule-day-col ${isToday ? 'schedule-today' : ''}`}>
                    <div className="schedule-day-label">{DAYS[i]}</div>
                    <div className="schedule-day-date">{d.getDate()}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {scheduleGrid.length === 0 ? (
              <tr><td colSpan={8} className="empty-state">No shifts scheduled for this week.</td></tr>
            ) : (
              scheduleGrid.map((row, idx) => (
                <tr key={idx}>
                  <td className="schedule-user-cell">
                    <div className="schedule-user-name">{row.user?.name || 'Unknown'}</div>
                    <div className="schedule-user-email">{row.user?.email}</div>
                  </td>
                  {weekDates.map((d, i) => {
                    const dateKey = toDateStr(d);
                    const shifts = row.shifts[dateKey] || [];
                    const isToday = dateKey === toDateStr(new Date());
                    return (
                      <td key={i} className={`schedule-cell ${isToday ? 'schedule-today' : ''}`}>
                        {shifts.map(s => (
                          <div key={s.id} className="schedule-shift-chip">
                            <span className="shift-time">{s.start_time}–{s.end_time}</span>
                            {s.role_label && <span className="shift-role">{s.role_label}</span>}
                            {canManage && (
                              <button
                                className="shift-delete"
                                onClick={() => handleDeleteShift(s.id)}
                                title="Delete shift"
                              >×</button>
                            )}
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Shift Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Shift</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Staff Member</label>
                <select className="form-input" value={newShift.user_id} onChange={e => setNewShift(p => ({ ...p, user_id: e.target.value }))}>
                  <option value="">Select staff...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Location</label>
                <select className="form-input" value={newShift.location_id || selectedLocation} onChange={e => setNewShift(p => ({ ...p, location_id: e.target.value }))}>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" className="form-input" value={newShift.date} onChange={e => setNewShift(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Start Time</label>
                  <input type="time" className="form-input" value={newShift.start_time} onChange={e => setNewShift(p => ({ ...p, start_time: e.target.value }))} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>End Time</label>
                  <input type="time" className="form-input" value={newShift.end_time} onChange={e => setNewShift(p => ({ ...p, end_time: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label>Role Label (optional)</label>
                <input type="text" className="form-input" placeholder="e.g. Cashier, Manager on Duty" value={newShift.role_label} onChange={e => setNewShift(p => ({ ...p, role_label: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddShift} disabled={loading || !newShift.user_id || !newShift.date}>
                {loading ? 'Creating...' : 'Create Shift'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
