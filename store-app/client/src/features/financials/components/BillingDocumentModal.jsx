import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { api } from '../../../lib/api';
import { useConfirm } from '../../../hooks/useConfirm';
import Modal from '../../../components/Modal';
import { currencyPrefixStyle } from '../../../hooks/useCurrency';

/**
 * Create form for an AR invoice or AP bill. Shared between Accounts Receivable
 * and Accounts Payable since the two are structurally identical, only the
 * party list (customers vs suppliers) and labels differ.
 */
export default function BillingDocumentModal({ isOpen, onClose, onSubmit, kind, parties, currencySymbol, isSubmitting, error }) {
  const confirm = useConfirm();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    let active = true;
    if (!isOpen || kind !== 'ar' || query.trim().length < 2) { setMatches([]); setSearchError(''); setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => api.get(`/customers/search?q=${encodeURIComponent(query.trim())}`).then(rows=>{if(active){setMatches(rows || []);setSearchError('');}}).catch(err=>{if(active) {setMatches([]);setSearchError(err.message);}}).finally(()=>{if(active)setSearching(false);}),250);
    return ()=>{active=false;clearTimeout(timer);};
  }, [query, kind, isOpen]);
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
    control,
    formState: { errors, isDirty },
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

  /* See RecordPaymentModal, `watch()` blocks React Compiler memoization
     for the whole component; `useWatch` subscribes via `control` instead. */
  const isOpeningBalance = useWatch({ control, name: 'is_opening_balance' });

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

  const close = async () => { if (isSubmitting) return; if (!isDirty || await confirm({title:'Discard unsaved document?',message:'The document has not been saved.',confirmText:'Discard'})) onClose(); };
  const onFormSubmit = (data) => {
    onSubmit({
      ...data,
      [amountField]: Number(data[amountField]),
      due_date: data.due_date || null,
      as_of_date: data.is_opening_balance ? data.as_of_date : null,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title={`New ${docLabel}`}>
      <form onSubmit={handleSubmit(onFormSubmit)} className="form-layout">
        {error && <div className="alert alert-error"><p>{error}</p></div>}

        {kind==='ar' && <label>Find customer by phone (owners can also search name or code)<input className="form-input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search all customers" /><small>{searching ? 'Searching…' : searchError || (query.length>=2 && !matches.length ? 'No matching customers.' : 'Choose the matching customer below.')}</small></label>}
        <div className="form-group">
          <label htmlFor="doc-party">{partyLabel} *</label>
          <select
            id="doc-party"
            className="form-input"
            {...register(partyField, { required: `${partyLabel} is required` })}
          >
            <option value="">Select {partyLabel.toLowerCase()}...</option>
            {Array.from(new Map([...parties,...matches].map(p=>[p.id,p])).values()).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
            <div className="input-prefix-wrapper" style={currencyPrefixStyle(currencySymbol)}>
              <span className="input-prefix">{currencySymbol}</span>
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

        <div className="form-group flex items-center gap-sm">
          <input type="checkbox" id="doc-opening" {...register('is_opening_balance')} style={{ width: 'auto' }} />
          <label htmlFor="doc-opening" className="m-0">This is an opening balance carried over from before go-live</label>
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
              Recorded as a single balance-forward entry. It does not create a backdated sale or transaction.
            </small>
          </div>
        )}

        <div className="modal-footer flex justify-end gap-sm w-full">
          <button type="button" className="btn btn-secondary" onClick={close} disabled={isSubmitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : `Save ${docLabel}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
