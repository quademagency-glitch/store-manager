import { useState, useEffect, useCallback } from 'react';
import { useAuthContext } from '../lib/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { api, API_BASE } from '../lib/api';
import { QRCodeSVG } from 'qrcode.react';
import { useConfirm } from '../hooks/useConfirm';
import { supabase } from '../lib/supabase';
import { PageHeader, TabPanel, Tabs } from '../components/ui';

export default function UserProfile() {
  const { user, role } = useAuthContext();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') || 'profile';
  
  const [activeTab, setActiveTab] = useState(tabParam);
  
  // Sync URL changes to local state
  useEffect(() => {
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };
  
  const [scannerToken, setScannerToken] = useState(null);
  const [isLinked, setIsLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const fetchStatus = useCallback(async () => {
    try {
      const { linked } = await api.get('/scanner/status');
      setIsLinked(linked);
      return linked;
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to check scanner status', err);
      return false;
    }
  }, []);

  const generateToken = useCallback(async () => {
    try {
      setLoading(true);
      const { token } = await api.get('/scanner/token');
      setScannerToken(token);
      setIsLinked(false);
    } catch (err) {
      setError(err.message || 'Failed to generate scanner token');
      if (import.meta.env.DEV) console.error('generateToken error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleUnlink = async () => {
    const confirmed = await confirm({ title: 'Unlink Scanner', message: 'Are you sure you want to unlink your scanner?', confirmText: 'Unlink' });
    if (confirmed) {
      try {
        setLoading(true);
        await api.post('/scanner/unlink');
        setIsLinked(false);
        await generateToken();
      } catch (err) {
        setError('Failed to unlink scanner');
        if (import.meta.env.DEV) console.error(err);
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const initialize = async () => {
      const linked = await fetchStatus();
      if (!linked) {
        await generateToken();
      } else {
        setLoading(false);
      }
    };
    initialize();
  }, [fetchStatus, generateToken]);

  // SSE connection for immediate status updates
  useEffect(() => {
    let eventSource;

    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token;
      if (!token) return;

      eventSource = new EventSource(`${API_BASE}/scanner/events?token=${token}`);

      eventSource.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.linked) {
            setIsLinked(true);
            setLoading(false);
          } else if (data && data.unlinked) {
            // Instantly regenerate code when unlinked
            await generateToken();
          }
        } catch (err) {
          if (import.meta.env.DEV) console.error('Error parsing SSE event:', err);
        }
      };

      eventSource.onerror = (err) => {
        if (import.meta.env.DEV) console.error('SSE connection error:', err);
      };
    });

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [generateToken]);

  return (
    <div className="page-container">
      <PageHeader
        title="My Profile"
        subtitle="Manage your personal settings and scanner connections."
      />

      {error && <div className="alert alert-error mb-lg"><p>{error}</p></div>}

      <div className="content-card" style={{ padding: '0' }}>
        {/* Four buttons of duplicated inline style, keyed off
            `--color-primary`, a property that was never defined, so the
            active indicator resolved to nothing and every tab looked
            inactive. */}
        <Tabs
          idPrefix="profile"
          variant="underline"
          items={[
            { id: 'profile', label: 'My Profile' },
            { id: 'password', label: 'Change Password' },
            { id: 'payslip', label: 'Download Payslip' },
            { id: 'scanner', label: 'Scanner Setup' },
          ]}
          value={activeTab}
          onChange={handleTabChange}
          ariaLabel="Profile sections"
          className="is-flush"
        />

        <div className="p-lg">
          <TabPanel idPrefix="profile" id="profile" value={activeTab}>
            <div style={{ maxWidth: '600px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '16px' }}>Profile Information</h3>
              <div className="glass-panel p-lg">
                <div className="mb-md">
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Email Address</label>
                  <div style={{ fontWeight: 500, fontSize: '1.1rem' }}>{user?.email}</div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Assigned Role</label>
                  <div className="badge badge-primary">{role}</div>
                </div>
              </div>
            </div>
          </TabPanel>

          <TabPanel idPrefix="profile" id="password" value={activeTab}>
            <div style={{ maxWidth: '400px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '16px' }}>Change Password</h3>
              <div className="glass-panel p-lg">
                <div className="form-group">
                  <label>Current Password</label>
                  <input type="password" className="input" placeholder="••••••••" />
                </div>
                <div className="form-group">
                  <label>New Password</label>
                  <input type="password" className="input" placeholder="••••••••" />
                </div>
                <div className="form-group">
                  <label>Confirm New Password</label>
                  <input type="password" className="input" placeholder="••••••••" />
                </div>
                <button className="btn btn-primary w-full">Update Password</button>
              </div>
            </div>
          </TabPanel>

          <TabPanel idPrefix="profile" id="payslip" value={activeTab}>
            <div style={{ maxWidth: '600px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '16px' }}>Payslips & Documents</h3>
              <div className="glass-panel p-lg flex justify-between items-center">
                <div>
                  <div className="font-bold">May 2026 Payslip</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Generated on June 1, 2026</div>
                </div>
                <button className="btn btn-outline">Download PDF</button>
              </div>
            </div>
          </TabPanel>

          <TabPanel idPrefix="profile" id="scanner" value={activeTab}>
            <div style={{ maxWidth: '400px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '8px' }}>Mobile Scanner Setup</h3>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px', fontSize: '0.9rem' }}>
                Link your phone to use it as a barcode/QR code scanner. Only one device can be active at a time.
              </p>

              {loading && !scannerToken ? (
                <div className="glass-panel" style={{ padding: '32px', textAlign: 'center' }}>
                  {/* Was `.loading-spinner`, which is the three-ring
                      loader's container and expects `.spinner-ring`
                      children; with none it rendered an empty box. */}
                  <div className="spinner mx-auto mb-md"></div>
                  <div className="text-muted">Generating code...</div>
                </div>
              ) : isLinked ? (
                <div className="glass-panel" style={{ background: 'color-mix(in srgb, var(--color-success) 5%, transparent)', borderColor: 'color-mix(in srgb, var(--color-success) 20%, transparent)', padding: '24px', textAlign: 'center' }}>
                  <div style={{ color: 'var(--color-success)', fontSize: '48px', marginBottom: '8px' }}>✓</div>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--color-success)', marginBottom: '4px' }}>Scanner Linked</h4>
                  <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px', fontSize: '0.9rem' }}>Your mobile device is connected.</p>
                  <button className="btn btn-outline text-error" onClick={handleUnlink}>
                    Unlink Device
                  </button>
                </div>
              ) : (
                <div className="glass-panel flex flex-col items-center p-lg">
                  <div style={{ background: 'white', padding: '12px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '16px' }}>
                    {scannerToken ? (
                      <QRCodeSVG value={scannerToken} size={140} level="M" />
                    ) : (
                      <div style={{ width: 140, height: 140, background: 'var(--color-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                        Error
                      </div>
                    )}
                  </div>
                  <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', fontSize: '0.85rem', marginBottom: '8px' }}>
                    Open the QERP Scanner app on your phone and scan this code.
                  </p>
                  <div style={{ background: 'var(--color-bg-secondary)', padding: '8px', borderRadius: '4px', fontSize: '0.75rem', wordBreak: 'break-all', marginBottom: '16px', color: 'var(--color-text-muted)' }}>
                    Raw Token (for testing): {scannerToken}
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={generateToken} disabled={loading}>
                    Regenerate Code
                  </button>
                </div>
              )}
            </div>
          </TabPanel>
        </div>
      </div>
    </div>
  );
}
