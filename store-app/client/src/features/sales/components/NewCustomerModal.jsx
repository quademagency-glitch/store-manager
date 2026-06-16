import { useForm } from 'react-hook-form';
import Modal from '../../../components/Modal';

export default function NewCustomerModal({ isOpen, onClose, onSubmit }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm();

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
            placeholder="+1234567890"
            {...register('phone', { 
              required: 'Phone Number is required',
              pattern: {
                value: /^\+?[1-9]\d{1,14}$/,
                message: 'Invalid phone number format (E.164)'
              }
            })}
          />
          {errors.phone && <small className="text-error">{errors.phone.message}</small>}
          <small className="text-muted">Must include country code (e.g. +1...)</small>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={() => { reset(); onClose(); }}>Cancel</button>
          <button type="submit" className="btn btn-primary">Save Customer</button>
        </div>
      </form>
    </Modal>
  );
}
