import Modal from '../../../components/Modal';

export default function ReceiptModal({ isOpen, onClose, receiptData, fmt, actions }) {
  if (!receiptData) return null;

  const handlePrint = () => {
    // In a real app, this would generate a PDF or trigger ESC/POS bluetooth printing
    window.print();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Transaction Details" size="medium">
      <div style={{ padding: '24px', background: 'var(--color-bg-primary)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        {/* The Receipt Itself */}
        <div 
          className="receipt-container" 
          id="printable-receipt" 
          style={{ 
            padding: '32px', 
            background: '#fff', 
            color: '#1e293b', 
            fontFamily: '"Courier New", Courier, monospace', 
            width: '100%', 
            maxWidth: '400px', 
            boxShadow: '0 20px 40px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.05)', 
            borderRadius: '4px',
            position: 'relative'
          }}
        >
          {/* Jagged Edge effect top & bottom using CSS gradients (optional, we'll keep it clean) */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase' }}>STORE APP</h2>
            <p style={{ margin: '8px 0 0 0', fontSize: '0.9rem', color: '#64748b' }}>Receipt #{receiptData.receipt_number}</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
              {new Date(receiptData.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>
          
          <div style={{ borderBottom: '2px dashed #cbd5e1', margin: '16px 0' }}></div>
          
          <table style={{ width: '100%', marginBottom: '16px', textAlign: 'left', fontSize: '0.95rem' }}>
            <thead>
              <tr>
                <th style={{ paddingBottom: '8px', color: '#64748b', fontWeight: 600 }}>Item</th>
                <th style={{ textAlign: 'center', paddingBottom: '8px', color: '#64748b', fontWeight: 600 }}>Qty</th>
                <th style={{ textAlign: 'right', paddingBottom: '8px', color: '#64748b', fontWeight: 600 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {receiptData.sale_items.map((item, idx) => (
                <tr key={idx}>
                  <td style={{ paddingTop: '8px' }}>
                    <div style={{ fontWeight: 700 }}>{item.product?.name || 'Unknown Product'}</div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>@ {fmt(item.unit_price)}</div>
                  </td>
                  <td style={{ textAlign: 'center', paddingTop: '8px', fontWeight: 600 }}>{item.quantity}</td>
                  <td style={{ textAlign: 'right', paddingTop: '8px', fontWeight: 700 }}>{fmt(item.unit_price * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ borderBottom: '2px dashed #cbd5e1', margin: '16px 0' }}></div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.4rem', color: '#0f172a' }}>
            <span>TOTAL:</span>
            <span>{fmt(receiptData.total_amount)}</span>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '0.9rem', color: '#475569' }}>
            <span style={{ textTransform: 'capitalize' }}>Paid via {receiptData.payment_method}:</span>
            <span style={{ fontWeight: 600 }}>{fmt(receiptData.total_amount)}</span>
          </div>

          <div style={{ textAlign: 'center', marginTop: '32px', color: '#64748b', fontSize: '0.85rem' }}>
            <p style={{ margin: 0 }}>Thank you for your purchase!</p>
            <p style={{ margin: '4px 0 0 0' }}>Please retain your receipt for returns.</p>
          </div>
        </div>
        
        {/* Action Bar */}
        <div style={{ 
          marginTop: '32px', 
          width: '100%', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '16px',
          background: 'var(--color-bg-secondary)',
          padding: '24px',
          borderRadius: '12px',
          border: '1px solid var(--color-border)'
        }}>
          {actions && (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {actions}
            </div>
          )}
          <div style={{ height: '1px', background: 'var(--color-border)', width: '100%' }}></div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={onClose}
              style={{ flex: 1, padding: '12px', fontWeight: 600 }}
            >
              Close
            </button>
            <button 
              type="button" 
              className="btn btn-primary" 
              onClick={handlePrint}
              style={{ flex: 1, padding: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
              Print Receipt
            </button>
          </div>
        </div>

      </div>
    </Modal>
  );
}
