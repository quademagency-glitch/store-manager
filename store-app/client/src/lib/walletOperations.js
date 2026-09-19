import { scopedApi } from './api';
import { scopeKey, getOperationDraft, saveOperationDraft, clearOperationDraft } from './idb';

const endpoints = ['/financial-reviews', '/loyalty/store-credit', '/loyalty/store-credit/withdraw', '/loyalty/gift-cards', '/loyalty/gift-cards/redeem'];
const changed = () => window.dispatchEvent(new Event('wallet-operation'));
export async function walletPost(scope, kind, endpoint, payload, resume = false) {
  if (!navigator.locks) throw new Error('Use a current browser to record wallet payments safely.');
  if (!kind.startsWith('wallet:') || !endpoints.includes(endpoint)) throw new Error('Unknown wallet action.');
  return navigator.locks.request(`quaderp:${scopeKey(scope)}:${kind}`, { ifAvailable: true }, async lock => {
    if (!lock) throw new Error('Another tab is processing this wallet action.');
    let draft = await getOperationDraft(kind, scope);
    const retrying = !!draft;
    if (draft && !resume) throw new Error('Resume the saved financial action at the top of the page before starting another.');
    if (resume && !draft) throw new Error('This saved action has already been completed. Refresh the page.');
    if (!draft) {
      draft = { endpoint, payload: { ...payload, operation_id: crypto.randomUUID() }, savedAt: Date.now() };
      await saveOperationDraft(kind, draft, scope);
    }
    if (draft.endpoint !== endpoint) throw new Error('Saved action does not match this request.');
    changed();
    try {
      const result = await scopedApi(scope).post(endpoint, draft.payload);
      await clearOperationDraft(kind, scope);
      return result;
    } catch (err) {
      // A deliberate rejection proves this request did not commit. A lost
      // response or reference conflict must remain available for exact retry.
      if (!retrying && err.status >= 400 && err.status < 500 && ![401,403,409].includes(err.status)) await clearOperationDraft(kind, scope);
      throw err;
    } finally { changed(); }
  });
}
