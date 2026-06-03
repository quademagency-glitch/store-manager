import { useEffect } from 'react';
import { useSales } from '../hooks/useSales';
import { useAuthContext } from '../lib/AuthContext';

export default function SalesHistory() {
  const { sales, fetchSales, voidSale, loading } = useSales();
  const { user } = useAuthContext();

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  const handleVoid = async (saleId) => {
    if (window.confirm('Are you sure you want to void this sale? This action cannot be undone.')) {
      const res = await voidSale(saleId);
      if (res.success) {
        alert('Sale voided successfully.');
        fetchSales(); // Refresh to update status
      } else {
        alert(res.error || 'Failed to void sale');
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

  // Only managers or admins can void, or the salesperson who made the sale (if allowed by business logic).
  // We'll allow platform admins, business admins, managers, and the salesperson.
  const canVoid = (sale) => {
    if (sale.status === 'voided') return false;
    if (user?.role === 'Platform Admin' || user?.role === 'Business Admin' || user?.role === 'Manager') return true;
    if (user?.id === sale.salesperson_id) return true;
    return false;
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
                  ) : (
                    <span className="badge badge-success">Completed</span>
                  )}
                </td>
                <td>
                  {canVoid(sale) && (
                    <button 
                      className="btn btn-sm btn-outline text-error"
                      onClick={() => handleVoid(sale.id)}
                    >
                      Void Sale
                    </button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
