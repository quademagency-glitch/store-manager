import { Link } from 'react-router-dom';
import { useAuthContext } from '../lib/AuthContext';

/**
 * Persistent strip across the top of the app while browsing the public
 * sandbox.
 *
 * Deliberately not dismissible. Someone who forgets they are in the demo will
 * spend twenty minutes setting up their real catalogue and lose it at the
 * nightly reset — the banner is the only thing standing between them and that,
 * so it is worth the vertical space on every screen.
 *
 * The CTA is a plain link, and the demo session is ended by the signup page
 * on arrival rather than here. Signing out first looked more obvious and did
 * not work: signOut unmounts MainLayout, and ProtectedRoute's redirect to
 * /login beat this component's own navigate every time.
 */
export default function DemoBanner() {
  const { isDemo } = useAuthContext();

  if (!isDemo) return null;

  return (
    <div className="demo-banner" role="status">
      <span className="demo-banner-tag">Demo</span>
      <span className="demo-banner-text">
        You&rsquo;re exploring a sample store. Nothing here is real, and it resets every night.
      </span>
      <Link to="/signup" className="demo-banner-cta">
        Start your free trial
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </div>
  );
}
