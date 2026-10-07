import { useMemo, useState } from 'react';
import { useConfirm } from '../../../hooks/useConfirm';
import Modal from '../../../components/Modal';
import { ErrorBanner } from '../../../components/ui';
import { usePersistentDraft } from '../../../hooks/usePersistentDraft';
import SharedDraftControls from '../../operations/SharedDraftControls';

const blankLine = () => ({ product_id: '', quantity: '', unit_cost: '', notes: '' });
export default function PurchaseOrderForm({ isOpen, onClose, onSubmit, suppliers, products, editingOrder, initialDraft, isSubmitting, error }) {
  const confirm = useConfirm();
  const initial = useMemo(() => {
    const source = editingOrder || initialDraft;
    return { supplier_id: source?.supplier_id || '', expected_date: source?.expected_date || '', notes: source?.notes || '', items: source?.items?.map(item => ({ product_id:item.product_id, quantity:String(item.quantity), unit_cost:item.unit_cost == null ? '' : String(item.unit_cost), notes:item.notes || '' })) || [blankLine()] };
  }, [editingOrder, initialDraft]);
  const draft = usePersistentDraft(`po-form:${editingOrder?.id || 'new'}`, initial, isOpen);
  const [saveError, setSaveError] = useState('');
  const { supplier_id, expected_date, notes, items } = draft.value;
  const locked = isSubmitting || !draft.ready;
  const change = (field, value) => draft.setValue(previous => ({ ...previous, [field]:value }));
  const updateItem = (index, field, value) => draft.setValue(previous => ({ ...previous, items:previous.items.map((item,i) => i!==index ? item : { ...item, [field]:value, ...(field==='product_id' ? {unit_cost:products.find(product=>product.id===value)?.cost_price ?? ''} : {}) }) }));
  const total = items.reduce((sum,item)=>sum+Number(item.quantity || 0)*Number(item.unit_cost || 0),0);
  const close = async () => { if (isSubmitting) return; try { await draft.flush(); onClose(); } catch { setSaveError('Your draft is not saved. Keep the form open and retry.'); } };
  const submit = async event => {
    event.preventDefault(); setSaveError('');
    try {
      await draft.flush();
      const saved = await onSubmit({supplier_id,expected_date:expected_date || null,notes,items:items.map(item=>({...item,quantity:Number(item.quantity),unit_cost:Number(item.unit_cost)}))});
      if (saved) await draft.clear();
    } catch (err) { setSaveError(err.message || 'The draft could not be saved.'); }
  };
  return <Modal isOpen={isOpen} onClose={close} title={editingOrder ? 'Edit purchase order' : 'Create purchase order'} size="lg">
    <form onSubmit={submit}>
      <ErrorBanner error={error || saveError || draft.error} />
      <p className="workspace-status">Your draft stays on this device for your account and branch. Confirm purchase costs before saving.</p>
      {!editingOrder && <SharedDraftControls kind="purchase" value={draft.value} disabled={locked} onLoad={value=>{if(!Array.isArray(value.items))throw new Error('This saved purchase draft is invalid.');draft.setValue(value);}} />}
      {initialDraft && !editingOrder && <button type="button" className="btn btn-secondary" disabled={locked} onClick={async()=>{if(await confirm({title:'Use selected reorder items',message:'Replace this saved purchase draft with the items selected in Reorder?',confirmText:'Replace draft'})) draft.setValue(initial);}}>Use selected reorder items</button>}
      <fieldset disabled={locked} className="workspace-fieldset">
        <div className="workspace-form-grid">
          <label>Supplier<select className="form-input" required value={supplier_id} onChange={e=>change('supplier_id',e.target.value)}><option value="">Choose supplier</option>{suppliers.map(supplier=><option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
          <label>Expected delivery<input className="form-input" type="date" value={expected_date} onChange={e=>change('expected_date',e.target.value)} /></label>
        </div>
        <div className="workspace-toolbar"><h3>Purchase items</h3><button type="button" className="btn btn-secondary" onClick={()=>change('items',[...items,blankLine()])}>Add item</button></div>
        {items.map((item,index)=><div className="workspace-purchase-line" key={index}>
          <label>Product {index+1}<select className="form-input" required value={item.product_id} onChange={e=>updateItem(index,'product_id',e.target.value)}><option value="">Choose product</option>{products.map(product=><option key={product.id} value={product.id}>{product.name} ({product.sku})</option>)}</select></label>
          <label>Quantity<input className="form-input" required type="number" min="1" max="100000" step="1" value={item.quantity} onChange={e=>updateItem(index,'quantity',e.target.value)} /></label>
          <label>Unit cost<input className="form-input" required type="number" min="0" step="0.01" value={item.unit_cost} onChange={e=>updateItem(index,'unit_cost',e.target.value)} /></label>
          <span>Line total<br/><strong>{(Number(item.quantity || 0)*Number(item.unit_cost || 0)).toFixed(2)}</strong></span>
          <button type="button" className="btn btn-secondary" aria-label={`Remove purchase line ${index+1}`} disabled={items.length===1} onClick={()=>change('items',items.filter((_,i)=>i!==index))}>Remove</button>
        </div>)}
        <p className="text-right">Order total: <strong>{total.toFixed(2)}</strong></p>
        <label>Order / delivery notes<textarea className="form-input" maxLength={2000} rows={3} value={notes} onChange={e=>change('notes',e.target.value)} /></label>
      </fieldset>
      <div className="workspace-toolbar"><button type="button" className="btn btn-secondary" disabled={isSubmitting} onClick={close}>Close & keep draft</button><button className="btn btn-primary" disabled={locked || !!draft.error}>{isSubmitting ? 'Saving…' : editingOrder ? 'Update PO' : 'Create PO'}</button></div>
    </form>
  </Modal>;
}
