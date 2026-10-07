import { useEffect, useState, useRef } from 'react';
import { useOfflineScope } from './useOfflineScope';
import { getOperationDraft, saveOperationDraft, clearOperationDraft, scopeKey } from '../lib/idb';
import { scopedApi } from '../lib/api';

/** Persist the exact request before transmission. Retry never invents a new reference. */
export function useRecordedAction(kind, onComplete) {
  const scope = useOfflineScope();
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = scope ? `${kind}:${scopeKey(scope)}` : '';
  const currentKey = useRef(key);
  const [readyKey, setReadyKey] = useState('');
  const ready = !!key && readyKey === key;
  useEffect(() => {
    let active = true;
    currentKey.current = key;
    setReadyKey(''); setPending(null); setError('');
    if (scope) getOperationDraft(kind, scope).then(value => { if (active) { setPending(value); setReadyKey(key); } }).catch(() => { if (active) setError('Saved requests could not be read. Reload before continuing.'); });
    return () => { active = false; };
  }, [kind, scope, key]);
  async function run(path, values, method = 'post') {
    if (!scope || !ready || busy) return null;
    if (!navigator.locks) { setError('Use a current browser to save this action safely.'); return null; }
    setBusy(true); setError('');
    try {
      const result = await navigator.locks.request(`quaderp:${kind}:${scopeKey(scope)}`, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('Another tab is processing this action.');
        const previous = await getOperationDraft(kind, scope);
        const request = previous || { path, method, body: { ...values, operation_id: crypto.randomUUID() } };
        await saveOperationDraft(kind, request, scope); if (currentKey.current === key) setPending(request);
        try {
          const response = await scopedApi(scope)[request.method || 'post'](request.path, request.body);
          if (currentKey.current === key) await onComplete?.(response, request);
          await clearOperationDraft(kind, scope); if (currentKey.current === key) setPending(null);
          return response;
        } catch (err) {
          // A definitive validation rejection has not applied this request.
          if (err.body?.requestRejected || (!previous && err.status >= 400 && err.status < 500 && ![401, 403, 409].includes(err.status))) { await clearOperationDraft(kind, scope); if (currentKey.current === key) setPending(null); }
          throw err;
        }
      });
      return result;
    } catch (err) { if (currentKey.current === key) setError(err.message || 'The result could not be confirmed. Retry the saved request.'); return null; }
    finally { setBusy(false); }
  }
  return { pending, busy, error, ready, run, retry: () => pending && run(pending.path, pending.body, pending.method || 'post') };
}
