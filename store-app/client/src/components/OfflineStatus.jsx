import { useState, useEffect, useCallback } from 'react';
import { getOfflineQueue, getUnscopedQueueCount, removeFromOfflineQueue, updateOfflineQueueItem, MAX_SYNC_ATTEMPTS, scopeKey } from '../lib/idb';
import { scopedApi } from '../lib/api';
import { useOfflineScope } from '../hooks/useOfflineScope';
import WalletPending from './WalletPending';
import { useToast } from '../hooks/useToast';

export default function OfflineStatus() {
  const scope = useOfflineScope();
  const toast = useToast();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState([]);
  const [legacyCount, setLegacyCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const checkQueue = useCallback(async () => {
    setQueue(scope ? await getOfflineQueue(scope) : []);
    setLegacyCount(await getUnscopedQueueCount());
  }, [scope]);
  useEffect(() => {
    const online = () => setIsOnline(true), offline = () => setIsOnline(false);
    window.addEventListener('online', online); window.addEventListener('offline', offline);
    const check = () => checkQueue().catch(() => {});
    check(); const interval = setInterval(check, 5000);
    return () => { clearInterval(interval); window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, [checkQueue]);
  async function sync() {
    if (!scope || !navigator.onLine || isSyncing) return;
    if (!navigator.locks) { toast.error('This browser cannot safely sync payments. Use a current browser on this device.'); return; }
    setIsSyncing(true);
    try {
      await navigator.locks.request(`quaderp-sync:${scopeKey(scope)}`, { ifAvailable: true }, async lock => {
        if (!lock) { toast.warning('Another tab is syncing this branch.'); return; }
        const api = scopedApi(scope); let synced = 0, failed = 0;
        for (const item of await getOfflineQueue(scope)) {
          try {
            if (item.endpoint !== '/sales/offline-sync' || !item.payload?.stage1?.operation_id || !item.payload?.stage2?.settlement_id) {
              throw new Error('This older saved payment needs reconciliation before it can be synced.');
            }
            if (item.remoteSaleId) {
              await api.post(`/sales/${item.remoteSaleId}/finalize`, item.payload.stage2);
            } else {
              // Creation and payment commit together, with durable operation IDs.
              await api.post('/sales/offline-sync', item.payload);
            }
            await removeFromOfflineQueue(item.id, scope); synced++;
          } catch (err) {
            if (err.scopeChanged) break;
            const attempts = (item.attempts || 0) + 1;
            await updateOfflineQueueItem(item.id, { attempts, status: attempts >= MAX_SYNC_ATTEMPTS ? 'failed' : 'pending',
              errorMsg: err.message, lastAttemptAt: Date.now() }, scope);
            failed++;
            if (err.status === 401 || err.status === 403 || err.status === 409) break;
          }
        }
        await checkQueue();
        if (failed) toast.warning(`${synced} synced; ${failed} need attention and remain saved on this device.`);
        else if (synced) toast.success(`${synced} offline payments synced.`);
      });
    } catch (err) { toast.error(err.message || 'Saved payments could not be synced.'); }
    finally { setIsSyncing(false); }
  }
  const failed = queue.filter(i => i.status === 'failed');
  return <>
    <WalletPending />
    {legacyCount > 0 && <span role="status" className="offline-status-pill offline-status-pill--error" title="These older payments have no saved account or branch identity. They are preserved on this device and cannot be replayed automatically. Ask your administrator to reconcile them before clearing browser storage.">{legacyCount} older saved payments need review</span>}
    {queue.length > 0 ? <button onClick={sync} disabled={!isOnline || isSyncing || !scope}
      className={`offline-status-pill ${failed.length ? 'offline-status-pill--error' : 'offline-status-pill--ready'}`}
      title={failed.map(i => i.errorMsg).join('\n') || 'Saved payments for your account and selected branch'}>
      {isSyncing ? 'Syncing…' : failed.length ? `${failed.length} need attention — retry sync` : `Sync pending (${queue.length})`}
    </button> : !isOnline && <span className="offline-status-pill offline-status-pill--offline">Offline</span>}
  </>;
}
