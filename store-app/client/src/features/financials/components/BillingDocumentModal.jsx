import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import Modal from '../../../components/Modal';

/**
 * Create form for an AR invoice or AP bill. Shared between Accounts Receivable
 * and Accounts Payable since the two are structurally identical — only the
 * party list (customers vs suppliers) and labels differ.
 */
export default function BillingDocumentModal({ isOpen, onClose, onSubmit, kind, parties, isSubmitting, error }) {
  const partyLabel = kind === 'ar' ? 'Customer' : 'Supplier';
  const docLabel = kind === 'ar' ? 'Invoice' : 'Bill';
  const partyField = kind === 'ar' ? 'customer_id' : 'supplier_id';
  // ar_invoices uses total_amount (to match the existing reports.js/Reports
  // page that already reads this table); ap_bills keeps the original amount.
  const amountField = kind === 'ar' ? 'total_amount' : 'amount';

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      [partyField]: '',
      description: '',
      [amountField]: '',
      due_date: '',
      is_opening_balance: false,
      as_of_date: '',
    },
  });

  const isOpeningBalance = watch('is_opening_balance');

  useEffect(() => {
    if (isOpen) {
      reset({
        [partyField]: '',
        description: '',
        [amountField]: '',
        due_date: '',
        is_opening_balance: false,
        as_of_date: '',
      });
    }
  }, [isOpen, reset, partyField, amountField]);

  const onFormSubmit = (data) => {
    onSubmit({
      ...data,
      [amountField]: Number(data[amountField]),
      due_date: data.due_date || null,
      as_of_date: data.is_opening_balance ? data.as_of_date : null,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`New ${docLabel}`}>
      <form onSubmit={handleSubmit(onFormSubmit)} className="form-layout">
        {error && <div className="alert alert-error"><p>{error}</p></div>}

        <div className="form-group">
          <label htmlFor="doc-party">{partyLabel} *</label>
          <select
            id="doc-party"
            className="form-input"
            {...register(partyField, { required: `${partyLabel} is required` })}
          >
            <option value="">Select {partyLabel.toLowerCase()}...</option>
            {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {errors[partyField] && <small className="text-error">{errors[partyField].message}</small>}
        </div>

        <div className="form-group">
          <label htmlFor="doc-description">Description</label>
          <input
            type="text"
            id="doc-description"
            className="form-input"
            placeholder={kind === 'ar' ? 'What is this invoice for?' : 'What is this bill for?'}
            {...register('description')}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="doc-amount">Amount *</label>
            <div className="input-prefix-wrapper">
              <span className="input-prefix">$</span>
              <input
                type="number"
                id="doc-amount"
                className="form-input with-prefix"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                {...register(amountField, { required: 'Amount is required', min: { value: 0.01, message: 'Amount must be greater than 0' } })}
              />
            </div>
            {errors[amountField] && <small className="text-error">{errors[amountField].message}</small>}
          </div>
          <div className="form-group">
            <label htmlFor="doc-due">Due Date</label>
            <input type="date" id="doc-due" className="form-input" {...register('due_date')} />
          </div>
        </div>

        <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="checkbox" id="doc-opening" {...register('is_opening_balance')} style={{ width: 'auto' }} />
          <label htmlFor="doc-opening" style={{ margin: 0 }}>This is an opening balance carried over from before go-live</label>
        </div>

        {isOpeningBalance && (
          <div className="form-group">
            <label htmlFor="doc-asof">Balance as of *</label>
            <input
              type="date"
              id="doc-asof"
              className="form-input"
              {...register('as_of_date', { required: isOpeningBalance ? 'Required for opening balances' : false })}
            />
            {errors.as_of_date && <small className="text-error">{errors.as_of_date.message}</small>}
            <small className="text-muted" style={{ display: 'block', marginTop: '4px' }}>
              Recorded as a single balance-forward entry — it does not create a backdated sale or transaction.
            </small>
          </div>
        )}

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', width: '100%' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : `Save ${docLabel}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
