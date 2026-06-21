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
  saleError,
  rewardsEnabled,
  storeCreditBalance = 0,
  pointsBalance = 0,
  pointValue = 0,
  appliedStoreCredit,
  setAppliedStoreCredit,
  appliedPoints,
  setAppliedPoints,
  netAmountDue,
}) {
  if (!pendingSale) return null;

  const grossAmount = pendingSale.total_amount;
  const rewardsApplied = grossAmount - netAmountDue;
  const balance = netAmountDue - (parseFloat(amountPaid) || 0);

  const maxStoreCreditRedeemable = Math.min(storeCreditBalance, grossAmount);
  const remainingAfterStoreCredit = Math.max(0, grossAmount - (Number(appliedStoreCredit) || 0));
  const maxPointsCashRedeemable = pointValue > 0 ? Math.min(pointsBalance * pointValue, remainingAfterStoreCredit) : 0;
  const maxPointsRedeemable = pointValue > 0 ? Math.floor(maxPointsCashRedeemable / pointValue) : 0;

  const handleStoreCreditChange = (e) => {
    const val = Math.max(0, Math.min(Number(e.target.value) || 0, maxStoreCreditRedeemable));
    setAppliedStoreCredit(val ? String(val) : '');
  };

  const handlePointsChange = (e) => {
    const val = Math.max(0, Math.min(parseInt(e.target.value, 10) || 0, maxPointsRedeemable));
    setAppliedPoints(val ? String(val) : '');
  };

  return (
    <Modal isOpen={isOpen} onClose={() => !isProcessing && onClose()} title="Complete Payment">
      <div className="card" style={{ marginBottom: '1.5rem', background: 'var(--surface-50)' }}>
        <h3 className="text-xl font-bold" style={{ marginBottom: '0.5rem' }}>Subtotal: {fmt(grossAmount)}</h3>
        <p className="text-muted">Sale #{pendingSale.id.substring(0, 8)}</p>
      </div>

      {rewardsEnabled && (storeCreditBalance > 0 || pointsBalance > 0) && (
        <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px dashed var(--color-border)' }}>
          <h4 className="font-medium" style={{ marginBottom: '0.75rem' }}>Apply Customer Rewards</h4>

          {storeCreditBalance > 0 && (
            <div className="form-group">
              <label>Store Credit (available {fmt(storeCreditBalance)})</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={maxStoreCreditRedeemable}
                className="form-input"
                value={appliedStoreCredit}
                onChange={handleStoreCreditChange}
                placeholder="0.00"
              />
            </div>
          )}

          {pointsBalance > 0 && pointValue > 0 && (
            <div className="form-group">
              <label>Loyalty Points (available {pointsBalance}, worth {fmt(pointsBalance * pointValue)})</label>
              <input
                type="number"
                step="1"
                min="0"
                max={maxPointsRedeemable}
                className="form-input"
                value={appliedPoints}
                onChange={handlePointsChange}
                placeholder="0"
              />
              {Number(appliedPoints) > 0 && (
                <small className="text-muted">= {fmt(Number(appliedPoints) * pointValue)} off</small>
              )}
            </div>
          )}

          {rewardsApplied > 0 && (
            <div className="flex justify-between items-center" style={{ marginTop: '0.5rem', fontWeight: 600 }}>
              <span>Rewards Applied:</span>
              <span className="text-success">-{fmt(rewardsApplied)}</span>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleFinalizePayment} className="form-layout">
        {saleError && <div className="alert alert-error"><p>{saleError}</p></div>}

        <div className="form-group">
          <label>Payment Method</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem' }}>
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

        <div className="card" style={{ padding: '0.75rem 1rem', background: 'var(--surface-50)' }}>
          <div className="flex justify-between items-center">
            <span className="font-medium">Amount Due:</span>
            <span className="font-bold">{fmt(netAmountDue)}</span>
          </div>
        </div>

        <div className="form-group">
          <label>Amount Tendered ($)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            required={netAmountDue > 0}
            className="form-input text-xl"
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
            placeholder={netAmountDue.toFixed(2)}
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
            disabled={isProcessing || (netAmountDue > 0 && (!amountPaid || parseFloat(amountPaid) <= 0)) || balance > 0}
          >
            {isProcessing ? 'Processing...' : 'Finalize Sale'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
