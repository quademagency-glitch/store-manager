import { useCallback, useEffect, useRef, useState } from 'react';
import { useOfflineScope } from './useOfflineScope';
import { getOperationDraft, saveOperationDraft, scopeKey } from '../lib/idb';

const EMPTY = { items: [], customer: null, parked: [], favourites: [] };
/** Unpaid baskets only. Payment attempts retain their separate authoritative journal. */
export function useBasketWorkspace() {
  const scope = useOfflineScope();
  const key = scope ? scopeKey(scope) : '';
  const [record, setRecord] = useState({ key: '', value: EMPTY });
  const [error, setError] = useState('');
  const writes = useRef(Promise.resolve());
  const ready = !!key && record.key === key;
  const workspace = ready ? record.value : EMPTY;
  useEffect(() => {
    let active = true;
    let release;
    const controller = new AbortController();
    let waitingTimer;
    setRecord({ key: '', value: EMPTY });
    setError('');
    if (!scope) return;
    if (!navigator.locks) { setError('Use a current browser to recover and save baskets safely.'); return; }
    waitingTimer = setTimeout(() => { if (active) setError('This branch basket is open in another tab. Close that tab to continue here.'); }, 1500);
    navigator.locks.request(`quaderp:baskets:${key}`, { signal: controller.signal }, async () => {
      if (!active) return;
      clearTimeout(waitingTimer); setError('');
      try {
        const value = await getOperationDraft('baskets', scope);
        if (!active) return;
        setRecord({ key, value: { ...EMPTY, ...value } });
        await new Promise(resolve => { release = resolve; });
        await writes.current.catch(() => {});
      } catch { if (active) setError('Saved baskets could not be restored. Reload before starting a sale.'); }
    }).catch(err => { if (active && err.name !== 'AbortError') setError('The basket could not be locked safely. Reload to try again.'); });
    return () => { active = false; clearTimeout(waitingTimer); controller.abort(); release?.(); };
  }, [key, scope]);
  useEffect(() => {
    if (!ready) return;
    // Serialize writes so a slower earlier save cannot replace a newer basket.
    writes.current = writes.current.catch(() => {}).then(() => saveOperationDraft('baskets', workspace, scope));
    writes.current.catch(() => setError('This basket could not be saved on this device. Keep this page open.'));
  }, [workspace, ready, scope]);
  const update = useCallback((field, value) => setRecord(previous => previous.key !== key ? previous : ({ key, value: { ...previous.value, [field]: typeof value === 'function' ? value(previous.value[field]) : value } })), [key]);
  const setItems = useCallback(value => update('items', value), [update]);
  const setCustomer = useCallback(value => update('customer', value), [update]);
  const park = () => {
    if (!workspace.items.length) return;
    setRecord(previous => ({ key, value: { ...previous.value, items: [], customer: null, parked: [...previous.value.parked, { id: crypto.randomUUID(), items: previous.value.items, customer: previous.value.customer, savedAt: Date.now() }] } }));
  };
  const resume = id => setRecord(previous => {
    const basket = previous.value.parked.find(row => row.id === id);
    if (!basket || previous.key !== key) return previous;
    const parked = previous.value.parked.filter(row => row.id !== id);
    if (previous.value.items.length) parked.push({ id: crypto.randomUUID(), items: previous.value.items, customer: previous.value.customer, savedAt: Date.now() });
    return { key, value: { ...previous.value, items: basket.items, customer: basket.customer, parked } };
  });
  return { workspace, ready, error, setItems, setCustomer, park, resume, toggleFavourite: id => update('favourites', previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]) };
}
