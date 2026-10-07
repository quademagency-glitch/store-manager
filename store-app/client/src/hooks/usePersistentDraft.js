import { useEffect, useRef, useState } from 'react';
import { useOfflineScope } from './useOfflineScope';
import { getOperationDraft, saveOperationDraft, clearOperationDraft, scopeKey } from '../lib/idb';

export function usePersistentDraft(kind, initial, enabled) {
  const scope = useOfflineScope();
  const key = scope ? `${scopeKey(scope)}:${kind}` : '';
  const [record, setRecord] = useState(null);
  const [error, setError] = useState('');
  const writes = useRef(Promise.resolve());
  const ready = enabled && !!key && record?.key === key;
  useEffect(() => {
    let active = true;
    setRecord(null); setError('');
    if (enabled && scope) getOperationDraft(kind, scope).then(saved => {
      if (active) setRecord({ key, value: saved || initial });
    }).catch(() => { if (active) setError('The saved draft could not be read. Reload to protect your previous work.'); });
    return () => { active = false; };
  }, [enabled, key, kind, scope, initial]);
  useEffect(() => {
    if (!ready) return;
    writes.current = writes.current.catch(() => {}).then(() => saveOperationDraft(kind, record.value, scope));
    writes.current.then(() => setError('')).catch(() => setError('This draft could not be saved. Keep this page open and retry.'));
  }, [ready, record, kind, scope]);
  return { value: ready ? record.value : initial, ready, error,
    setValue: value => setRecord(previous => previous?.key !== key ? previous : {key, value: typeof value === 'function' ? value(previous.value) : value}),
    flush: () => writes.current,
    clear: async () => { await writes.current; await clearOperationDraft(kind, scope); },
  };
}
