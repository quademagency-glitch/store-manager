import { useState } from 'react';
import { api } from '../../../lib/api';
import { whatsappUrl, receiptMessage } from '../../../lib/whatsapp';

/**
 * Share a receipt on WhatsApp in two steps: prepare the message (and, if
 * chosen, a private link to the receipt), then open WhatsApp to send it.
 * Two steps because a phone blocks a new window opened after a network
 * request, and because the cashier should see what will be sent.
 *
 * Offline receipts have no server sale yet, so there is nothing to link to.
 */
export default function ShareReceipt({ receipt, business, fmt }) {
  const [withLink, setWithLink] = useState(true);
  const [prepared, setPrepared] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const phone = receipt?.customer?.phone;
  const online = receipt?.id && !String(receipt.receipt_number || '').startsWith('OFFLINE-');
  if (!phone || !online) return null;

  const prepare = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      let link = null;
      if (withLink) {
        const created = await api.post('/receipt-links', { sale_id: receipt.id });
        link = `${window.location.origin}/r/${created.token}`;
      }
      const url = whatsappUrl(phone, receiptMessage({ receipt, business, fmt, link }), business);
      if (!url) throw new Error("This customer's phone number cannot be used on WhatsApp.");
      setPrepared({ url, link });
    } catch (err) {
      setError(err.message || 'The message could not be prepared.');
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true); setError('');
    try {
      const res = await api.delete(`/receipt-links?sale_id=${receipt.id}`);
      setPrepared(null);
      setNotice(`Withdrawn: ${res?.revoked ?? 0} link${res?.revoked === 1 ? '' : 's'} for this receipt no longer open.`);
    } catch (err) {
      setError(err.message || 'The links could not be withdrawn.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="receipt-share" aria-label="Share receipt on WhatsApp" role="group">
      {!prepared ? (
        <>
          <label className="receipt-share-option">
            <input type="checkbox" checked={withLink} onChange={(e) => setWithLink(e.target.checked)} />
            Include a private link to this receipt (expires in 30 days)
          </label>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={prepare}>
            {busy ? 'Preparing…' : 'Share on WhatsApp'}
          </button>
        </>
      ) : (
        <>
          <a className="btn btn-primary" href={prepared.url} target="_blank" rel="noopener noreferrer">
            Open WhatsApp to send
          </a>
          {prepared.link && (
            <button type="button" className="btn btn-secondary" onClick={() => navigator.clipboard?.writeText(prepared.link).then(() => setNotice('Link copied.'), () => setNotice(prepared.link))}>
              Copy link
            </button>
          )}
        </>
      )}
      {(prepared?.link || notice.startsWith('Link')) && (
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={withdraw}>Withdraw receipt links</button>
      )}
      {notice && <p role="status" className="receipt-share-status">{notice}</p>}
      {error && <p role="alert" className="receipt-share-error">{error}</p>}
    </div>
  );
}
