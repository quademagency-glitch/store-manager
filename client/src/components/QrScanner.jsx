import { useEffect } from 'react';
import { api } from '../lib/api';

/**
 * QrScanner — External Scanner App listener component.
 * Polls the backend for scanned QR codes from the linked mobile app.
 * 
 * Props:
 *  - onScan(decodedText): Called when a QR code is successfully scanned.
 *  - onClose(): Called when the user closes the scanner modal.
 *  - isOpen: Boolean to show/hide the scanner overlay.
 */
export default function QrScanner({ onScan, onClose, isOpen }) {
  useEffect(() => {
    if (!isOpen) return;

    let pollInterval = null;

    // Start polling the backend for external scanner app events
    pollInterval = setInterval(async () => {
      try {
        const res = await api.get('/scanner/poll');
        if (res && res.scanned && res.qr_code) {
          clearInterval(pollInterval);
          onScan(res.qr_code);
        }
      } catch (err) {
        // Ignore polling errors
      }
    }, 1500);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isOpen, onScan]);

  if (!isOpen) return null;

  return (
    <div className="qr-scanner-overlay" onClick={onClose}>
      <div className="qr-scanner-container" onClick={e => e.stopPropagation()}>
        <div className="qr-scanner-header">
          <h3>Scan QR Code</h3>
          <button className="btn-icon" onClick={onClose} aria-label="Close scanner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          <div className="spinner" style={{ margin: '0 auto 1.5rem', width: '40px', height: '40px', borderTopColor: 'var(--color-primary)' }}></div>
          <p className="qr-scanner-hint" style={{ fontSize: '1.1rem', color: 'var(--color-text)' }}>
            Waiting for external Scanner App...
          </p>
          <p className="text-muted" style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
            Please scan the item using your linked mobile device.
          </p>
        </div>
      </div>
    </div>
  );
}
