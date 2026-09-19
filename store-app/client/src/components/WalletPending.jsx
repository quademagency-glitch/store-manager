import { useState, useEffect } from 'react';
import { useOfflineScope } from '../hooks/useOfflineScope';
import { getWalletDrafts } from '../lib/idb';
import { walletPost } from '../lib/walletOperations';
import { useToast } from '../hooks/useToast';

export default function WalletPending() {
  const scope = useOfflineScope(), toast = useToast();
  const [drafts, setDrafts] = useState([]), [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => (scope ? getWalletDrafts(scope) : Promise.resolve([])).then(rows => { if (active) setDrafts(rows); }).catch(() => {});
    refresh(); window.addEventListener('wallet-operation', refresh);
    const timer = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(timer); window.removeEventListener('wallet-operation', refresh); };
  }, [scope]);
  async function resume(draft) {
    setBusy(true);
    try {
      await walletPost(scope, draft.kind, draft.endpoint, draft.payload, true);
      toast.success('Saved financial action confirmed. Balances are being refreshed.');
      window.location.reload();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  }
  return drafts.map(draft => <button key={draft.kind} className="offline-status-pill offline-status-pill--error" disabled={busy}
    title={`Amount: ${draft.payload.amount}. Retry the original saved request; this will not post it twice.`}
    onClick={() => resume(draft)}>Resume saved financial action ({draft.payload.amount ?? 'review'})</button>);
}
