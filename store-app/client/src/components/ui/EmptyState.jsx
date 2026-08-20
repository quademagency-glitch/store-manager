import { Icons } from '../icons/Icons';

/**
 * Empty states.
 *
 * The app had four competing conventions and 30 tables that rendered bare
 * column headers over nothing when a collection came back empty. Worse,
 * `className="empty-state"` was applied directly to a <td> in six places,
 * dropping a dashed-border card ruleset onto a table cell.
 *
 * The visual spec is generalised from `.cart-empty` in
 * sales-page-pos-layout.css, the one fully class-driven empty state that
 * already existed, and the only one with a proper icon/title/hint hierarchy.
 */
export function EmptyState({
  icon = 'clipboard',
  title,
  hint,
  action,
  size = 'md',
  variant = 'default',
}) {
  const glyph = typeof icon === 'string' ? Icons[icon] : icon;

  return (
    <div className={`empty-state empty-state--${size} empty-state--${variant}`}>
      {glyph ? (
        <div className="empty-state-icon" aria-hidden="true">
          {glyph}
        </div>
      ) : null}
      <p className="empty-state-title">{title}</p>
      {hint ? <p className="empty-state-hint">{hint}</p> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}

/**
 * Table-body variant. Exists so callers stop putting a card ruleset on a <td>.
 *
 * `colSpan` is required, a short colSpan silently misaligns the row, and the
 * failure is easy to miss because the table still renders.
 */
export function EmptyStateRow({ colSpan, ...props }) {
  if (import.meta.env.DEV && !colSpan) {
    console.warn('<EmptyStateRow> needs colSpan to span the table correctly.');
  }

  return (
    <tr className="empty-state-row">
      <td colSpan={colSpan || 1}>
        <EmptyState size="sm" {...props} />
      </td>
    </tr>
  );
}

export default EmptyState;
