import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import Modal from '../../../components/Modal';

export default function ProductModal({ isOpen, onClose, onSubmit, editingProduct, locations, isSubmitting, error }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: '',
      sku: '',
      category: '',
      price: '',
      initialQuantity: '',
      locationId: '',
      qr_code_data: ''
    }
  });

  // When editingProduct changes, we reset the form values
  useEffect(() => {
    if (editingProduct) {
      reset({
        name: editingProduct.name || '',
        sku: editingProduct.sku || '',
        category: editingProduct.category || '',
        price: editingProduct.price || '',
        qr_code_data: editingProduct.qr_code_data || ''
      });
    } else {
      reset({
        name: '',
        sku: '',
        category: '',
        price: '',
        initialQuantity: '',
        locationId: '',
        qr_code_data: ''
      });
    }
  }, [editingProduct, reset, isOpen]);

  const onFormSubmit = (data) => {
    onSubmit(data);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingProduct ? 'Edit Product' : 'Add New Product'}>
      <form onSubmit={handleSubmit(onFormSubmit)} className="form-layout">
        {error && <div className="alert alert-error"><p>{error}</p></div>}
        
        <div className="form-group">
          <label htmlFor="prod-name">Product Name *</label>
          <input 
            type="text" 
            id="prod-name" 
            className="form-input" 
            placeholder="e.g. Wireless Headphones"
            {...register('name', { required: 'Product Name is required' })} 
          />
          {errors.name && <small className="text-error">{errors.name.message}</small>}
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="prod-sku">SKU *</label>
            <input 
              type="text" 
              id="prod-sku" 
              className="form-input text-mono" 
              placeholder="WH-001"
              {...register('sku', { required: 'SKU is required' })} 
            />
            {errors.sku && <small className="text-error">{errors.sku.message}</small>}
          </div>
          <div className="form-group">
            <label htmlFor="prod-category">Category</label>
            <input 
              type="text" 
              id="prod-category" 
              className="form-input" 
              placeholder="Electronics"
              {...register('category')} 
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="prod-price">Price ($) *</label>
          <div className="input-prefix-wrapper">
            <span className="input-prefix">$</span>
            <input 
              type="number" 
              id="prod-price" 
              className="form-input with-prefix" 
              min="0" 
              step="0.01"
              placeholder="99.99"
              {...register('price', { required: 'Price is required', min: 0 })} 
            />
          </div>
          {errors.price && <small className="text-error">{errors.price.message}</small>}
        </div>

        {!editingProduct && (
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="prod-qty">Initial Quantity</label>
              <input 
                type="number" 
                id="prod-qty" 
                className="form-input" 
                min="0" 
                placeholder="e.g. 100"
                {...register('initialQuantity')} 
              />
            </div>
            <div className="form-group">
              <label htmlFor="prod-loc">Location</label>
              <select 
                id="prod-loc" 
                className="form-input" 
                {...register('locationId')}
              >
                <option value="">Select location...</option>
                {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="prod-qr">QR Code Data</label>
          <input 
            type="text" 
            id="prod-qr" 
            className="form-input text-mono" 
            placeholder={editingProduct?.sku || 'Auto-generated from SKU'}
            {...register('qr_code_data')} 
          />
          <small className="text-muted" style={{ display: 'block', marginTop: '4px' }}>
            Leave blank to auto-use the SKU. This value is encoded in the printed QR label.
          </small>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Product'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
