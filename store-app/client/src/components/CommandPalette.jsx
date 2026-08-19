import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

/**
 * Cmd/Ctrl+K navigation.
 *
 * The sidebar carries 39 items across eight collapsible groups, which is a lot
 * of scrolling and guessing for someone who knows exactly where they want to
 * go. This turns navigation into typing three letters.
 *
 * IT DOES NOT DEFINE ITS OWN LIST. Entries come from MainLayout's navGroups,
 * which is already filtered by the signed-in user's permissions — so the
 * palette can never offer a page the user would be refused, and a nav item
 * added later appears here automatically. Duplicating the list is how a
 * palette ends up advertising pages that 403.
 */

/**
 * Subsequence match: every character of the query appears in order, not
 * necessarily adjacently. Lets "acrec" find "Accounts Receivable" — which is
 * the point of a palette over a plain filter.
 */
function fuzzyScore(query, text) {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;

  let qi = 0;
  let score = 0;
  let streak = 0;
  let firstIndex = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] !== q[qi]) { streak = 0; continue; }
    if (firstIndex === -1) firstIndex = ti;
    streak += 1;
    score += streak;                       // reward runs of adjacent matches
    if (ti === 0 || t[ti - 1] === ' ') score += 6;  // reward word starts
    qi += 1;
  }

  if (qi < q.length) return -1;            // not all characters matched
  if (t.startsWith(q)) score += 20;        // exact prefix wins outright
  return score - firstIndex * 0.1;         // earlier matches edge ahead
}

export default function CommandPalette({ navGroups = [] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Quick actions sit alongside navigation because "start a new sale" is a verb
  // people reach for, and hunting for the page that does it is the friction
  // this exists to remove. Each maps to a real route, so permission checks on
  // that route still apply.
  const commands = useMemo(() => {
    const fromNav = navGroups.flatMap((group) =>
      (group.items || []).map((item) => ({
        id: `nav:${item.path}`,
        label: item.label,
        group: group.title || 'Overview',
        path: item.path,
      })),
    );

    const paths = new Set(fromNav.map((c) => c.path));
    const quick = [
      { id: 'act:sale', label: 'New sale', group: 'Actions', path: '/sales' },
      { id: 'act:product', label: 'Add product', group: 'Actions', path: '/inventory' },
      { id: 'act:customer', label: 'Add customer', group: 'Actions', path: '/customers' },
      { id: 'act:reports', label: 'View reports', group: 'Actions', path: '/reports/profit-loss' },
      // Only offered if the user can actually reach the destination.
    ].filter((c) => paths.has(c.path));

    return [...quick, ...fromNav];
  }, [navGroups]);

  const results = useMemo(() => {
    if (!query.trim()) return commands.slice(0, 12);
    return commands
      .map((c) => ({ c, score: Math.max(fuzzyScore(query, c.label), fuzzyScore(query, `${c.group} ${c.label}`)) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((r) => r.c);
  }, [query, commands]);

  useKeyboardShortcuts([
    { key: 'k', meta: true, allowInInput: true, handler: () => setOpen((v) => !v) },
  ]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // Focus after paint, or the input does not exist yet.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const go = (cmd) => {
    setOpen(false);
    if (cmd) navigate(cmd.path);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div
      className="command-palette-overlay"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          ref={inputRef}
          className="command-palette-input"
          placeholder="Search pages and actions…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
          aria-controls="command-palette-results"
          aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
        />

        <ul className="command-palette-results" id="command-palette-results" role="listbox" ref={listRef}>
          {results.length === 0 && (
            <li className="command-palette-empty">No matches for “{query}”</li>
          )}
          {results.map((cmd, i) => (
            <li
              key={cmd.id}
              id={`cmd-${cmd.id}`}
              role="option"
              aria-selected={i === active}
              data-active={i === active}
              className={`command-palette-item${i === active ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(cmd)}
            >
              <span className="command-palette-label">{cmd.label}</span>
              <span className="command-palette-group">{cmd.group}</span>
            </li>
          ))}
        </ul>

        <div className="command-palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
