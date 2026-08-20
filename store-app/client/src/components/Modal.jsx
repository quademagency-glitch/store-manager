import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';

/**
 * Public API is unchanged, { isOpen, onClose, title, children, size }, * so all 32 consumers are unaffected.
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

  // Escape, focus trap, focus in on open and back on close. Shared with the
  // confirm dialog so the two cannot drift apart.
  useFocusTrap({
    active: isOpen,
    containerRef: dialogRef,
    initialFocusRef: closeRef,
    onEscape: onClose,
  });

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
