import { useState, useEffect } from 'react';
import { useHR } from '../../hooks/useHR';
import { useToast } from '../../hooks/useToast';
import { api } from '../../lib/api';
import '../../styles/hr.css';

export default function AttendanceReport() {
  const toast = useToast();
  const { attendanceLogs, fetchAttendanceLogs, exportPayroll } = useHR();

  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [filters, setFilters] = useState({
    userId: '', locationId: '', startDate: '', endDate: '',
  });

  useEffect(() => {
    fetchAttendanceLogs();
    api.get('/users').then(res => setUsers(Array.isArray(res) ? res : res?.data || [])).catch(() => {});
    api.get('/locations').then(res => setLocations(Array.isArray(res) ? res : [])).catch(() => {});
  }, [fetchAttendanceLogs]);

  const handleFilter = () => {
    fetchAttendanceLogs(filters);
  };

  const handleExport = async () => {
    if (!filters.startDate || !filters.endDate) {
      toast.error('Please select a date range for the export');
      return;
    }
    try {
      await exportPayroll(filters.startDate, filters.endDate);
      toast.success('Payroll exported!');
    } catch (err) {
      toast.error(err.message || 'Export failed');
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatDuration = (minutes) => {
    if (!minutes) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  // Aggregate summary by staff
  const staffSummary = {};
  (attendanceLogs?.data || []).forEach(log => {
    const uid = log.user_id;
    if (!staffSummary[uid]) {
      staffSummary[uid] = {
        user: log.user,
        totalMinutes: 0,
        shifts: 0,
      };
    }
    staffSummary[uid].totalMinutes += log.duration_minutes || 0;
    staffSummary[uid].shifts += 1;
  });

  return (
    <div className="hr-page">
      <div className="page-header">
        <div>
          <h1>Attendance Report</h1>
          <p className="page-subtitle">Staff attendance overview</p>
        </div>
        <button className="btn btn-secondary" onClick={handleExport}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7 10l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Export Payroll CSV
        </button>
      </div>

      {/* Filters */}
      <div className="hr-filter-bar">
        <div className="hr-filters">
          <select className="form-input" value={filters.userId} onChange={e => setFilters(p => ({ ...p, userId: e.target.value }))}>
            <option value="">All Staff</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select className="form-input" value={filters.locationId} onChange={e => setFilters(p => ({ ...p, locationId: e.target.value }))}>
            <option value="">All Locations</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <input type="date" className="form-input" value={filters.startDate} onChange={e => setFilters(p => ({ ...p, startDate: e.target.value }))} />
          <input type="date" className="form-input" value={filters.endDate} onChange={e => setFilters(p => ({ ...p, endDate: e.target.value }))} />
          <button className="btn btn-primary" onClick={handleFilter}>Apply</button>
        </div>
      </div>

      {/* Staff Summary Cards */}
      {Object.keys(staffSummary).length > 0 && (
        <div className="hr-staff-summary-grid">
          {Object.values(staffSummary).map((s, i) => (
            <div key={i} className="hr-staff-card">
              <div className="hr-staff-avatar">{s.user?.name?.charAt(0)?.toUpperCase() || '?'}</div>
              <div className="hr-staff-info">
                <span className="hr-staff-name">{s.user?.name || 'Unknown'}</span>
                <span className="hr-staff-meta">{s.shifts} shifts · {formatDuration(s.totalMinutes)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detailed Log Table */}
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Staff</th>
              <th>Date</th>
              <th>Location</th>
              <th>Clock In</th>
              <th>Clock Out</th>
              <th>Duration</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {(attendanceLogs?.data || []).length === 0 ? (
              <tr><td colSpan="7" className="empty-state">No attendance records found.</td></tr>
            ) : (
              (attendanceLogs.data).map(log => (
                <tr key={log.id}>
                  <td className="font-semibold">{log.user?.name || '—'}</td>
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
      {attendanceLogs.totalPages > 1 && (
        <div className="pagination-row">
          {Array.from({ length: attendanceLogs.totalPages }, (_, i) => (
            <button
              key={i}
              className={`btn btn-sm ${attendanceLogs.page === i + 1 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => fetchAttendanceLogs({ ...filters, page: i + 1 })}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
