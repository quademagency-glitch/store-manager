import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Public API is unchanged — { isOpen, onClose, title, children, size } —
 * so all 32 consumers are unaffected.
 *
 * Two structural fixes:
 *
 *  - Portals to <body>. Rendering in place made the modal a DOM descendant
 *    of whatever opened it, so a modal inside a `.glass-panel` compounded
 *    the panel's alpha and inherited its stacking/containing-block context.
 *    Tier-3 surfaces must never nest inside tier 1.
 *  - `useId` for the label association. The id was hardcoded as
 *    "modal-title", so two mounted modals produced duplicate ids and
 *    `aria-labelledby` resolved to whichever came first in the document.
 */
/**
 * What Tab may land on inside a dialog. `[tabindex]:not([tabindex^='-'])`
 * rather than `[tabindex]`, because -1 means "focusable by script, not by
 * Tab" — including those would insert stops a real Tab press never makes.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex^="-"])',
].join(',');

export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  const titleId = useId();
  const closeRef = useRef(null);
  const dialogRef = useRef(null);

  const sizeClasses = {
    sm: 'modal-sm',
    md: 'modal-md',
    lg: 'modal-lg',
    xl: 'modal-xl',
  };

  // Prevent body scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Escape to dismiss, and Tab kept inside the dialog.
  //
  // `aria-modal="true"` already hides the background from screen readers, but
  // it does nothing to the tab order: without this, Tab walks straight out of
  // an open dialog and onto the page behind it, where the user is editing a
  // form they cannot see and the modal is still covering the screen. Sighted
  // keyboard users get the worst of it — focus simply disappears.
  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const root = dialogRef.current;
      if (!root) return;

      // Queried on every keypress rather than cached on open: modal bodies
      // load data, disable buttons while saving, and reveal fields
      // conditionally, so a list captured at open time goes stale immediately.
      const focusable = [...root.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusable.length === 0) {
        // Nothing to focus: keep focus on the dialog rather than letting it
        // escape to the page behind.
        e.preventDefault();
        root.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Move focus into the dialog on open, and put it back where it came from on
  // close. Without the second half, dismissing a modal drops focus onto <body>
  // and the next Tab starts again from the top of the page — so a keyboard
  // user who opens a dialog from a table's last row is returned to the header
  // and has to travel back through the whole page.
  useEffect(() => {
    if (!isOpen) return undefined;

    const returnTo = document.activeElement;
    closeRef.current?.focus();

    return () => {
      // Only if it is still there and still focusable: the trigger is often a
      // row action, and the row may have been the thing the modal deleted.
      if (returnTo instanceof HTMLElement && document.contains(returnTo)) {
        returnTo.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`modal-content ${sizeClasses[size] || 'modal-md'}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-header">
          <h2 id={titleId} className="modal-title">{title}</h2>
          <button
            ref={closeRef}
            className="modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
