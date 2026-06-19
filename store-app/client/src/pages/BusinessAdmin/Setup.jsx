import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useToast } from '../../hooks/useToast';

export default function Setup() {
  const navigate = useNavigate();
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/businesses/me/setup-status');
      setStatus(res);
    } catch (err) {
      toast.error(err.message || 'Failed to load setup status');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleInstallStarterPack = async () => {
    setInstalling(true);
    try {
      const res = await api.post('/accounting/templates/starter-pack');
      toast.success(res.message);
      loadStatus();
    } catch (err) {
      toast.error(err.message || 'Failed to install starter pack');
    } finally {
      setInstalling(false);
    }
  };

  if (loading) return <div className="p-xl text-center">Loading setup checklist...</div>;
  if (!status) return null;

  const completeCount = status.steps.filter(s => s.complete).length;

  return (
    <div>
      <header className="dashboard-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="dashboard-title">Setup Checklist</h1>
          <p className="dashboard-subtitle">
            {completeCount} of {status.steps.length} steps complete. Especially useful if you're moving an
            existing business onto this system — import your existing data instead of re-entering it by hand.
          </p>
        </div>
      </header>

      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        {status.steps.map((step, i) => (
          <div
            key={step.key}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '20px 24px',
              borderBottom: i < status.steps.length - 1 ? '1px solid var(--color-border)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: step.complete ? 'var(--color-success)' : 'var(--color-bg-tertiary)',
                  color: step.complete ? '#fff' : 'var(--color-text-secondary)',
                  border: step.complete ? 'none' : '1px solid var(--color-border)',
                  fontWeight: 700, fontSize: '0.9rem',
                }}
              >
                {step.complete ? '✓' : i + 1}
              </div>
              <span style={{ fontWeight: 500, textDecoration: step.complete ? 'line-through' : 'none', color: step.complete ? 'var(--color-text-secondary)' : 'inherit' }}>
                {step.label}
              </span>
            </div>

            {!step.complete && step.key === 'accounting_templates' ? (
              <button className="btn btn-sm btn-primary" onClick={handleInstallStarterPack} disabled={installing}>
                {installing ? 'Installing...' : 'Install Starter Pack'}
              </button>
            ) : !step.complete ? (
              <button className="btn btn-sm btn-outline" onClick={() => navigate(step.actionPath)}>
                Go
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
