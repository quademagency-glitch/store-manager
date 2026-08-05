/**
 * One page header for the whole app.
 *
 * There were six different header shapes across 47 pages — `.page-header` vs
 * `.dashboard-header`, `.page-title` vs `.dashboard-title` vs a bare <h1>,
 * and every action slot a hand-rolled inline-styled flex div.
 *
 * The CSS for both families is already aliased in pages-layouts.css, so a page
 * renders identically whether it uses this component or the old markup. That
 * is what lets the migration happen page by page with no flash-cut.
 */
export default function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
  badge,
  as: Heading = 'h1',
  className = '',
}) {
  return (
    <header className={`page-header ${className}`.trim()}>
      <div className="page-header-text">
        {breadcrumb ? <nav className="page-breadcrumb">{breadcrumb}</nav> : null}
        <div className="page-title-row">
          <Heading className="page-title">{title}</Heading>
          {badge}
        </div>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
