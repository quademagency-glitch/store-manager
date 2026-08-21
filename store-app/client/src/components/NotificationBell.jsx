import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { reportError } from '../lib/errorReporting';
import { useFocusTrap } from '../hooks/useFocusTrap';

/**
 * Pending loss prevention alerts, in the sidebar footer.
 *
 * These are not "notifications" in the marketing sense. The alerts table holds
 * VOID, DISCOUNT, SHRINKAGE and CASH_OVERRIDE events: a cashier voided a sale,
 * applied a discount, or opened the till outside a sale. They already existed
 * and already had a page, but nothing surfaced them, so an owner learned about
 * a void by going looking for it.
 *
 * The sidebar footer rather than a top bar, because there is no desktop top
 * bar: `.mobile-sidebar-topbar` is display:none above 768px.
 *
 * POLLING, AND WHY IT IS CHEAPER THAN IT LOOKS
 *
 * `GET /api/alerts?status=pending` every 60 seconds, but only while the tab is
 * visible. A till is left open all day on a shop counter, so without the
 * visibility check this would be a request a minute per open tab forever,
 * against an endpoint that joins two user rows per alert. Pausing when hidden
 * is most of the saving.
 *
 * It also stops on the first 403 rather than retrying. The endpoint is
 * permission gated, and a user who is not allowed to read alerts will never
 * become allowed without a reload, so retrying is a request a minute that can
 * only ever fail.
 */
const POLL_MS = 60_000;

const TYPE_LABELS = {
  VOID: 'Void',
  DISCOUNT: 'Discount',
  SHRINKAGE: 'Shrinkage',
  CASH_OVERRIDE: 'Cash override',
};

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationBell({ enabled }) {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [open, setOpen] = useState(false);
  const [stopped, setStopped] = useState(false);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/alerts?status=pending');
      // Filtered again here, not because the server is untrusted but because
      // the badge is a count: if the query parameter is ever dropped, by a
      // proxy, a cache, or the mock layer, which strips query strings, the
      // number silently starts including resolved alerts and reads as work
      // that is not there.
      const rows = Array.isArray(data) ? data : [];
      setAlerts(rows.filter((a) => a.status === 'pending'));
    } catch (err) {
      // 403 is terminal: permissions do not change without a reload, so
      // retrying every minute would be a request that can only ever fail.
      if (/403|forbidden/i.test(err?.message || '')) {
        setStopped(true);
        return;
      }
      // Anything else is transient (offline, a blip). Keep whatever was last
      // shown rather than blanking the badge, and do not toast: an owner does
      // not need a popup every minute because the wifi dropped.
      reportError(err, { context: 'notification-bell' });
    }
  }, []);

  useEffect(() => {
    if (!enabled || stopped) return undefined;

    let timer = null;
    const tick = () => {
      if (document.visibilityState === 'visible') load();
    };

    load();
    timer = setInterval(tick, POLL_MS);

    // Refresh on return to the tab rather than waiting out the remainder of
    // the interval, which is the moment the number is most likely stale.
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, stopped, load]);

  useFocusTrap({
    active: open,
    containerRef: panelRef,
    onEscape: () => {
      setOpen(false);
      buttonRef.current?.focus();
    },
  });

  // Dismiss on a click elsewhere, same as the sidebar dropdowns.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (e.target instanceof Element && e.target.closest('[data-notification-bell]')) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const resolve = async (id) => {
    // Optimistic: the list is the badge, and waiting on the round trip leaves
    // the count wrong for as long as it takes.
    const previous = alerts;
    setAlerts((a) => a.filter((x) => x.id !== id));
    try {
      await api.put(`/alerts/${id}/resolve`, {});
    } catch (err) {
      setAlerts(previous);
      reportError(err, { context: 'notification-bell:resolve' });
    }
  };

  if (!enabled || stopped) return null;

  const count = alerts.length;

  return (
    <div className="notification-bell" data-notification-bell>
      <button
        ref={buttonRef}
        type="button"
        className="notification-bell-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={count > 0 ? `Alerts, ${count} pending` : 'Alerts, none pending'}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <span className="notification-bell-label">Alerts</span>
        {count > 0 && <span className="notification-bell-badge">{count > 9 ? '9+' : count}</span>}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="notification-panel"
          role="dialog"
          aria-label="Pending alerts"
          tabIndex={-1}
        >
          <div className="notification-panel-head">
            <strong>Pending alerts</strong>
            <span>{count}</span>
          </div>

          {count === 0 ? (
            <p className="notification-panel-empty">
              Nothing needs attention. Voids, discounts, cash overrides and
              shrinkage show up here.
            </p>
          ) : (
            <ul className="notification-list">
              {alerts.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <div className="notification-item-head">
                    <span className={`notification-type notification-type--${String(a.type).toLowerCase()}`}>
                      {TYPE_LABELS[a.type] || a.type}
                    </span>
                    <span className="notification-time">{timeAgo(a.created_at)}</span>
                  </div>
                  {a.note && <p className="notification-note">{a.note}</p>}
                  <div className="notification-item-actions">
                    {a.user?.name && <span className="notification-who">{a.user.name}</span>}
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => resolve(a.id)}>
                      Resolve
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="notification-panel-all"
            onClick={() => { setOpen(false); navigate('/alerts'); }}
          >
            {count > 6 ? `View all ${count} alerts` : 'Open alerts page'}
          </button>
        </div>
      )}
    </div>
  );
}
