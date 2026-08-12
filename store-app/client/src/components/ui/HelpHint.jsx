import { Link } from 'react-router-dom';

/**
 * A small "?" that deep-links to a help centre article.
 *
 * Put one next to anything a first-time user is likely to stall on. It is a
 * real link rather than a button so it can be opened in a new tab — reading
 * the ledger explainer while a half-finished reconciliation stays on screen
 * is the whole point.
 *
 * `article` is the permanent id from constants/helpArticles.js.
 */
export default function HelpHint({ article, label = 'Read the help article' }) {
  return (
    <Link
      to={`/help?article=${encodeURIComponent(article)}`}
      className="help-hint"
      title={label}
      aria-label={label}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9.1 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="17.5" r="1.2" fill="currentColor" />
      </svg>
    </Link>
  );
}
