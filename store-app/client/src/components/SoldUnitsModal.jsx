import { useState, useEffect, useCallback } from 'react';
import { useAuthContext } from '../lib/AuthContext';
import { api } from '../lib/api';
import Modal from './Modal';
import { useNavigate } from 'react-router-dom';

export default function SoldUnitsModal({ isOpen, onClose, product }) {
  const { role, activeLocationId } = useAuthContext();
  const navigate = useNavigate();
  
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);

  const isBusinessAdmin = role === 'Business Admin' || role === 'Platform Admin';

  // Memoized so the effect below can depend on it by identity instead of
  // re-listing what it closes over. Its deps are the same `product` and
  // `activeLocationId` the effect used before, so when it refetches is unchanged.
  const fetchSoldUnits = useCallback(async () => {
    try {
      setLoading(true);
      const url = activeLocationId
        ? `/units/sold/${product.id}?location_id=${activeLocationId}`
        : `/units/sold/${product.id}`;

      const data = await api.get(url);
      setUnits(data);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to fetch sold units:', err);
    } finally {
      setLoading(false);
    }
  }, [product, activeLocationId]);

  useEffect(() => {
    if (isOpen && product) {
      fetchSoldUnits();
    }
  }, [isOpen, product, fetchSoldUnits]);

  const handleReceiptClick = (receiptNumber) => {
    if (isBusinessAdmin && receiptNumber) {
      // Navigate to Sales Record with the receipt number if needed, 
      // or we can just go to sales-record. The user can filter by date.
      navigate('/sales-record');
    }
  };

  if (!isOpen || !product) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Sold Units - ${product.name}`} size="large">
      <div className="mb-md">
        <p className="text-muted">Viewing history of sold items for this product. Privacy controls are enforced based on your role.</p>
      </div>

      {loading ? (
        <div className="text-center py-xl text-muted">Loading sold units...</div>
      ) : units.length === 0 ? (
        <div className="text-center py-xl text-muted">No sold units found for this product.</div>
      ) : (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
          <table className="table w-full mb-0">
            <thead style={{ background: 'var(--color-bg-primary)' }}>
              <tr>
                <th style={{ padding: '12px' }}>Sale Date</th>
                <th style={{ padding: '12px' }}>QR Code</th>
                {isBusinessAdmin && <th style={{ padding: '12px' }}>Receipt #</th>}
                {isBusinessAdmin && <th style={{ padding: '12px' }}>Customer Name</th>}
                {isBusinessAdmin && <th style={{ padding: '12px' }}>Phone Number</th>}
                {!isBusinessAdmin && <th style={{ padding: '12px' }}>Customer Code</th>}
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => (
                <tr key={unit.id} className="border-t">
                  <td style={{ padding: '12px' }}>
                    {unit.sold_at ? new Date(unit.sold_at).toLocaleString() : 'N/A'}
                  </td>
                  <td style={{ padding: '12px', fontWeight: 600, color: 'var(--color-primary)' }}>
                    {unit.qr_code}
                  </td>
                  
                  {isBusinessAdmin && (
                    <td style={{ padding: '12px' }}>
                      {unit.receipt_number ? (
                        <button 
                          onClick={() => handleReceiptClick(unit.receipt_number)}
                          style={{ background: 'none', border: 'none', color: 'var(--color-primary)', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                        >
                          {unit.receipt_number}
                        </button>
                      ) : 'N/A'}
                    </td>
                  )}
                  {isBusinessAdmin && <td style={{ padding: '12px' }}>{unit.customer_name}</td>}
                  {isBusinessAdmin && <td style={{ padding: '12px' }}>{unit.customer_phone || 'N/A'}</td>}
                  
                  {!isBusinessAdmin && (
                    <td style={{ padding: '12px', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
                      {unit.customer_code}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
