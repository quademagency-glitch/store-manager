/**
 * Loading placeholders.
 *
 * Nothing like this existed — five pages replaced the entire view with the
 * bare text "Loading…", which swaps the whole layout and flashes.
 *
 * Presets are dimensionally matched to the real components they stand in for,
 * so the loading → loaded transition produces no layout shift.
 */
export function Skeleton({ width, height = '1em', radius, circle = false, className = '' }) {
  return (
    <span
      className={`skeleton ${className}`.trim()}
      aria-hidden="true"
      style={{
        width: circle ? height : width,
        height,
        borderRadius: circle ? '50%' : radius,
      }}
    />
  );
}

export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={`skeleton-text ${className}`.trim()}>
      {Array.from({ length: lines }, (_, i) => (
        // Last line short, the way real wrapped text ends.
        <Skeleton key={i} height="0.85em" width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </div>
  );
}

/** Matches `.glass-table` geometry so rows don't jump when data arrives. */
export function SkeletonTable({ rows = 5, cols = 4, showHeader = true, caption = 'Loading table data' }) {
  return (
    <div className="skeleton-table" role="status" aria-label={caption}>
      {showHeader ? (
        <div className="skeleton-table-row skeleton-table-head">
          {Array.from({ length: cols }, (_, i) => (
            <Skeleton key={i} height="0.75em" width="60%" />
          ))}
        </div>
      ) : null}
      {Array.from({ length: rows }, (_, r) => (
        <div className="skeleton-table-row" key={r}>
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} height="0.9em" width={c === 0 ? '50%' : '75%'} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Loading rows for a table that is already rendered.
 *
 * `SkeletonTable` builds its own grid, so it cannot go inside a <tbody> —
 * and a <div> there is invalid markup the browser hoists out of the table.
 * Every in-table loading state in the app was a single centred cell reading
 * "Loading…", which collapses the column widths and then snaps back when the
 * data lands. These are real <tr>/<td>, so the columns hold their positions.
 */
export function SkeletonRows({ rows = 3, cols = 4 }) {
  return Array.from({ length: rows }, (_, r) => (
    <tr key={r} className="skeleton-row" aria-hidden="true">
      {Array.from({ length: cols }, (_, c) => (
        <td key={c}>
          <Skeleton height="0.9em" width={c === 0 ? '50%' : '75%'} />
        </td>
      ))}
    </tr>
  ));
}

export function SkeletonCards({ count = 4, className = '' }) {
  return (
    <div className={`skeleton-cards ${className}`.trim()} role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div className="skeleton-card surface-1" key={i}>
          <Skeleton height="0.75em" width="45%" />
          <Skeleton height="1.6em" width="70%" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonForm({ fields = 4 }) {
  return (
    <div className="skeleton-form" role="status" aria-label="Loading form">
      {Array.from({ length: fields }, (_, i) => (
        <div className="skeleton-field" key={i}>
          <Skeleton height="0.75em" width="30%" />
          <Skeleton height="2.4em" radius="var(--radius-md)" />
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
