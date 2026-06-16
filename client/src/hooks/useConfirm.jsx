import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);

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

  // Handle Escape key
  useEffect(() => {
    if (!state) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') handleCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [state, handleCancel]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="confirm-overlay" onClick={handleCancel}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
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
              <h3 className="confirm-title">{state.title}</h3>
            </div>
            <p className="confirm-message">{state.message}</p>
            <div className="confirm-actions">
              <button className="confirm-btn confirm-btn-cancel" onClick={handleCancel}>
                {state.cancelText}
              </button>
              <button
                className={`confirm-btn ${state.variant === 'danger' ? 'confirm-btn-danger' : 'confirm-btn-primary'}`}
                onClick={handleConfirm}
                autoFocus
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
