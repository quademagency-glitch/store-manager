import { useForm, useWatch } from 'react-hook-form';
import Modal from '../../../components/Modal';
import { isValidPhone, describePhone, callingCodeFor, resolveCountry } from '../../../lib/phone';

export default function NewCustomerModal({ isOpen, onClose, onSubmit, country: countryProp }) {
  // The caller passes the business/location country when it has one; the
  // device locale stands in while that is still loading or unset.
  const country = countryProp || resolveCountry();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors }
  } = useForm();

  // Shown as the number is typed, so a mistyped number is caught at the
  // counter rather than when an SMS silently fails to arrive.
  //
  // `useWatch` rather than the `watch()` returned by useForm: that one cannot
  // be memoized safely and re-renders the whole form on every keystroke in any
  // field, not just this one.
  const phone = useWatch({ control, name: 'phone' });
  const parsed = describePhone(phone, country);
  const dialCode = callingCodeFor(country);

  const handleFormSubmit = (data) => {
    onSubmit(data);
    reset();
  };

  return (
    <Modal isOpen={isOpen} onClose={() => { reset(); onClose(); }} title="Add New Customer">
      <form onSubmit={handleSubmit(handleFormSubmit)} className="form-layout">
        <div className="form-group">
          <label htmlFor="cust-name">Full Name *</label>
          <input 
            type="text" 
            id="cust-name" 
            className="form-input" 
            placeholder="John Doe"
            {...register('name', { required: 'Full Name is required' })}
          />
          {errors.name && <small className="text-error">{errors.name.message}</small>}
        </div>
        <div className="form-group">
          <label htmlFor="cust-phone">Phone Number *</label>
          <input 
            type="tel" 
            id="cust-phone" 
            className="form-input" 
            placeholder="024 123 4567"
            inputMode="tel"
            autoComplete="tel"
            {...register('phone', {
              required: 'Phone Number is required',
              validate: (v) =>
                isValidPhone(v, country) ||
                'Enter a valid number, or include the country code (e.g. +233…)',
            })}
          />
          {/* Echo back what was understood — the country code is applied
              automatically, so the number that gets stored should never be a
              surprise. A typed `+…` overrides the branch's country. */}
          {errors.phone ? (
            <small className="text-error">{errors.phone.message}</small>
          ) : parsed ? (
            <small className="text-success">
              {parsed.formatted}
              {parsed.network ? ` · ${parsed.network}` : ''}
            </small>
          ) : (
            <small className="text-muted">
              {dialCode ? `${dialCode} applied automatically, or type a country code` : 'Include a country code if not local'}
            </small>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={() => { reset(); onClose(); }}>Cancel</button>
          <button type="submit" className="btn btn-primary">Save Customer</button>
        </div>
      </form>
    </Modal>
  );
}
