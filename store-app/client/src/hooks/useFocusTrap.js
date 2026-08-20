import { useEffect } from 'react';

/**
 * What Tab may land on inside a dialog.
 *
 * `[tabindex]:not([tabindex^='-'])` rather than `[tabindex]`, because -1 means
 * "focusable by script, not by Tab" and including those would invent stops a
 * real Tab press never makes.
 */
export const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex^="-"])',
].join(',');

/**
 * Makes an open dialog behave like a dialog: Escape closes it, Tab stays
 * inside it, focus starts in it and goes back where it came from.
 *
 * `aria-modal="true"` does none of this. It hides the background from screen
 * readers and leaves the tab order completely untouched, so without a trap Tab
 * walks out of an open dialog and onto the page behind, which is covered by
 * the overlay. The user is then typing into a form they cannot see, and a
 * sighted keyboard user simply watches the caret disappear.
 *
 * Extracted from Modal so the confirm dialog can have the same behaviour
 * rather than a second, subtly different copy of it. Two focus traps in one
 * codebase is how one of them silently stops matching the other.
 *
 * @param {object}  o
 * @param {boolean} o.active            Whether the dialog is open.
 * @param {object}  o.containerRef      Ref to the dialog element.
 * @param {object} [o.initialFocusRef]  What to focus on open. Defaults to the
 *                                      first focusable child. Pass this
 *                                      explicitly for a destructive dialog:
 *                                      the safe choice should be focused, not
 *                                      the one that deletes something.
 * @param {Function} [o.onEscape]       Called on Escape.
 */
export function useFocusTrap({ active, containerRef, initialFocusRef, onEscape }) {
  useEffect(() => {
    if (!active) return undefined;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onEscape?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const root = containerRef.current;
      if (!root) return;

      // Queried on every keypress rather than cached on open: dialog bodies
      // load data, disable buttons while saving and reveal fields
      // conditionally, so a list captured at open time goes stale immediately.
      const focusable = [...root.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

      if (focusable.length === 0) {
        // Nothing to land on: hold focus on the dialog rather than letting it
        // escape to the page behind.
        e.preventDefault();
        root.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active_ = document.activeElement;

      if (e.shiftKey && (active_ === first || !root.contains(active_))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active_ === last || !root.contains(active_))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active, containerRef, onEscape]);

  // Move focus in on open, and put it back on close. Without the second half,
  // dismissing a dialog drops focus on <body> and the next Tab restarts from
  // the top of the page, so closing a dialog opened from a table's last row
  // returns the user to the header.
  useEffect(() => {
    if (!active) return undefined;

    const returnTo = document.activeElement;
    const target =
      initialFocusRef?.current ??
      containerRef.current?.querySelector(FOCUSABLE) ??
      containerRef.current;
    target?.focus();

    return () => {
      // Only if it still exists: the trigger is often a row action, and the
      // row may be the thing the dialog just deleted.
      if (returnTo instanceof HTMLElement && document.contains(returnTo)) {
        returnTo.focus();
      }
    };
    // initialFocusRef is a ref object and stable; depending on it would be
    // noise. Re-running on `active` alone is the intended behaviour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, containerRef]);
}
