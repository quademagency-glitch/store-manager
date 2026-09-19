import { openDB } from 'idb';

const DB_NAME = 'StoreAppDB';
const DB_VERSION = 2;
export const MAX_SYNC_ATTEMPTS = 5;
export async function withCheckoutLock(scope, action) {
  if (!navigator.locks) throw new Error('Use a current browser to record payments safely.');
  return navigator.locks.request(`quaderp-checkout:${scopeKey(scope)}`, { ifAvailable: true }, lock => {
    if (!lock) throw new Error('Another tab is processing this checkout.');
    return action();
  });
}
export function scopeKey(scope) {
  if (!scope?.businessId || !scope?.userId || !scope?.locationId) throw new Error('Select a branch and sign in before using saved transactions.');
  return JSON.stringify([scope.businessId, scope.userId, scope.locationId]);
}
export const getDB = () => openDB(DB_NAME, DB_VERSION, {
  upgrade(db, oldVersion, _newVersion, tx) {
    if (oldVersion < 1) {
      db.createObjectStore('products', { keyPath: 'id' });
      db.createObjectStore('customers', { keyPath: 'id' });
      db.createObjectStore('offline_queue', { keyPath: 'id', autoIncrement: true });
    }
    // Old cache records have no owner. Discard cache only; preserve old payment
    // payloads quarantined in their existing queue, never attribute them to a login.
    tx.objectStore('products').clear();
    tx.objectStore('customers').clear();
    db.createObjectStore('scoped_cache', { keyPath: 'key' });
    tx.objectStore('offline_queue').createIndex('scopeKey', 'scopeKey');
  },
});
async function saveCache(kind, rows, scope) {
  const key = scopeKey(scope); const db = await getDB();
  await db.put('scoped_cache', { key: `${kind}:${key}`, rows, savedAt: Date.now() });
}
async function readCache(kind, scope) {
  const key = scopeKey(scope); const db = await getDB();
  return (await db.get('scoped_cache', `${kind}:${key}`))?.rows || [];
}
export const saveProductsToIDB = (rows, scope) => saveCache('products', rows, scope);
export const getProductsFromIDB = scope => readCache('products', scope);
export async function saveCustomersToIDB(rows, scope) {
  const key = `customers:${scopeKey(scope)}`, db = await getDB();
  const tx = db.transaction('scoped_cache', 'readwrite');
  const previous = (await tx.store.get(key))?.rows || [];
  const merged = new Map(previous.map(row => [row.id, row]));
  for (const row of rows) merged.set(row.id, row);
  await tx.store.put({ key, rows: [...merged.values()].slice(-2000), savedAt: Date.now() });
  await tx.done;
}
export const getCustomersFromIDB = scope => readCache('customers', scope);
export async function addToOfflineQueue(endpoint, method, payload, scope) {
  const key = scopeKey(scope); const db = await getDB();
  return db.add('offline_queue', { endpoint, method, payload, scope: { ...scope }, scopeKey: key,
    timestamp: Date.now(), attempts: 0, errorMsg: '', status: 'pending' });
}
export async function getOfflineQueue(scope) {
  const key = scopeKey(scope); return (await getDB()).getAllFromIndex('offline_queue', 'scopeKey', key);
}
export async function getUnscopedQueueCount() {
  return (await (await getDB()).getAll('offline_queue')).filter(item => !item.scopeKey).length;
}
async function editQueue(id, scope, patch) {
  const key = scopeKey(scope); const db = await getDB();
  const tx = db.transaction('offline_queue', 'readwrite'); const store = tx.objectStore('offline_queue');
  const item = await store.get(id);
  if (item && item.scopeKey !== key) { tx.abort(); await tx.done.catch(() => {}); throw new Error('This saved transaction belongs to another session or branch.'); }
  if (item) {
    if (patch === null) await store.delete(id);
    else await store.put({ ...item, ...patch, id: item.id, scope: item.scope, scopeKey: item.scopeKey });
  }
  await tx.done;
}
export const removeFromOfflineQueue = (id, scope) => editQueue(id, scope, null);
export const updateOfflineQueueItem = (id, patch, scope) => editQueue(id, scope, patch);
export const updateOfflineQueueStatus = (id, status, errorMsg, scope) => editQueue(id, scope, { status, errorMsg });
export const saveCheckoutDraft = (draft, scope) => saveCache('checkout', draft, scope);
export const getCheckoutDraft = async scope => {
  const row = await readCache('checkout', scope); return Array.isArray(row) ? null : row;
};
export async function clearCheckoutDraft(scope) {
  const key = scopeKey(scope); await (await getDB()).delete('scoped_cache', `checkout:${key}`);
}
export const saveOperationDraft = (kind, draft, scope) => saveCache(`operation:${kind}`, draft, scope);
export const getOperationDraft = async (kind, scope) => {
  const row = await readCache(`operation:${kind}`, scope); return Array.isArray(row) ? null : row;
};
export async function clearOperationDraft(kind, scope) {
  const key = scopeKey(scope); await (await getDB()).delete('scoped_cache', `operation:${kind}:${key}`);
}
export async function getWalletDrafts(scope) {
  const suffix = `:${scopeKey(scope)}`;
  return (await (await getDB()).getAll('scoped_cache'))
    .filter(row => row.key.startsWith('operation:wallet:') && row.key.endsWith(suffix))
    .map(row => ({ ...row.rows, kind: row.key.slice('operation:'.length, -suffix.length) }));
}
export async function getReceivingDrafts(scope) {
  const suffix = `:${scopeKey(scope)}`;
  return (await (await getDB()).getAll('scoped_cache'))
    .filter(row => row.key.startsWith('operation:receive:') && row.key.endsWith(suffix))
    .map(row => ({ purchaseOrderId: row.key.slice('operation:receive:'.length, -suffix.length), request: row.rows }));
}
