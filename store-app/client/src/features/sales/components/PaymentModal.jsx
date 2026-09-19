import Modal from '../../../components/Modal';

export default function PaymentModal({
  isOpen,
  onClose,
  pendingSale,
  fmt,
  currencySymbol,
  amountPaid,
  setAmountPaid,
  paymentMethod,
  setPaymentMethod,
  handleFinalizePayment,
  isProcessing,
  paymentLocked = false,
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
  const balance = (Math.round(netAmountDue * 100) - Math.round((parseFloat(amountPaid) || 0) * 100)) / 100;

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
    <Modal isOpen={isOpen} onClose={() => !isProcessing && !paymentLocked && onClose()} title="Complete Payment">
      <div className="card" style={{ marginBottom: '1.5rem', background: 'var(--surface-50)' }}>
        <h3 className="text-xl font-bold mb-sm">Total: {fmt(grossAmount)}</h3>
        <p className="text-muted">Sale #{pendingSale.id.substring(0, 8)}</p>
      </div>

      {rewardsEnabled && !pendingSale._isOffline && (storeCreditBalance > 0 || pointsBalance > 0) && (
        <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px dashed var(--color-border)' }}>
          <h4 className="font-medium" style={{ marginBottom: '0.75rem' }}>Apply Customer Rewards</h4>

          {storeCreditBalance > 0 && (
            <div className="form-group">
              <label htmlFor="checkout-credit">Deposit Balance (available {fmt(storeCreditBalance)})</label>
              <input
                type="number"
                step="0.01"
                min="0"
                id="checkout-credit"
                disabled={isProcessing || paymentLocked}
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
              <label htmlFor="checkout-points">Loyalty Points (available {pointsBalance}, worth {fmt(pointsBalance * pointValue)})</label>
              <input
                type="number"
                step="1"
                min="0"
                id="checkout-points"
                disabled={isProcessing || paymentLocked}
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
        {paymentLocked && <p className="alert alert-warning">Payment result is unconfirmed. Retry the same payment to retrieve its saved receipt.</p>}
        {saleError && <div className="alert alert-error"><p>{saleError}</p></div>}

        <div className="form-group">
          <label>Payment Method</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem' }}>
            {['cash', 'card', 'mobile', 'transfer'].map(method => (
              <label
                key={method}
                className={`card text-center cursor-pointer ${paymentMethod === method ? 'border-primary' : ''}`}
                style={{ padding: '0.75rem', border: paymentMethod === method ? '2px solid var(--primary-500)' : '1px solid var(--border-color)', margin: 0 }}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  disabled={isProcessing || paymentLocked}
                  value={method}
                  checked={paymentMethod === method}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="sr-only"
                />
                <span className="font-medium capitalize">{method === 'mobile' ? 'Mobile money' : method === 'transfer' ? 'Bank transfer' : method}</span>
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
          <label htmlFor="checkout-tender">Amount Tendered ({currencySymbol})</label>
          <input
            type="number"
            step="0.01"
            min="0"
            id="checkout-tender"
            disabled={isProcessing || paymentLocked}
            required={netAmountDue > 0}
            className="form-input text-xl"
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
            placeholder={netAmountDue.toFixed(2)}
          />
        </div>

        {amountPaid && (
          <div className={`card p-md ${balance <= 0 ? 'bg-success-light' : 'bg-warning-light'}`}>
            <div className="flex justify-between items-center">
              <span className="font-bold">{balance <= 0 ? (paymentMethod === 'cash' ? 'Change Due:' : 'Excess payment:') : 'Remaining Balance:'}</span>
              <span className={`text-xl font-bold ${balance <= 0 ? 'text-success' : 'text-warning'}`}>
                {fmt(Math.abs(balance))}
              </span>
            </div>
          </div>
        )}

        <div className="modal-footer" style={{ marginTop: '2rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isProcessing || paymentLocked}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isProcessing || (netAmountDue > 0 && (!amountPaid || parseFloat(amountPaid) <= 0)) || balance > 0 || (paymentMethod !== 'cash' && Math.abs(balance) > 0.005)}
          >
            {isProcessing ? 'Processing...' : paymentLocked ? 'Retry same payment' : 'Finalize Sale'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
