import { useEffect, useRef, useState } from 'react';

/**
 * QrScanner — Reusable camera-based QR code scanner component.
 * Uses html5-qrcode under the hood.
 * 
 * Props:
 *  - onScan(decodedText): Called when a QR code is successfully scanned.
 *  - onClose(): Called when the user closes the scanner.
 *  - isOpen: Boolean to show/hide the scanner overlay.
 */
export default function QrScanner({ onScan, onClose, isOpen }) {
  const scannerRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const [error, setError] = useState('');
  const [hasCamera, setHasCamera] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    let scanner = null;

    const startScanner = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        
        scanner = new Html5Qrcode('qr-scanner-region');
        html5QrCodeRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            // Stop scanning after a successful read
            scanner.stop().then(() => {
              html5QrCodeRef.current = null;
              onScan(decodedText);
            }).catch(() => {});
          },
          () => {
            // Ignore scan failures (no QR in frame)
          }
        );
      } catch (err) {
        console.error('QR Scanner error:', err);
        if (err.toString().includes('NotAllowedError') || err.toString().includes('Permission')) {
          setError('Camera access denied. Please allow camera permissions in your browser settings.');
        } else if (err.toString().includes('NotFoundError')) {
          setHasCamera(false);
          setError('No camera found on this device.');
        } else {
          setError('Failed to start camera. Please try again.');
        }
      }
    };

    startScanner();

    return () => {
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.stop().then(() => {
          html5QrCodeRef.current = null;
        }).catch(() => {});
      }
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

        {error ? (
          <div className="qr-scanner-error">
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📷</div>
            <p>{error}</p>
            <button className="btn btn-secondary" onClick={onClose} style={{ marginTop: '1rem' }}>
              Close
            </button>
          </div>
        ) : (
          <>
            <div id="qr-scanner-region" ref={scannerRef} className="qr-scanner-region" />
            <p className="qr-scanner-hint">
              Point your camera at a product's QR label
            </p>
          </>
        )}
      </div>
    </div>
  );
}
