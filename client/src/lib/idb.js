import { openDB } from 'idb';

const DB_NAME = 'StoreAppDB';
const DB_VERSION = 1;

export const getDB = async () => {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('customers')) {
        db.createObjectStore('customers', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('offline_queue')) {
        db.createObjectStore('offline_queue', { keyPath: 'id', autoIncrement: true });
      }
    },
  });
};

// --- Products Cache ---
export const saveProductsToIDB = async (products) => {
  const db = await getDB();
  const tx = db.transaction('products', 'readwrite');
  const store = tx.objectStore('products');
  await store.clear();
  for (const product of products) {
    await store.put(product);
  }
  await tx.done;
};

export const getProductsFromIDB = async () => {
  const db = await getDB();
  return db.getAll('products');
};

// --- Customers Cache ---
export const saveCustomersToIDB = async (customers) => {
  const db = await getDB();
  const tx = db.transaction('customers', 'readwrite');
  const store = tx.objectStore('customers');
  await store.clear();
  for (const customer of customers) {
    await store.put(customer);
  }
  await tx.done;
};

export const getCustomersFromIDB = async () => {
  const db = await getDB();
  return db.getAll('customers');
};

// --- Offline Queue (Pending API Calls) ---
export const addToOfflineQueue = async (endpoint, method, payload) => {
  const db = await getDB();
  const item = {
    endpoint,
    method,
    payload,
    timestamp: Date.now(),
    status: 'pending' // 'pending', 'syncing', 'failed'
  };
  return db.add('offline_queue', item);
};

export const getOfflineQueue = async () => {
  const db = await getDB();
  return db.getAll('offline_queue');
};

export const removeFromOfflineQueue = async (id) => {
  const db = await getDB();
  return db.delete('offline_queue', id);
};

export const updateOfflineQueueStatus = async (id, status, errorMsg = '') => {
  const db = await getDB();
  const tx = db.transaction('offline_queue', 'readwrite');
  const store = tx.objectStore('offline_queue');
  const item = await store.get(id);
  if (item) {
    item.status = status;
    item.errorMsg = errorMsg;
    await store.put(item);
  }
  await tx.done;
};
