import { usePlatformAdmin } from '../PlatformAdminContext';
import { EmptyStateRow } from '../../../components/ui';

/**
 * Who has come through the public front door: demo opens and signups.
 *
 * Both events were already written to audit_logs on every occurrence and
 * nothing read them back, so the only way to find out whether anyone had
 * tried the product was to query the database by hand. A signup also sends
 * an email the moment it happens; demo opens deliberately do not, because
 * one curious visitor can produce several in a minute. This panel is where
 * you look for those instead.
 */

/* Ghana keeps UTC+0 year round with no daylight saving, so the browser's
   local rendering and the server's UTC day boundary agree for the people
   this dashboard is built for. Anyone reading it from another timezone will
   see their own clock, which is the correct behaviour rather than a bug. */
function timeAgo(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/* Enough to tell a phone from a laptop and a bot from a person, which is all
   this column is for. Not a user-agent parser, and it should not become one. */
function deviceLabel(ua) {
  if (!ua) return 'Unknown';
  if (/bot|crawl|spider|headless|curl|wget|python-requests/i.test(ua)) return 'Bot';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone or iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  return 'Other';
}

/* The landing page forwards utm_* plus the page they landed on and the button
   they pressed. Show the most specific thing present rather than all of it:
   the full object is in the signup alert email and in audit_logs. */
function sourceLabel(attribution) {
  if (!attribution || typeof attribution !== 'object') return null;
  const { utm_source: source, utm_campaign: campaign, lp, ref, cta } = attribution;
  return source || campaign || ref || lp || cta || null;
}

export default function FrontDoorActivity() {
  const { activity } = usePlatformAdmin();

  /* null means the request failed. The page already names the failure in its
     partial-failures banner, so this says the specific thing that banner
     cannot: the numbers you would otherwise read as zero are missing, not
     zero. Reading "0 demo opens" off a failed fetch is the exact mistake
     this panel exists to prevent. */
  if (!activity) {
    return (
      <div className="pa-activity-section">
        <h2 className="pa-section-title">Front Door</h2>
        <div className="content-card" style={{ padding: '1.25rem' }}>
          <p className="text-secondary" style={{ margin: 0 }}>
            Could not load demo and signup activity. These are not zeroes, they
            are unknown. Refresh to try again.
          </p>
        </div>
      </div>
    );
  }

  const t = activity.totals || {};
  const recent = activity.recent || [];

  const cards = [
    {
      label: 'Demo opens today',
      value: t.demoOpensToday ?? 0,
      hint: `${t.demoVisitorsToday ?? 0} distinct ${t.demoVisitorsToday === 1 ? 'address' : 'addresses'}`,
    },
    {
      label: 'Demo opens this week',
      value: t.demoOpensWeek ?? 0,
      hint: `${t.demoVisitorsWeek ?? 0} distinct ${t.demoVisitorsWeek === 1 ? 'address' : 'addresses'}`,
    },
    {
      label: 'Signups this week',
      value: t.signupsWeek ?? 0,
      hint: `${t.signupsToday ?? 0} today`,
    },
    {
      label: 'Signups in 30 days',
      value: t.signups30d ?? 0,
      hint: 'Emailed to you as they happen',
    },
  ];

  return (
    <div className="pa-activity-section">
      <h2 className="pa-section-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Front Door
      </h2>

      <div className="stats-grid pa-stats-grid">
        {cards.map((card) => (
          <div className="stat-card pa-stat-card" key={card.label}>
            <div className="stat-details">
              <span className="stat-label">{card.label}</span>
              <span className="stat-value">{card.value}</span>
              <span className="stat-hint">{card.hint}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="content-card">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>What</th>
                <th>Who</th>
                <th>Device</th>
                <th>Came from</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((row) => {
                const isSignup = row.action === 'auth.signup';
                const source = sourceLabel(row.attribution);
                return (
                  <tr key={row.id}>
                    <td className="text-secondary" title={new Date(row.created_at).toLocaleString()}>
                      {timeAgo(row.created_at)}
                    </td>
                    <td>
                      {isSignup ? (
                        <span className="badge badge-neutral" style={{ color: '#4ade80', borderColor: '#4ade80' }}>
                          Signup
                        </span>
                      ) : (
                        <span className="badge badge-neutral">Demo</span>
                      )}
                    </td>
                    <td>
                      {isSignup
                        ? <span className="font-medium">{row.business_name || row.actor_email || 'Unnamed'}</span>
                        : <span className="text-secondary">Anonymous visitor</span>}
                      {isSignup && row.plan && (
                        <span className="text-secondary"> · {row.plan}</span>
                      )}
                    </td>
                    <td className="text-secondary">{deviceLabel(row.user_agent)}</td>
                    <td className="text-secondary">{source || 'Direct'}</td>
                  </tr>
                );
              })}
              {recent.length === 0 && (
                <EmptyStateRow
                  colSpan={5}
                  icon="business"
                  title="Nobody has opened the demo or signed up in the last 30 days"
                />
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
