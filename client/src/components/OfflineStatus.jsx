import { useState, useEffect } from 'react';
import { getOfflineQueue, removeFromOfflineQueue } from '../lib/idb';
import { api } from '../lib/api';
import { useToast } from '../hooks/useToast';

export default function OfflineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const toast = useToast();
  const [queueCount, setQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const checkQueue = async () => {
    try {
      const q = await getOfflineQueue();
      setQueueCount(q.length);
    } catch (e) {
      if (import.meta.env.DEV) console.error('Error checking offline queue', e);
    }
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    checkQueue();
    // Periodically check queue
    const interval = setInterval(checkQueue, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const handleSync = async () => {
    if (!isOnline) {
      toast.warning('You are currently offline.');
      return;
    }
    
    setIsSyncing(true);
    try {
      const queue = await getOfflineQueue();
      if (queue.length === 0) {
        setQueueCount(0);
        setIsSyncing(false);
        return;
      }

      let successCount = 0;
      for (const item of queue) {
        try {
          if (item.endpoint === '/sales/offline-sync') {
            // Replay the two stages
            const { stage1, stage2, paymentMethod } = item.payload;
            const res = await api.post('/sales', stage1);
            const saleId = res.sale?.id || res.id;
            await api.post(`/sales/${saleId}/finalize`, stage2);
          } else {
            await api[item.method.toLowerCase()](item.endpoint, item.payload);
          }
          await removeFromOfflineQueue(item.id);
          successCount++;
        } catch (err) {
          if (import.meta.env.DEV) console.error('Failed to sync item', item, err);
        }
      }
      
      toast.success(`Successfully synced ${successCount} out of ${queue.length} offline transactions.`);
      checkQueue();
    } catch (err) {
      if (import.meta.env.DEV) console.error('Sync process failed', err);
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isOnline && queueCount === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--color-bg-secondary)', borderRadius: '16px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-warning)' }}></span>
        <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Offline</span>
      </div>
    );
  }

  if (queueCount > 0) {
    return (
      <button 
        onClick={handleSync}
        disabled={!isOnline || isSyncing}
        style={{ 
          display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', 
          background: isOnline ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', 
          borderRadius: '16px', 
          border: `1px solid ${isOnline ? '#10b981' : '#f59e0b'}`,
          cursor: isOnline && !isSyncing ? 'pointer' : 'not-allowed',
          fontSize: '0.85rem',
          color: isOnline ? '#10b981' : '#f59e0b',
          fontWeight: 600
        }}
        title={isOnline ? 'Click to sync now' : 'Waiting for connection to sync'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {isSyncing ? 'Syncing...' : `Sync Pending (${queueCount})`}
      </button>
    );
  }

  return null;
}
