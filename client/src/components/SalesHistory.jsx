import { useState, useEffect } from 'react';
import { useSales } from '../hooks/useSales';
import { useAuthContext } from '../lib/AuthContext';
import Modal from './Modal';

export default function SalesHistory() {
  const { sales, fetchSales, voidSale, approveVoid, rejectVoid, deleteSale, loading } = useSales();
  const { user } = useAuthContext();
  const [pinModal, setPinModal] = useState({ isOpen: false, saleId: null, pin: '' });

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  const handleVoidClick = (saleId) => {
    if (user?.role === 'Manager' || user?.role === 'Business Admin' || user?.role === 'Platform Admin') {
      // Immediate void without PIN since they are already a manager
      if (window.confirm('Are you sure you want to void this sale? This action cannot be undone.')) {
        processVoid(saleId, null);
      }
    } else {
      // Open PIN modal for cashiers
      setPinModal({ isOpen: true, saleId, pin: '' });
    }
  };

  const processVoid = async (saleId, pin) => {
    const res = await voidSale(saleId, pin);
    if (res.success) {
      if (res.status === 'void_pending') {
        alert('Void request submitted for manager approval.');
      } else {
        alert('Sale voided successfully.');
      }
      fetchSales(); 
    } else {
      alert(res.error || 'Failed to void sale');
    }
  };

  const handlePinSubmit = (e) => {
    e.preventDefault();
    processVoid(pinModal.saleId, pinModal.pin);
    setPinModal({ isOpen: false, saleId: null, pin: '' });
  };

  const requestApprovalVoid = () => {
    processVoid(pinModal.saleId, null);
    setPinModal({ isOpen: false, saleId: null, pin: '' });
  };

  const handleApproveVoid = async (saleId) => {
    const res = await approveVoid(saleId);
    if (res.success) alert('Void approved.');
    else alert(res.error || 'Failed to approve void.');
  };

  const handleRejectVoid = async (saleId) => {
    const res = await rejectVoid(saleId);
    if (res.success) alert('Void rejected.');
    else alert(res.error || 'Failed to reject void.');
  };

  const handleDelete = async (saleId) => {
    if (window.confirm('Are you sure you want to PERMANENTLY delete this sale? This will remove all records.')) {
      const res = await deleteSale(saleId);
      if (res.success) {
        alert('Sale deleted successfully.');
      } else {
        alert(res.error || 'Failed to delete sale');
      }
    }
  };

  const fmt = (amount) => `$${Number(amount).toFixed(2)}`;
  const formatTime = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  };

  const canVoid = (sale) => {
    if (sale.status === 'voided' || sale.status === 'void_pending') return false;
    // Anyone who made the sale or managers can initiate a void
    return user?.role === 'Platform Admin' || user?.role === 'Business Admin' || user?.role === 'Manager' || user?.id === sale.salesperson_id;
  };

  const isManager = user?.role === 'Business Admin' || user?.role === 'Platform Admin' || user?.role === 'Manager';

  const canDelete = () => {
    return user?.role === 'Business Admin' || user?.role === 'Platform Admin';
  };

  return (
    <div className="glass-panel" style={{ marginTop: '1rem' }}>
      <table className="glass-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Receipt #</th>
            <th>Salesperson</th>
            <th>Total</th>
            <th>Payment</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan="7" className="text-center py-xl text-muted">
                <div className="spinner mx-auto mb-sm"></div>
                <p>Loading sales history...</p>
              </td>
            </tr>
          ) : sales.length === 0 ? (
            <tr>
              <td colSpan="7" style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                <p>No past sales found.</p>
              </td>
            </tr>
          ) : (
            sales.map(sale => (
              <tr key={sale.id} style={{ opacity: sale.status === 'voided' ? 0.6 : 1 }}>
                <td className="text-muted">{formatTime(sale.created_at)}</td>
                <td className="font-mono text-sm">{sale.id.slice(0, 8).toUpperCase()}</td>
                <td>{sale.salesperson?.name || sale.salesperson?.email || 'Unknown'}</td>
                <td className="font-bold">{fmt(sale.total_amount)}</td>
                <td>
                  <span className="badge badge-neutral">
                    {sale.payment_method}
                  </span>
                </td>
                <td>
                  {sale.status === 'voided' ? (
                    <span className="badge badge-error">Voided</span>
                  ) : sale.status === 'void_pending' ? (
                    <span className="badge badge-warning" style={{ background: '#fef08a', color: '#854d0e' }}>Pending Void</span>
                  ) : (
                    <span className="badge badge-success">Completed</span>
                  )}
                </td>
                <td>
                  {canVoid(sale) && (
                    <button 
                      className="btn btn-sm btn-outline text-warning mr-sm"
                      onClick={() => handleVoidClick(sale.id)}
                    >
                      Void
                    </button>
                  )}
                  {sale.status === 'void_pending' && isManager && (
                    <>
                      <button className="btn btn-sm btn-outline mr-sm" onClick={() => handleApproveVoid(sale.id)}>Approve</button>
                      <button className="btn btn-sm btn-outline text-error mr-sm" onClick={() => handleRejectVoid(sale.id)}>Reject</button>
                    </>
                  )}
                  {canDelete() && (
                    <button 
                      className="btn btn-sm btn-outline text-error"
                      onClick={() => handleDelete(sale.id)}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <Modal isOpen={pinModal.isOpen} onClose={() => setPinModal({ isOpen: false, saleId: null, pin: '' })} title="Authorize Void">
        <form onSubmit={handlePinSubmit} className="form-layout">
          <p style={{ marginBottom: '16px', fontSize: '0.875rem', color: '#475569' }}>
            To void this sale immediately, a manager must enter their PIN. Otherwise, you can submit this void request for manager approval.
          </p>
          <div className="form-group">
            <label>Manager PIN</label>
            <input 
              type="password" 
              className="form-input" 
              value={pinModal.pin} 
              onChange={(e) => setPinModal({...pinModal, pin: e.target.value})}
              placeholder="Enter PIN"
              autoFocus
            />
          </div>
          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
            <button type="button" className="btn btn-outline" onClick={requestApprovalVoid}>
              Submit for Approval
            </button>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setPinModal({ isOpen: false, saleId: null, pin: '' })}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={!pinModal.pin}>Override & Void</button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
