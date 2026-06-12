import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthContext } from '../lib/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { QRCodeSVG } from 'qrcode.react';
import { useConfirm } from '../hooks/useConfirm';

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
  
  const pollInterval = useRef(null);

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

  // Polling for status when a token is generated and not linked
  useEffect(() => {
    if (scannerToken && !isLinked) {
      pollInterval.current = setInterval(async () => {
        const linked = await fetchStatus();
        if (linked) {
          clearInterval(pollInterval.current);
        }
      }, 3000);
    }
    
    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
      }
    };
  }, [scannerToken, isLinked, fetchStatus]);

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1 className="page-title">My Profile</h1>
          <p className="page-subtitle">Manage your personal settings and scanner connections.</p>
        </div>
      </header>

      {error && <div className="alert alert-error mb-lg"><p>{error}</p></div>}

      <div className="content-card" style={{ padding: '0' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', overflowX: 'auto' }}>
          <button 
            style={{ padding: '16px 24px', background: activeTab === 'profile' ? 'transparent' : 'transparent', border: 'none', borderBottom: activeTab === 'profile' ? '2px solid var(--color-primary)' : '2px solid transparent', fontWeight: activeTab === 'profile' ? '600' : '500', color: activeTab === 'profile' ? 'var(--color-primary)' : 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '1rem', whiteSpace: 'nowrap' }}
            onClick={() => handleTabChange('profile')}
          >
            My Profile
          </button>
          <button 
            style={{ padding: '16px 24px', background: activeTab === 'password' ? 'transparent' : 'transparent', border: 'none', borderBottom: activeTab === 'password' ? '2px solid var(--color-primary)' : '2px solid transparent', fontWeight: activeTab === 'password' ? '600' : '500', color: activeTab === 'password' ? 'var(--color-primary)' : 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '1rem', whiteSpace: 'nowrap' }}
            onClick={() => handleTabChange('password')}
          >
            Change Password
          </button>
          <button 
            style={{ padding: '16px 24px', background: activeTab === 'payslip' ? 'transparent' : 'transparent', border: 'none', borderBottom: activeTab === 'payslip' ? '2px solid var(--color-primary)' : '2px solid transparent', fontWeight: activeTab === 'payslip' ? '600' : '500', color: activeTab === 'payslip' ? 'var(--color-primary)' : 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '1rem', whiteSpace: 'nowrap' }}
            onClick={() => handleTabChange('payslip')}
          >
            Download Payslip
          </button>
          <button 
            style={{ padding: '16px 24px', background: activeTab === 'scanner' ? 'transparent' : 'transparent', border: 'none', borderBottom: activeTab === 'scanner' ? '2px solid var(--color-primary)' : '2px solid transparent', fontWeight: activeTab === 'scanner' ? '600' : '500', color: activeTab === 'scanner' ? 'var(--color-primary)' : 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '1rem', whiteSpace: 'nowrap' }}
            onClick={() => handleTabChange('scanner')}
          >
            Scanner Setup
          </button>
        </div>

        <div style={{ padding: '24px' }}>
          {activeTab === 'profile' && (
            <div style={{ maxWidth: '600px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '16px' }}>Profile Information</h3>
              <div className="glass-panel" style={{ padding: '24px' }}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Email Address</label>
                  <div style={{ fontWeight: 500, fontSize: '1.1rem' }}>{user?.email}</div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Assigned Role</label>
                  <div className="badge badge-primary">{role}</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'password' && (
            <div style={{ maxWidth: '400px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '16px' }}>Change Password</h3>
              <div className="glass-panel" style={{ padding: '24px' }}>
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
                <button className="btn btn-primary" style={{ width: '100%' }}>Update Password</button>
              </div>
            </div>
          )}

          {activeTab === 'payslip' && (
            <div style={{ maxWidth: '600px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '16px' }}>Payslips & Documents</h3>
              <div className="glass-panel" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>May 2026 Payslip</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Generated on June 1, 2026</div>
                </div>
                <button className="btn btn-outline">Download PDF</button>
              </div>
            </div>
          )}

          {activeTab === 'scanner' && (
            <div style={{ maxWidth: '400px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '8px' }}>Mobile Scanner Setup</h3>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px', fontSize: '0.9rem' }}>
                Link your phone to use it as a barcode/QR code scanner. Only one device can be active at a time.
              </p>

              {loading && !scannerToken ? (
                <div className="glass-panel" style={{ padding: '32px', textAlign: 'center' }}>
                  <div className="loading-spinner" style={{ width: '24px', height: '24px', display: 'inline-block', marginBottom: '16px' }}></div>
                  <div className="text-muted">Generating code...</div>
                </div>
              ) : isLinked ? (
                <div className="glass-panel" style={{ background: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16, 185, 129, 0.2)', padding: '24px', textAlign: 'center' }}>
                  <div style={{ color: '#10b981', fontSize: '48px', marginBottom: '8px' }}>✓</div>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#047857', marginBottom: '4px' }}>Scanner Linked</h4>
                  <p style={{ color: '#065f46', marginBottom: '24px', fontSize: '0.9rem' }}>Your mobile device is connected.</p>
                  <button className="btn btn-outline text-error" onClick={handleUnlink}>
                    Unlink Device
                  </button>
                </div>
              ) : (
                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px' }}>
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
          )}
        </div>
      </div>
    </div>
  );
}
