import { Children, isValidElement } from 'react';
import { Link } from 'react-router-dom';
import { ENTITY, unresolved } from '../legal/entity';

/**
 * Shared shell for the public legal documents.
 *
 * Deliberately matches LandingPage's dark styling rather than the signed-in
 * app's: these are linked from the marketing footer and the signup form, and
 * most readers arrive without an account.
 *
 * The structure here is not decoration. Legal documents are drafted as
 * numbered clauses because clauses have to be citable — a term that says
 * "subject to clause 14.2" is worthless if the reader cannot find 14.2, and a
 * dispute is argued clause by clause. So: stable numbers, a contents list, and
 * a linkable anchor per clause.
 */
export default function LegalLayout({ title, version, effective, children }) {
  const clauses = Children.toArray(children).filter(
    (c) => isValidElement(c) && c.props?.n != null && c.props?.title,
  );

  // Numbers are the document's identifiers, so a gap or a duplicate is a real
  // defect — a cross-reference to "clause 9" that matches two clauses, or none,
  // is exactly the ambiguity these documents exist to remove. Caught in
  // development, where it is cheap.
  if (import.meta.env.DEV) {
    const ns = clauses.map((c) => Number(c.props.n));
    const expected = ns.map((_, i) => i + 1);
    if (String(ns) !== String(expected)) {
      console.error(
        `[legal] "${title}" clause numbers are ${ns.join(',')}, expected ` +
          `${expected.join(',')}. Renumber, and fix any cross-references in the prose.`,
      );
    }
  }

  const missing = import.meta.env.DEV ? unresolved() : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300">
      <a href="#doc" className="legal-skip">Skip to document</a>

      <header className="border-b border-slate-800">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo.svg" alt="" className="h-8 w-auto" />
            <span className="text-xl font-bold tracking-tight text-white">{ENTITY.product}</span>
          </Link>
          <Link to="/" className="legal-back text-sm text-slate-400 hover:text-slate-200">← Back</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-white mb-2">{title}</h1>
        <p className="text-sm text-slate-500 mb-10">
          Version {version} · In effect from {effective}
        </p>

        {missing.length > 0 && (
          <div role="alert" className="legal-todo">
            <strong>Not ready to publish.</strong> These details are still
            placeholders: {missing.join(', ')}. Until they are filled in,
            this document does not identify a contracting party. See{' '}
            <code>src/legal/entity.js</code>.
          </div>
        )}

        {clauses.length > 0 && (
          <nav aria-labelledby="toc-heading" className="legal-toc">
            <h2 id="toc-heading" className="text-sm uppercase tracking-wide text-slate-400 mb-3">
              Contents
            </h2>
            <ol>
              {clauses.map((c) => (
                <li key={c.props.n}>
                  <a href={`#clause-${c.props.n}`}>
                    <span className="legal-toc-n">{c.props.n}.</span> {c.props.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <div id="doc" className="legal-prose">{children}</div>
      </main>

      <footer className="border-t border-slate-800 py-8">
        <div className="max-w-3xl mx-auto px-6 flex flex-wrap gap-6 justify-between text-sm text-slate-500">
          <span>© {new Date().getFullYear()} {ENTITY.legalName}</span>
          <div className="flex flex-wrap gap-6">
            <Link to="/terms" className="hover:text-slate-300">Terms of Service</Link>
            <Link to="/privacy" className="hover:text-slate-300">Privacy Policy</Link>
            <Link to="/dpa" className="hover:text-slate-300">Data Processing</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * A numbered top-level clause.
 *
 * `n` is explicit rather than derived from position on purpose. Auto-numbering
 * silently renumbers every following clause when one is inserted, which
 * quietly invalidates every cross-reference in the prose — and cross-references
 * are the load-bearing part of a contract. An explicit number makes the change
 * visible in the diff, and the check in LegalLayout catches a mistake.
 */
export function Clause({ n, title, children }) {
  return (
    <section id={`clause-${n}`} className="legal-clause">
      <h2>
        <span className="legal-clause-n">{n}.</span> {title}
      </h2>
      {children}
    </section>
  );
}

/** A numbered sub-clause, e.g. 14.2 — the level disputes are actually argued at. */
export function Sub({ n, children }) {
  return (
    <div className="legal-sub">
      <span className="legal-sub-n" aria-hidden="true">{n}</span>
      <div className="legal-sub-body">
        {/* Read out as "Clause 14.2, ..." rather than a bare number floating
            free of its text, which is what a screen reader gets from the
            visual two-column layout alone. */}
        <span className="sr-only">Clause {n}. </span>
        {children}
      </div>
    </div>
  );
}

/** A defined term. Definitions are what make the rest of the document precise. */
export function Defined({ term, children }) {
  return (
    <div className="legal-def">
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}
