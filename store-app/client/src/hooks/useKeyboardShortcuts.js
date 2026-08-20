import { useEffect, useRef } from 'react';

/**
 * Global keyboard shortcuts, with the guard that makes them safe.
 *
 * THE GUARD IS THE WHOLE POINT. A cashier types product names, customer names
 * and payment amounts all day. A shortcut that fires while they are typing is
 * worse than no shortcut, imagine "/" clearing the cart mid-sale. So by
 * default nothing fires while focus is in an input, textarea, select or
 * contenteditable.
 *
 * Escape is the deliberate exception: closing a dialog while focus is inside it
 * is exactly what people expect, so a binding can opt in with allowInInput.
 *
 * @param {Array<{
 *   key: string,            // e.g. 'F2', '/', 'Escape', 'k'
 *   handler: () => void,
 *   allowInInput?: boolean, // fire even while typing (Escape)
 *   meta?: boolean,         // require Cmd (mac) or Ctrl (win/linux)
 *   enabled?: boolean,
 * }>} bindings
 */
export function useKeyboardShortcuts(bindings) {
  // Held in a ref so the listener is attached once and never re-bound as
  // handlers change identity between renders.
  //
  // Synced in an effect rather than assigned during render: writing to a ref
  // while rendering is a React anti-pattern (and a lint error), because a
  // render can be discarded or replayed, leaving the ref describing a render
  // that never committed.
  const ref = useRef(bindings);
  useEffect(() => {
    ref.current = bindings;
  });

  useEffect(() => {
    function isTyping(target) {
      if (!target) return false;
      const tag = target.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable === true
      );
    }

    function onKeyDown(event) {
      const typing = isTyping(event.target);

      for (const b of ref.current) {
        if (!b || b.enabled === false) continue;
        if (b.key.length === 1
          ? event.key.toLowerCase() !== b.key.toLowerCase()
          : event.key !== b.key) continue;

        // metaKey on macOS, ctrlKey elsewhere, accepting either means the same
        // binding works on both without sniffing the platform.
        const wantsModifier = b.meta === true;
        const hasModifier = event.metaKey || event.ctrlKey;
        if (wantsModifier !== hasModifier) continue;

        if (typing && !b.allowInInput) continue;

        event.preventDefault();
        b.handler(event);
        return;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

export default useKeyboardShortcuts;
