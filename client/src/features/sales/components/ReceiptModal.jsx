import Modal from '../../../components/Modal';

export default function ReceiptModal({ isOpen, onClose, receiptData, fmt }) {
  if (!receiptData) return null;

  const handlePrint = () => {
    // In a real app, this would generate a PDF or trigger ESC/POS bluetooth printing
    window.print();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Receipt">
      <div className="receipt-container" id="printable-receipt" style={{ padding: '1rem', background: '#fff', color: '#000', fontFamily: 'monospace', maxWidth: '350px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>STORE APP</h2>
          <p style={{ margin: 0 }}>Receipt #{receiptData.receipt_number}</p>
          <p style={{ margin: 0 }}>{new Date(receiptData.created_at).toLocaleString()}</p>
        </div>
        
        <div style={{ borderBottom: '1px dashed #ccc', marginBottom: '1rem' }}></div>
        
        <table style={{ width: '100%', marginBottom: '1rem', textAlign: 'left' }}>
          <thead>
            <tr>
              <th>Item</th>
              <th style={{ textAlign: 'center' }}>Qty</th>
              <th style={{ textAlign: 'right' }}>Price</th>
            </tr>
          </thead>
          <tbody>
            {receiptData.sale_items.map((item, idx) => (
              <tr key={idx}>
                <td>{item.product?.name || 'Unknown Product'}</td>
                <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                <td style={{ textAlign: 'right' }}>{fmt(item.unit_price * item.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ borderBottom: '1px dashed #ccc', marginBottom: '1rem' }}></div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.2rem' }}>
          <span>TOTAL:</span>
          <span>{fmt(receiptData.total_amount)}</span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
          <span>Payment ({receiptData.payment_method}):</span>
          <span>{fmt(receiptData.total_amount)}</span>
        </div>

        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <p>Thank you for your purchase!</p>
        </div>
      </div>
      
      <div className="modal-footer" style={{ marginTop: '2rem' }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
        <button type="button" className="btn btn-primary" onClick={handlePrint}>Print Receipt</button>
      </div>
    </Modal>
  );
}
