import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../hooks/useToast';
import { PageHeader, PageState, EmptyStateRow, SkeletonRows } from '../../components/ui';

/**
 * Read-only viewer for the security audit trail (migration 070).
 *
 * There is no edit or delete affordance anywhere on this page, and that is not
 * an omission — the table grants no write policy to authenticated users at all.
 * An audit trail the audited party can edit is not an audit trail.
 */

const PAGE_SIZE = 50;

// Actions grouped for the filter, so the dropdown reads as categories rather
// than as 25 flat dotted strings.
const ACTION_GROUPS = [
  { label: 'Authentication', prefix: 'auth.' },
  { label: 'Users', prefix: 'user.' },
  { label: 'Roles', prefix: 'role.' },
  { label: 'Business', prefix: 'business.' },
  { label: 'Billing', prefix: 'billing.' },
  { label: 'Integrations', prefix: 'integration.' },
  { label: 'Data', prefix: 'data.' },
];

function formatAction(action) {
  const [, verb] = action.split('.');
  return (verb || action).replace(/_/g, ' ');
}

function actionTone(action) {
  if (action.includes('deleted') || action.includes('failed') || action.includes('revoked')) return 'danger';
  if (action.includes('changed') || action.includes('updated') || action.includes('status')) return 'warning';
  return 'default';
}

export default function AuditLog() {
  const toast = useToast();
  const [entries, setEntries] = useState([]);
  const [actions, setActions] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ action: '', from: '', to: '' });
  const [expanded, setExpanded] = useState(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (filters.action) params.set('action', filters.action);
      if (filters.from) params.set('from', new Date(filters.from).toISOString());
      if (filters.to) params.set('to', new Date(filters.to).toISOString());

      const res = await api.get(`/audit-logs?${params.toString()}`);
      setEntries(res.data || []);
      setTotalPages(res.totalPages || 1);
      setTotal(res.total || 0);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  useEffect(() => {
    // Filter options come from the server's canonical AUDIT_ACTIONS list rather
    // than being duplicated here, so a new action type shows up automatically.
    api.get('/audit-logs/actions')
      .then(res => setActions(Array.isArray(res) ? res : []))
      .catch(() => toast.error("Couldn't load the action filter list."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="page-container">
      <PageHeader
        title="Audit Log"
        subtitle={`Security and administrative events${total ? `: ${total.toLocaleString()} recorded` : ''}`}
      />

      <div className="card mb-lg">
        <div className="filter-row" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group">
            <label htmlFor="audit-action">Event type</label>
            <select
              id="audit-action"
              className="form-control"
              value={filters.action}
              onChange={e => updateFilter('action', e.target.value)}
            >
              <option value="">All events</option>
              {ACTION_GROUPS.map(group => {
                const groupActions = actions.filter(a => a.startsWith(group.prefix));
                if (groupActions.length === 0) return null;
                return (
                  <optgroup key={group.prefix} label={group.label}>
                    {groupActions.map(a => (
                      <option key={a} value={a}>{formatAction(a)}</option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="audit-from">From</label>
            <input
              id="audit-from"
              type="date"
              className="form-control"
              value={filters.from}
              onChange={e => updateFilter('from', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="audit-to">To</label>
            <input
              id="audit-to"
              type="date"
              className="form-control"
              value={filters.to}
              onChange={e => updateFilter('to', e.target.value)}
            />
          </div>

          {(filters.action || filters.from || filters.to) && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setFilters({ action: '', from: '', to: '' }); setPage(1); }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <PageState loading={false} error={error} onRetry={fetchEntries}>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Event</th>
                <th scope="col">Who</th>
                <th scope="col">Resource</th>
                <th scope="col">IP address</th>
                <th scope="col"><span className="sr-only">Detail</span></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows rows={8} cols={6} />
              ) : entries.length === 0 ? (
                <EmptyStateRow
                  colSpan={6}
                  icon="clipboard"
                  title="No events recorded"
                  hint={
                    filters.action || filters.from || filters.to
                      ? 'No events match these filters. Try widening the date range.'
                      : 'Security events like sign-ins, role changes and data exports will appear here as they happen.'
                  }
                />
              ) : (
                entries.map(entry => (
                  <tr key={entry.id}>
                    <td>
                      <time dateTime={entry.created_at}>
                        {new Date(entry.created_at).toLocaleString()}
                      </time>
                    </td>
                    <td>
                      <span className={`badge badge-${actionTone(entry.action)}`}>
                        {formatAction(entry.action)}
                      </span>
                    </td>
                    <td>
                      {entry.actor_email || <span className="text-muted">System</span>}
                      {entry.actor_role && (
                        <div className="text-muted" style={{ fontSize: '0.8rem' }}>{entry.actor_role}</div>
                      )}
                    </td>
                    <td>
                      {entry.resource_type}
                      {entry.resource_id && (
                        <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                          {String(entry.resource_id).slice(0, 8)}
                        </div>
                      )}
                    </td>
                    <td className="text-muted">{entry.ip_address || '-'}</td>
                    <td>
                      {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          aria-expanded={expanded === entry.id}
                          onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                        >
                          {expanded === entry.id ? 'Hide' : 'Details'}
                        </button>
                      )}
                      {expanded === entry.id && (
                        <pre
                          style={{
                            marginTop: '0.5rem',
                            fontSize: '0.75rem',
                            background: 'var(--color-bg-secondary)',
                            padding: '0.5rem',
                            borderRadius: '4px',
                            maxWidth: '320px',
                            overflowX: 'auto',
                          }}
                        >
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PageState>

      {totalPages > 1 && (
        <nav className="pagination" aria-label="Audit log pages" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '1rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="text-muted">Page {page} of {totalPages}</span>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={page >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
