import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import Modal from '../../../components/Modal';

const TILL_METHODS = ['cash', 'mobile_money'];

/**
 * Records a payment against an AR invoice or AP bill. Shared between Accounts
 * Receivable and Accounts Payable — only the outstanding-balance context and
 * submit handler differ.
 */
export default function RecordPaymentModal({ isOpen, onClose, onSubmit, document, outstanding = 0, locations, isSubmitting, error }) {

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      amount: '',
      payment_method: 'cash',
      payment_date: new Date().toISOString().split('T')[0],
      location_id: '',
      notes: '',
    },
  });

  const paymentMethod = watch('payment_method');
  const requiresLocation = TILL_METHODS.includes(paymentMethod);

  useEffect(() => {
    if (isOpen) {
      reset({
        amount: outstanding > 0 ? outstanding.toFixed(2) : '',
        payment_method: 'cash',
        payment_date: new Date().toISOString().split('T')[0],
        location_id: '',
        notes: '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, document?.id]);

  const onFormSubmit = (data) => {
    onSubmit({
      ...data,
      amount: Number(data.amount),
      location_id: data.location_id || null,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Payment">
      <form onSubmit={handleSubmit(onFormSubmit)} className="form-layout">
        {error && <div className="alert alert-error"><p>{error}</p></div>}

        <p className="text-muted" style={{ marginTop: 0 }}>
          Outstanding balance: <strong>${outstanding.toFixed(2)}</strong>
        </p>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="pay-amount">Amount *</label>
            <div className="input-prefix-wrapper">
              <span className="input-prefix">$</span>
              <input
                type="number"
                id="pay-amount"
                className="form-input with-prefix"
                min="0.01"
                step="0.01"
                {...register('amount', {
                  required: 'Amount is required',
                  min: { value: 0.01, message: 'Amount must be greater than 0' },
                  max: { value: outstanding, message: `Cannot exceed outstanding balance of $${outstanding.toFixed(2)}` },
                })}
              />
            </div>
            {errors.amount && <small className="text-error">{errors.amount.message}</small>}
          </div>
          <div className="form-group">
            <label htmlFor="pay-date">Payment Date</label>
            <input type="date" id="pay-date" className="form-input" {...register('payment_date')} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="pay-method">Payment Method *</label>
            <select id="pay-method" className="form-input" {...register('payment_method', { required: true })}>
              <option value="cash">Cash</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
          </div>
          {requiresLocation && (
            <div className="form-group">
              <label htmlFor="pay-location">Till Location *</label>
              <select
                id="pay-location"
                className="form-input"
                {...register('location_id', { required: requiresLocation ? 'Location is required for cash/mobile money' : false })}
              >
                <option value="">Select location...</option>
                {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </select>
              {errors.location_id && <small className="text-error">{errors.location_id.message}</small>}
            </div>
          )}
        </div>

        {requiresLocation && (
          <small className="text-muted" style={{ display: 'block', marginTop: '-8px' }}>
            Cash and mobile money payments are posted to this location's till ledger for end-of-day reconciliation.
          </small>
        )}

        <div className="form-group">
          <label htmlFor="pay-notes">Notes</label>
          <input type="text" id="pay-notes" className="form-input" {...register('notes')} />
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', width: '100%' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting || outstanding <= 0}>
            {isSubmitting ? 'Recording...' : 'Record Payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
