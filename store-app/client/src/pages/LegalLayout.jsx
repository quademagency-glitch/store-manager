import { Link } from 'react-router-dom';

/**
 * Shared shell for the public legal pages.
 *
 * Deliberately matches LandingPage's dark styling rather than the signed-in
 * app's: these are linked from the marketing footer and the signup form, and
 * most readers will arrive without an account.
 */
export default function LegalLayout({ title, lastUpdated, children }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300">
      <header className="border-b border-slate-800">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo.svg" alt="" className="h-8 w-auto" />
            <span className="text-xl font-bold tracking-tight text-white">QuadERP</span>
          </Link>
          <Link to="/" className="text-sm text-slate-400 hover:text-slate-200">← Back</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-white mb-2">{title}</h1>
        <p className="text-sm text-slate-500 mb-10">Last updated {lastUpdated}</p>
        <div className="legal-prose space-y-6 leading-relaxed">{children}</div>
      </main>

      <footer className="border-t border-slate-800 py-8">
        <div className="max-w-3xl mx-auto px-6 flex flex-wrap gap-6 justify-between text-sm text-slate-500">
          <span>© {new Date().getFullYear()} QuadERP</span>
          <div className="flex gap-6">
            <Link to="/privacy" className="hover:text-slate-300">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-slate-300">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Section heading, so the two documents stay visually consistent. */
export function LegalSection({ title, children }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-white mt-10 mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
