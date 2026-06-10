import Modal from '../../../components/Modal';

export default function PaymentModal({ 
  isOpen, 
  onClose, 
  pendingSale, 
  fmt, 
  amountPaid, 
  setAmountPaid, 
  paymentMethod, 
  setPaymentMethod, 
  handleFinalizePayment, 
  isProcessing, 
  saleError 
}) {
  if (!pendingSale) return null;
  
  const balance = pendingSale.total_amount - (parseFloat(amountPaid) || 0);
  
  return (
    <Modal isOpen={isOpen} onClose={() => !isProcessing && onClose()} title="Complete Payment">
      <div className="card" style={{ marginBottom: '1.5rem', background: 'var(--surface-50)' }}>
        <h3 className="text-xl font-bold" style={{ marginBottom: '0.5rem' }}>Amount Due: {fmt(pendingSale.total_amount)}</h3>
        <p className="text-muted">Sale #{pendingSale.id.substring(0, 8)}</p>
      </div>

      <form onSubmit={handleFinalizePayment} className="form-layout">
        {saleError && <div className="alert alert-error"><p>{saleError}</p></div>}
        
        <div className="form-group">
          <label>Payment Method</label>
          <div className="grid grid-cols-2" style={{ gap: '0.5rem' }}>
            {['cash', 'card', 'transfer', 'credit'].map(method => (
              <label 
                key={method} 
                className={`card text-center cursor-pointer ${paymentMethod === method ? 'border-primary' : ''}`}
                style={{ padding: '0.75rem', border: paymentMethod === method ? '2px solid var(--primary-500)' : '1px solid var(--border-color)', margin: 0 }}
              >
                <input 
                  type="radio" 
                  name="paymentMethod" 
                  value={method} 
                  checked={paymentMethod === method}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="sr-only" 
                />
                <span className="font-medium" style={{ textTransform: 'capitalize' }}>{method}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Amount Tendered ($)</label>
          <input 
            type="number" 
            step="0.01" 
            min="0" 
            required
            className="form-input text-xl" 
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
            placeholder={pendingSale.total_amount.toFixed(2)}
          />
        </div>

        {amountPaid && (
          <div className={`card ${balance <= 0 ? 'bg-success-light' : 'bg-warning-light'}`} style={{ padding: '1rem' }}>
            <div className="flex justify-between items-center">
              <span className="font-bold">{balance <= 0 ? 'Change Due:' : 'Remaining Balance:'}</span>
              <span className={`text-xl font-bold ${balance <= 0 ? 'text-success' : 'text-warning'}`}>
                {fmt(Math.abs(balance))}
              </span>
            </div>
          </div>
        )}

        <div className="modal-footer" style={{ marginTop: '2rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isProcessing}>
            Cancel
          </button>
          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={isProcessing || !amountPaid || parseFloat(amountPaid) <= 0 || balance > 0}
          >
            {isProcessing ? 'Processing...' : 'Finalize Sale'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
