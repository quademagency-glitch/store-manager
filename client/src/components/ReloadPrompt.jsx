import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export default function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (import.meta.env.DEV) console.log('SW Registered');
    },
    onRegisterError(error) {
      if (import.meta.env.DEV) console.log('SW registration error', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      backgroundColor: 'var(--color-bg-primary)',
      color: 'var(--color-text-primary)',
      padding: '16px',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      border: '1px solid var(--color-border)'
    }}>
      <div style={{ fontSize: '14px', fontWeight: 500 }}>
        New version available!
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button 
          onClick={() => updateServiceWorker(true)}
          style={{
            padding: '6px 12px',
            backgroundColor: 'var(--color-primary)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px'
          }}
        >
          Reload
        </button>
        <button 
          onClick={() => setNeedRefresh(false)}
          style={{
            padding: '6px 12px',
            backgroundColor: 'transparent',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px'
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
