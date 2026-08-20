import { createContext, useContext, useState, useCallback, useRef, useId } from 'react';
import { useFocusTrap } from './useFocusTrap';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const titleId = useId();
  const messageId = useId();

  const confirm = useCallback(({ title, message, confirmText, cancelText, variant } = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({
        title: title || 'Confirm',
        message: message || 'Are you sure?',
        confirmText: confirmText || 'Confirm',
        cancelText: cancelText || 'Cancel',
        variant: variant || 'default', // 'default' | 'danger'
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true);
    setState(null);
  }, []);

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false);
    setState(null);
  }, []);

  // Escape, focus trap, focus in on open and back on close.
  //
  // Escape was already handled; the trap and the return were not, so Tab
  // walked out of an open confirmation onto the page behind it. That matters
  // more here than in an ordinary modal: this dialog is the last thing between
  // a keystroke and a deletion, and a user who cannot tell where focus is
  // cannot tell what Enter is about to do.
  //
  // Focus goes to CANCEL, not to the confirm button. It used to sit on confirm
  // via autoFocus, which meant a delete dialog opened with "Delete" already
  // focused and a reflexive Enter or Space destroyed data with no further
  // interaction. The safe choice gets the focus; choosing the destructive one
  // should take a deliberate movement.
  useFocusTrap({
    active: Boolean(state),
    containerRef: dialogRef,
    initialFocusRef: cancelRef,
    onEscape: handleCancel,
  });

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="confirm-overlay" onClick={handleCancel}>
          <div
            ref={dialogRef}
            className="confirm-dialog"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={messageId}
            tabIndex={-1}
          >
            <div className="confirm-header">
              <div className={`confirm-icon ${state.variant === 'danger' ? 'confirm-icon-danger' : 'confirm-icon-default'}`}>
                {state.variant === 'danger' ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                )}
              </div>
              <h3 id={titleId} className="confirm-title">{state.title}</h3>
            </div>
            <p id={messageId} className="confirm-message">{state.message}</p>
            <div className="confirm-actions">
              <button ref={cancelRef} className="confirm-btn confirm-btn-cancel" onClick={handleCancel}>
                {state.cancelText}
              </button>
              <button
                className={`confirm-btn ${state.variant === 'danger' ? 'confirm-btn-danger' : 'confirm-btn-primary'}`}
                onClick={handleConfirm}
              >
                {state.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}
