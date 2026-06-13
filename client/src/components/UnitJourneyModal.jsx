import { useState, useEffect } from 'react';
import Modal from './Modal';
import { api } from '../lib/api';

export default function UnitJourneyModal({ isOpen, onClose, unitId, productId, locationId }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [journey, setJourney] = useState(null);

  const fetchJourney = async () => {
    setLoading(true);
    setError('');
    try {
      const qs = unitId === 'untracked' && productId && locationId
        ? `?product_id=${productId}&location_id=${locationId}`
        : '';
      const data = await api.get(`/units/${unitId}/journey${qs}`);
      setJourney(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch journey');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && unitId) {
      fetchJourney();
    }
  }, [isOpen, unitId, productId, locationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatDate = (isoStr) => {
    if (!isoStr) return 'N/A';
    return new Date(isoStr).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Product Unit Journey" size="lg">
      {loading && <div className="text-center py-xl text-muted">Loading journey data...</div>}
      {error && <div className="alert alert-error mb-lg"><p>{error}</p></div>}
      
      {!loading && journey && (
        <div>
          {/* Header */}
          <div style={{ marginBottom: '24px', padding: '16px', background: 'var(--color-bg-tertiary)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
            <h3 style={{ margin: '0 0 8px 0' }}>{journey.product?.name || 'Unknown Product'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Serial Number</div>
                <div style={{ fontWeight: '500' }}>{journey.serial_number || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Product Code</div>
                <div style={{ fontWeight: '500' }}>{journey.product_code || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Status</div>
                <div style={{ fontWeight: '500', textTransform: 'capitalize' }}>
                  <span className={`badge ${journey.status === 'in_stock' ? 'badge-success' : 'badge-warning'}`}>
                    {journey.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Current Location</div>
                <div style={{ fontWeight: '500' }}>{journey.location?.name || 'Unknown'}</div>
              </div>
            </div>
          </div>

          {/* Journey Timeline */}
          <div className="journey-timeline" style={{ position: 'relative', paddingLeft: '24px' }}>
            {/* 1. Supplier / Procurement */}
            <div style={{ position: 'relative', paddingBottom: '24px' }}>
              <div style={{ position: 'absolute', left: '-24px', top: '0', bottom: '0', width: '2px', background: 'var(--color-border)' }}></div>
              <div style={{ position: 'absolute', left: '-29px', top: '4px', width: '12px', height: '12px', borderRadius: '50%', background: 'var(--color-primary)', border: '2px solid white' }}></div>
              <h4 style={{ margin: '0 0 4px 0', color: 'var(--color-primary)' }}>Supplier (Procurement)</h4>
              {journey.supplier ? (
                <div style={{ background: 'var(--color-bg-card)', padding: '12px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                  <p style={{ margin: '0 0 4px 0', fontWeight: '500' }}>{journey.supplier.name}</p>
                  {journey.supplier.contact_person && <p style={{ margin: '0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Contact: {journey.supplier.contact_person}</p>}
                  {journey.supplier.phone && <p style={{ margin: '0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Phone: {journey.supplier.phone}</p>}
                </div>
              ) : (
                <p style={{ margin: '0', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No preferred supplier configured for this location.</p>
              )}
            </div>

            {/* 2. Receipt / Assignment */}
            <div style={{ position: 'relative', paddingBottom: '24px' }}>
              <div style={{ position: 'absolute', left: '-24px', top: '0', bottom: '0', width: '2px', background: 'var(--color-border)' }}></div>
              <div style={{ position: 'absolute', left: '-29px', top: '4px', width: '12px', height: '12px', borderRadius: '50%', background: journey.status === 'untracked' ? 'var(--color-text-muted)' : 'var(--color-success)', border: '2px solid white' }}></div>
              <h4 style={{ margin: '0 0 4px 0', color: journey.status === 'untracked' ? 'var(--color-text-muted)' : 'var(--color-success)' }}>
                {journey.status === 'untracked' ? 'Pending Assignment' : 'Received & Assigned'}
              </h4>
              <div style={{ background: 'var(--color-bg-card)', padding: '12px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                {journey.status === 'untracked' ? (
                  <p style={{ margin: '0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>This item has not yet been assigned tracking codes in the system.</p>
                ) : (
                  <>
                    <p style={{ margin: '0 0 4px 0', fontWeight: '500' }}>Added to Inventory</p>
                    <p style={{ margin: '0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Date: {formatDate(journey.assigned_at)}</p>
                    <p style={{ margin: '0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Assigned By: {journey.assigned_by?.name || journey.assigned_by?.email || 'System'}</p>
                  </>
                )}
              </div>
            </div>

            {/* 3. Sale (if sold) */}
            {journey.status === 'sold' && journey.sale && (
              <div style={{ position: 'relative', paddingBottom: '24px' }}>
                <div style={{ position: 'absolute', left: '-29px', top: '4px', width: '12px', height: '12px', borderRadius: '50%', background: 'var(--color-warning)', border: '2px solid white' }}></div>
                <h4 style={{ margin: '0 0 4px 0', color: 'var(--color-warning)' }}>Sold</h4>
                <div style={{ background: 'var(--color-bg-card)', padding: '12px', borderRadius: '6px', border: '1px solid var(--color-warning-border)' }}>
                  <p style={{ margin: '0 0 4px 0', fontWeight: '500' }}>Customer: {journey.sale.customer_name || 'Walk-in'}</p>
                  <p style={{ margin: '0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Date: {formatDate(journey.sold_at)}</p>
                  {journey.sale.receipt_number && <p style={{ margin: '0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Receipt: {journey.sale.receipt_number}</p>}
                  {journey.sale.customer_phone && <p style={{ margin: '0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Phone: {journey.sale.customer_phone}</p>}
                </div>
              </div>
            )}
          </div>

        </div>
      )}
      
      <div style={{ marginTop: '24px', textAlign: 'right' }}>
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
