import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../lib/AuthContext';
import Modal from '../components/Modal';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';

export default function AccountingApprovals() {
  const { user, role, businessId } = useAuthContext();
  const toast = useToast();
  const confirm = useConfirm();
  const [pendingEntries, setPendingEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  useEffect(() => {
    fetchPendingEntries();
  }, []);

  const fetchPendingEntries = async () => {
    try {
      setLoading(true);
      // We don't have a specific API endpoint for ONLY pending in backend, 
      // but we can query it via supabase directly since it's a simple filter,
      // or we can fetch till-balance and filter. 
      // Best to query via supabase client if RLS allows it, or we create a small api call.
      // Wait, we have RLS on business_ledger! We can query directly.
      const { data, error } = await supabase
        .from('business_ledger')
        .select(`
          id, type, amount, description, created_at, status, receipt_url, metadata, date,
          users!user_id(name, email),
          locations(name)
        `)
        .eq('business_id', businessId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPendingEntries(data || []);
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await api.put(`/ledger/${id}/approve`);
      setPendingEntries(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to approve', err);
      toast.error('Failed to approve entry.');
    }
  };

  const handleReject = async (id) => {
    const confirmed = await confirm({ title: 'Reject Entry', message: 'Are you sure you want to reject this entry?', variant: 'danger', confirmText: 'Reject' });
    if (!confirmed) return;
    try {
      await api.put(`/ledger/${id}/reject`);
      setPendingEntries(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to reject', err);
      toast.error('Failed to reject entry.');
    }
  };

  const viewReceipt = async (url) => {
    if (!url) { toast.warning('No receipt available'); return; }
    
    // Check if it's a full URL or a storage path
    if (url.startsWith('http')) {
      window.open(url, '_blank');
      return;
    }

    try {
      const { data } = supabase.storage.from('receipts').getPublicUrl(url);
      if (data?.publicUrl) {
        setSelectedReceipt(data.publicUrl);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
    }
  };

  const downloadAllReceipts = async () => {
    try {
      // Using the new API endpoint
      const response = await api.get('/ledger/download-receipts', { responseType: 'blob' });
      
      const url = window.URL.createObjectURL(new Blob([response]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `receipts_${new Date().toISOString().split('T')[0]}.zip`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to download receipts', err);
      toast.error('Failed to download receipts. There might be no receipts to download.');
    }
  };

  if (!['Manager', 'Business Admin', 'Platform Admin'].includes(role)) {
    return <div className="p-6 text-center" style={{ color: 'var(--color-text-primary)' }}>You do not have permission to view approvals.</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto" style={{ color: 'var(--color-text-primary)' }}>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Pending Accounting Approvals</h1>
          <p style={{ color: 'var(--color-text-tertiary)' }}>Review and approve ledger entries submitted by staff.</p>
        </div>
        <button 
          onClick={downloadAllReceipts}
          className="px-4 py-2 rounded shadow font-semibold flex items-center gap-2 transition-colors"
          style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Download All Receipts (ZIP)
        </button>
      </div>
      
      {loading ? <p style={{ color: 'var(--color-text-secondary)' }}>Loading...</p> : (
        <div className="rounded-xl shadow overflow-hidden" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
          {pendingEntries.length === 0 ? (
            <div className="p-12 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p className="text-lg">No pending entries to review.</p>
              <p className="text-sm mt-1">You're all caught up!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-sm uppercase tracking-wider" style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)' }}>
                    <th className="p-4 font-semibold">Date</th>
                    <th className="p-4 font-semibold">Branch</th>
                    <th className="p-4 font-semibold">Submitted By</th>
                    <th className="p-4 font-semibold">Type & Description</th>
                    <th className="p-4 font-semibold text-right">Amount</th>
                    <th className="p-4 font-semibold text-center">Receipt</th>
                    <th className="p-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody style={{ borderColor: 'var(--color-border)' }}>
                  {pendingEntries.map(entry => (
                    <tr key={entry.id} className="transition-colors" style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td className="p-4 text-sm">{entry.date}</td>
                      <td className="p-4 text-sm">{entry.locations?.name || 'Unknown'}</td>
                      <td className="p-4 text-sm">
                        <div>{entry.users?.name || 'Unknown'}</div>
                        <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{entry.users?.email}</div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span 
                            className="px-2 py-0.5 text-[10px] rounded font-bold uppercase"
                            style={{ 
                              background: entry.type === 'expense' ? 'var(--color-error-bg)' : 'rgba(34, 197, 94, 0.1)',
                              color: entry.type === 'expense' ? 'var(--color-error)' : 'var(--color-success)'
                            }}
                          >
                            {entry.type.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="text-sm">{entry.description}</div>
                        {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                          <div className="mt-2 text-xs space-y-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                            {Object.entries(entry.metadata).map(([k, v]) => (
                              <div key={k}><span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{k}:</span> {v}</div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-right font-bold text-lg">
                        ${Number(entry.amount).toFixed(2)}
                      </td>
                      <td className="p-4 text-center">
                        {entry.receipt_url ? (
                          <button 
                            onClick={() => viewReceipt(entry.receipt_url)}
                            className="text-sm font-semibold flex items-center justify-center gap-1 mx-auto"
                            style={{ color: 'var(--color-accent-primary)' }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            View
                          </button>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>None</span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => handleReject(entry.id)}
                            className="px-3 py-1.5 rounded text-sm font-semibold transition-colors"
                            style={{ background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', color: 'var(--color-error)' }}
                          >
                            Reject
                          </button>
                          <button 
                            onClick={() => handleApprove(entry.id)}
                            className="px-4 py-1.5 rounded text-sm font-semibold transition-colors shadow"
                            style={{ background: 'var(--color-success)', color: '#ffffff' }}
                          >
                            Approve
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selectedReceipt && (
        <Modal isOpen={!!selectedReceipt} onClose={() => setSelectedReceipt(null)} title="Receipt / Deposit Slip">
          <div className="p-4 flex justify-center" style={{ background: 'var(--color-bg-tertiary)' }}>
            <img src={selectedReceipt} alt="Receipt" className="max-w-full max-h-[70vh] object-contain rounded" />
          </div>
          <div className="p-4 flex justify-end" style={{ borderTop: '1px solid var(--color-border)' }}>
            <a 
              href={selectedReceipt} 
              target="_blank" 
              rel="noreferrer"
              className="px-4 py-2 rounded font-semibold text-sm"
              style={{ background: 'var(--color-accent-primary)', color: '#ffffff' }}
              download
            >
              Open Original
            </a>
          </div>
        </Modal>
      )}
    </div>
  );
}
