import { EmptyState } from './EmptyState';

/**
 * The error half of PageState on its own.
 *
 * Most pages in this app do not need the loading/empty orchestration, they
 * already render their own skeleton and empty row, they just need the thing
 * that was missing everywhere: a visible signal that a fetch failed, and a way
 * to try it again. Dropping one of these under a page header is a one-line
 * change, which is what makes fixing 20-odd swallowed catches tractable.
 *
 * Renders nothing when there is no error, so it is safe to leave in place.
 */
export function ErrorBanner({ error, onRetry, className = 'mb-lg' }) {
  if (!error) return null;
  const message = error.userMessage || error.message || String(error);

  return (
    <div className={`alert alert-error ${className}`.trim()} role="alert">
      <span>{message}</span>
      {onRetry ? (
        <button type="button" className="btn btn-sm btn-outline" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

/**
 * Loading / error / empty orchestration for a page or panel.
 *
 * `preserveContent` defaults to true, which encodes the pattern already used
 * correctly at 36 sites: show the error ABOVE the existing content rather than
 * replacing the page with it. Two pages replaced the whole view on error,
 * leaving the user with no header, no filters and no way to retry the thing
 * that failed, those become explicit opt-outs rather than the norm.
 *
 * The `onRetry` slot matters as much as the message: 29 catch blocks in this
 * codebase swallowed their error entirely, so a failed fetch was
 * indistinguishable from genuinely having no data.
 */
export default function PageState({
  loading = false,
  error = null,
  empty = false,
  skeleton = null,
  emptyState = null,
  onRetry,
  preserveContent = true,
  children,
}) {
  const message = error
    ? error.userMessage || error.message || String(error)
    : null;

  const banner = <ErrorBanner error={error} onRetry={onRetry} />;

  // Hard failure with nothing worth keeping on screen.
  if (message && !preserveContent) {
    return (
      <>
        {banner}
        <EmptyState
          icon="alertTriangle"
          variant="error"
          title="This didn't load"
          hint="The information couldn't be retrieved. Try again in a moment."
          action={
            onRetry ? (
              <button type="button" className="btn btn-primary" onClick={onRetry}>
                Retry
              </button>
            ) : null
          }
        />
      </>
    );
  }

  if (loading) {
    return (
      <>
        {banner}
        {skeleton}
      </>
    );
  }

  if (empty) {
    return (
      <>
        {banner}
        {emptyState ?? <EmptyState title="Nothing here yet" />}
      </>
    );
  }

  return (
    <>
      {banner}
      {children}
    </>
  );
}
