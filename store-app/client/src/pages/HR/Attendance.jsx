import { useState, useEffect } from 'react';
import { useHR } from '../../hooks/useHR';
import '../../styles/hr.css';

export default function Attendance() {
  const {
    attendanceStatus,
    myAttendance,
    fetchAttendanceStatus,
    fetchMyAttendance,
  } = useHR();

  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });

  useEffect(() => {
    fetchAttendanceStatus();
    fetchMyAttendance();
  }, [fetchAttendanceStatus, fetchMyAttendance]);

  const handleFilter = () => {
    fetchMyAttendance({ startDate: dateRange.startDate, endDate: dateRange.endDate });
  };

  const isClockedIn = attendanceStatus?.clocked_in;
  const activeLog = attendanceStatus?.active_log;

  const formatDuration = (minutes) => {
    if (!minutes) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  // Compute today's summary
  const todayStr = new Date().toISOString().split('T')[0];
  const todayLogs = (myAttendance?.data || []).filter(l => l.clock_in?.startsWith(todayStr));
  const todayMinutes = todayLogs.reduce((sum, l) => sum + (l.duration_minutes || 0), 0);

  // Week summary
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekLogs = (myAttendance?.data || []).filter(l => new Date(l.clock_in) >= weekStart);
  const weekMinutes = weekLogs.reduce((sum, l) => sum + (l.duration_minutes || 0), 0);

  return (
    <div className="hr-page">
      <div className="page-header">
        <h1>Attendance</h1>
        <p className="page-subtitle">Track your work hours</p>
      </div>

      {/* Current Status Banner */}
      <div className={`geofence-status-banner ${isClockedIn ? 'geofence-ok' : ''}`}
        style={!isClockedIn ? { background: 'rgba(148, 163, 184, 0.08)', border: '1px solid rgba(148, 163, 184, 0.25)' } : {}}>
        <div className="geofence-status-content">
          <div className="geofence-icon"
            style={!isClockedIn ? { background: 'rgba(148, 163, 184, 0.15)', color: 'var(--color-text-muted)' } : {}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6V12L16 14" strokeLinecap="round" />
            </svg>
          </div>
          <div className="geofence-status-text">
            <span className="geofence-label" style={!isClockedIn ? { color: 'var(--color-text-secondary)' } : {}}>
              {isClockedIn ? `✓ Currently Working` : '○ Not Clocked In'}
            </span>
            <span className="geofence-detail">
              {isClockedIn && activeLog
                ? `Since ${formatTime(activeLog.clock_in)} — Use the Scanner App to clock out`
                : 'Use the Scanner App to clock in'}
            </span>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="hr-summary-grid">
        <div className="hr-summary-card">
          <div className="hr-summary-icon" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><path d="M12 6V12L16 14" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <span className="hr-summary-label">Today</span>
            <span className="hr-summary-value">{formatDuration(todayMinutes)}</span>
          </div>
        </div>
        <div className="hr-summary-card">
          <div className="hr-summary-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <span className="hr-summary-label">This Week</span>
            <span className="hr-summary-value">{formatDuration(weekMinutes)}</span>
          </div>
        </div>
        <div className="hr-summary-card">
          <div className="hr-summary-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6H20M4 10H20M4 14H10" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <span className="hr-summary-label">Shifts (Week)</span>
            <span className="hr-summary-value">{weekLogs.length}</span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="hr-filter-bar">
        <h3>My Attendance Log</h3>
        <div className="hr-filters">
          <input
            type="date"
            className="form-input"
            value={dateRange.startDate}
            onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
          />
          <input
            type="date"
            className="form-input"
            value={dateRange.endDate}
            onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
          />
          <button className="btn btn-secondary" onClick={handleFilter}>Filter</button>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Location</th>
              <th>Clock In</th>
              <th>Clock Out</th>
              <th>Duration</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {(myAttendance?.data || []).length === 0 ? (
              <tr><td colSpan="6" className="empty-state">No attendance records found.</td></tr>
            ) : (
              (myAttendance.data).map(log => (
                <tr key={log.id}>
                  <td>{formatDate(log.clock_in)}</td>
                  <td>{log.location?.name || '—'}</td>
                  <td><span className="badge badge-success">{formatTime(log.clock_in)}</span></td>
                  <td>
                    {log.clock_out
                      ? <span className="badge badge-secondary">{formatTime(log.clock_out)}</span>
                      : <span className="badge badge-warning">Active</span>
                    }
                  </td>
                  <td>{formatDuration(log.duration_minutes)}</td>
                  <td className="text-muted">{log.note || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {myAttendance.totalPages > 1 && (
        <div className="pagination-row">
          {Array.from({ length: myAttendance.totalPages }, (_, i) => (
            <button
              key={i}
              className={`btn btn-sm ${myAttendance.page === i + 1 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => fetchMyAttendance({ page: i + 1 })}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
