import { useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../hooks/useToast';

/**
 * Where a customer gets the scanner app.
 *
 * The build used to be a public GitHub release that anyone could download. It
 * is now on the server's own disk, behind GET /api/scanner/app-download, which
 * requires a session. That endpoint reads the token from an Authorization
 * header, so a plain <a href> cannot reach it: the browser would send an
 * unauthenticated request and get a 401. Hence fetching it as a blob and
 * handing the bytes to the browser here.
 */
export default function ScannerApp() {
  const [downloading, setDownloading] = useState(false);
  const toast = useToast();

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await api.getBlob('/scanner/app-download');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'quaderp-scanner.apk';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Released on the next tick; revoking immediately cancels the download
      // in some browsers before it has read the blob.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error(err.message || 'Could not download the scanner app.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="page-container">
      <div style={{ maxWidth: '42rem' }}>
        <h1>Scanner app</h1>
        <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          Turns a phone into a barcode scanner for stock takes, deliveries and price checks.
          It signs in to this same account, so whatever a member of staff scans appears here.
        </p>

        <div style={{ margin: '1.5rem 0' }}>
          <button className="btn btn-primary" onClick={handleDownload} disabled={downloading}>
            {downloading ? 'Preparing download…' : 'Download for Android'}
          </button>
        </div>

        <h2 style={{ fontSize: '1rem' }}>Installing it</h2>
        <ol style={{ color: 'var(--color-text-secondary)', lineHeight: 1.8, paddingLeft: '1.25rem' }}>
          <li>Open this page on the phone you want to scan with, and sign in.</li>
          <li>Tap <strong>Download for Android</strong>. The file is about 80&nbsp;MB, so use wi-fi if you can.</li>
          <li>
            Android will warn that the file did not come from the Play Store. That is expected for an
            app installed directly, and you will need to allow installing from your browser once.
          </li>
          <li>Open the downloaded file to install, then sign in with the same details you use here.</li>
        </ol>

        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginTop: '1.5rem' }}>
          Android only. iPhones cannot install apps from a file, so there is no iPhone version.
        </p>
      </div>
    </div>
  );
}
