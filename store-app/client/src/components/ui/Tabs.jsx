import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Tabs — one keyboard-accessible tab strip replacing the five that
 * existed before it:
 *
 *   .inventory-tab*      Inventory        pill, scrollable
 *   .loyalty-tab*        Loyalty          pill
 *   .modern-tab*         CRMCommunications  underline, defined in an
 *                                           injected <style> that leaked
 *                                           globally once the page mounted
 *   inline hex           Settings         ignored the theme entirely
 *   inline hex           UserProfile      ditto
 *
 * None of them were reachable by keyboard beyond Tab-through-every-button,
 * and none exposed `role="tablist"`, so a screen reader announced a row of
 * unrelated buttons with no indication of which was current.
 *
 * Follows the APG tabs pattern with **automatic activation**: arrow keys
 * both move focus and select. That is the right choice here because every
 * consumer already keeps its panel content in memory and switches with a
 * ternary, so selection costs nothing.
 *
 * Panels are siblings of the strip in all five call sites rather than
 * children, so the aria wiring is threaded through an explicit `idPrefix`
 * instead of context — see TabPanel below.
 */
export default function Tabs({
  items,
  value,
  onChange,
  idPrefix,
  variant = 'pill',
  ariaLabel,
  className = '',
}) {
  const scrollerRef = useRef(null);
  const tabRefs = useRef(new Map());
  const [fade, setFade] = useState({ left: false, right: false });

  const enabled = items.filter((t) => !t.disabled);

  /* Overflow affordance. Generalised from `.inventory-tabs-wrap`, which
     was the only strip that had it — and whose gradient was a hardcoded
     rgba(0,0,0,.35), i.e. a black smudge in light mode. */
  const updateFade = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setFade({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
  }, []);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    updateFade();
    const ro = new ResizeObserver(updateFade);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateFade, items.length]);

  /* Keep the selected tab in view when selection changes from outside —
     UserProfile drives it from a URL search param, so the active tab can
     start off-screen on a narrow viewport. */
  useEffect(() => {
    const el = tabRefs.current.get(value);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [value]);

  const move = (delta) => {
    if (enabled.length === 0) return;
    const i = enabled.findIndex((t) => t.id === value);
    const next = enabled[(i + delta + enabled.length) % enabled.length];
    onChange(next.id);
    tabRefs.current.get(next.id)?.focus();
  };

  const select = (id) => {
    onChange(id);
    tabRefs.current.get(id)?.focus();
  };

  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'Home':
        e.preventDefault();
        if (enabled[0]) select(enabled[0].id);
        break;
      case 'End':
        e.preventDefault();
        if (enabled.length) select(enabled[enabled.length - 1].id);
        break;
      default:
    }
  };

  return (
    <div
      className={[
        'tabs-wrap',
        fade.left ? 'is-fade-left' : '',
        fade.right ? 'is-fade-right' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        ref={scrollerRef}
        role="tablist"
        aria-label={ariaLabel}
        className={`tabs tabs--${variant}`}
        onScroll={updateFade}
        onKeyDown={handleKeyDown}
      >
        {items.map((tab) => {
          const selected = tab.id === value;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.id, el);
                else tabRefs.current.delete(tab.id);
              }}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${tab.id}`}
              aria-controls={`${idPrefix}-panel-${tab.id}`}
              aria-selected={selected}
              // Roving tabindex: the strip is one Tab stop, not N.
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              className="tab"
              onClick={() => onChange(tab.id)}
            >
              {tab.icon ? <span className="tab-icon">{tab.icon}</span> : null}
              <span className="tab-label">{tab.label}</span>
              {tab.badge != null && tab.badge !== '' ? (
                <span className="tab-badge">{tab.badge}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The panel half of the pair. `idPrefix` must match the strip's — a DEV
 * check below fails loudly on a typo, because a mismatched `aria-labelledby`
 * is invisible in the browser and only shows up in an audit.
 */
export function TabPanel({ idPrefix, id, value, children, className = '' }) {
  const active = id === value;

  useEffect(() => {
    if (!import.meta.env.DEV || !active) return;
    if (!document.getElementById(`${idPrefix}-tab-${id}`)) {
      console.error(
        `[Tabs] <TabPanel idPrefix="${idPrefix}" id="${id}"> has no matching tab. ` +
          'The idPrefix must be identical on <Tabs> and every <TabPanel>.',
      );
    }
  }, [active, idPrefix, id]);

  if (!active) return null;

  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${id}`}
      aria-labelledby={`${idPrefix}-tab-${id}`}
      // Focusable so a keyboard user can scroll a long panel, and so
      // focus has somewhere to land after leaving the strip.
      tabIndex={0}
      className={`tab-panel ${className}`.trim()}
    >
      {children}
    </div>
  );
}
