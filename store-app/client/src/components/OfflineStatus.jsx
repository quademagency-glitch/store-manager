import { useState, useEffect } from 'react';
import {
  getOfflineQueue,
  removeFromOfflineQueue,
  updateOfflineQueueItem,
  MAX_SYNC_ATTEMPTS,
} from '../lib/idb';
import { api } from '../lib/api';
import { useToast } from '../hooks/useToast';

export default function OfflineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const toast = useToast();
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [failedDetail, setFailedDetail] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  const checkQueue = async () => {
    try {
      const q = await getOfflineQueue();
      const failed = q.filter((i) => i.status === 'failed');
      setPendingCount(q.length - failed.length);
      setFailedCount(failed.length);
      setFailedDetail(
        failed.length
          ? failed.map((i) => `• ${i.endpoint}: ${i.errorMsg || 'Unknown error'}`).join('\n')
          : '',
      );
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
      // Dead-lettered items are not retried automatically, they need a
      // deliberate retry so a permanently-failing item can't block the queue.
      const replayable = queue.filter((i) => i.status !== 'failed');

      if (replayable.length === 0) {
        await checkQueue();
        return;
      }

      let successCount = 0;
      let retryCount = 0;
      let deadCount = 0;

      for (const item of replayable) {
        try {
          if (item.endpoint === '/sales/offline-sync') {
            const { stage1, stage2 } = item.payload;
            // Resume at stage 2 if stage 1 already succeeded on an earlier
            // attempt. Replaying stage 1 would create a duplicate sale, the
            // remote id is persisted the moment it exists, so a failure
            // between the two stages can never double-post.
            let saleId = item.remoteSaleId;
            if (!saleId) {
              const res = await api.post('/sales', stage1);
              saleId = res.sale?.id || res.id;
              await updateOfflineQueueItem(item.id, { remoteSaleId: saleId });
            }
            try {
              await api.post(`/sales/${saleId}/finalize`, stage2);
            } catch (finalizeErr) {
              /* Stage one wrote a pending sale and this device then went away
                 for long enough that the server's sweeper reversed it and put
                 the stock back. The sale is real and still unsynced, so it has
                 to be created again rather than dead-lettered.

                 The status is checked rather than assumed, because the other
                 reason finalize fails on a non-pending sale is that it already
                 succeeded and only the response was lost. Re-posting that one
                 would charge the customer twice, which is the exact failure
                 remoteSaleId exists to prevent. */
              const existing = await api.get(`/sales/${saleId}`).catch(() => null);
              if (existing?.status === 'completed') {
                // Finalised on an earlier attempt; nothing left to do.
              } else if (existing?.status === 'voided') {
                const res = await api.post('/sales', stage1);
                saleId = res.sale?.id || res.id;
                await updateOfflineQueueItem(item.id, { remoteSaleId: saleId });
                await api.post(`/sales/${saleId}/finalize`, stage2);
              } else {
                throw finalizeErr;
              }
            }
          } else {
            await api[item.method.toLowerCase()](item.endpoint, item.payload);
          }
          await removeFromOfflineQueue(item.id);
          successCount++;
        } catch (err) {
          const attempts = (item.attempts || 0) + 1;
          const deadLettered = attempts >= MAX_SYNC_ATTEMPTS;
          await updateOfflineQueueItem(item.id, {
            attempts,
            status: deadLettered ? 'failed' : 'pending',
            errorMsg: err?.userMessage || err?.message || 'Unknown error',
            lastAttemptAt: Date.now(),
          });
          if (deadLettered) deadCount++;
          else retryCount++;
          if (import.meta.env.DEV) console.error('Failed to sync item', item, err);
        }
      }

      // Report what actually happened. A partial sync is not a success.
      if (deadCount > 0) {
        toast.error(
          `${deadCount} transaction${deadCount === 1 ? '' : 's'} could not be synced after ${MAX_SYNC_ATTEMPTS} attempts and need attention. ${successCount} synced.`,
        );
      } else if (retryCount > 0) {
        toast.warning(
          `Synced ${successCount} of ${replayable.length}. ${retryCount} will be retried, they are still saved on this device.`,
        );
      } else {
        toast.success(
          `Synced ${successCount} offline transaction${successCount === 1 ? '' : 's'}.`,
        );
      }
      await checkQueue();
    } catch (err) {
      if (import.meta.env.DEV) console.error('Sync process failed', err);
      toast.error("Couldn't sync offline transactions. They are still saved on this device.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Retry dead-lettered items: reset their counters and run a normal sync.
  const handleRetryFailed = async () => {
    const queue = await getOfflineQueue();
    await Promise.all(
      queue
        .filter((i) => i.status === 'failed')
        .map((i) => updateOfflineQueueItem(i.id, { status: 'pending', attempts: 0 })),
    );
    await checkQueue();
    handleSync();
  };

  // Dead-lettered items take priority, this is the state a user must not miss.
  if (failedCount > 0) {
    return (
      <button
        onClick={handleRetryFailed}
        disabled={!isOnline || isSyncing}
        className="offline-status-pill offline-status-pill--error"
        title={`These transactions are still saved on this device.\n\n${failedDetail}\n\nClick to retry.`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {isSyncing ? 'Retrying…' : `${failedCount} failed to sync, retry`}
      </button>
    );
  }

  if (!isOnline && pendingCount === 0) {
    return (
      <div className="offline-status-pill offline-status-pill--offline">
        <span className="offline-status-dot" aria-hidden="true"></span>
        <span>Offline</span>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <button
        onClick={handleSync}
        disabled={!isOnline || isSyncing}
        className={`offline-status-pill ${isOnline ? 'offline-status-pill--ready' : 'offline-status-pill--offline'}`}
        title={isOnline ? 'Click to sync now' : 'Waiting for connection to sync'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {isSyncing ? 'Syncing…' : `Sync pending (${pendingCount})`}
      </button>
    );
  }

  return null;
}
