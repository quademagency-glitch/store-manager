import { useState, useEffect } from 'react';
import { useHR } from '../../hooks/useHR';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import '../../styles/hr.css';

export default function CommissionRules() {
  const toast = useToast();
  const confirm = useConfirm();
  const {
    loading,
    commissionRules,
    fetchCommissionRules,
    createCommissionRule,
    updateCommissionRule,
    deleteCommissionRule,
  } = useHR();

  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [form, setForm] = useState({
    name: '', type: 'percentage', value: '', min_sale_amount: '0', product_category: '', active: true,
  });

  useEffect(() => {
    fetchCommissionRules();
  }, [fetchCommissionRules]);

  const resetForm = () => {
    setForm({ name: '', type: 'percentage', value: '', min_sale_amount: '0', product_category: '', active: true });
    setEditingRule(null);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (rule) => {
    setEditingRule(rule);
    setForm({
      name: rule.name,
      type: rule.type,
      value: String(rule.value),
      min_sale_amount: String(rule.min_sale_amount || 0),
      product_category: rule.product_category || '',
      active: rule.active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    const payload = {
      name: form.name,
      type: form.type,
      value: Number(form.value),
      min_sale_amount: Number(form.min_sale_amount) || 0,
      product_category: form.product_category || null,
      active: form.active,
    };

    try {
      if (editingRule) {
        await updateCommissionRule(editingRule.id, payload);
        toast.success('Rule updated!');
      } else {
        await createCommissionRule(payload);
        toast.success('Rule created!');
      }
      setShowModal(false);
      resetForm();
      fetchCommissionRules();
    } catch (err) {
      toast.error(err.message || 'Failed to save rule');
    }
  };

  const handleDelete = async (rule) => {
    const confirmed = await confirm({
      title: 'Delete Commission Rule',
      message: `Are you sure you want to delete "${rule.name}"? This will not affect existing commission records.`,
      variant: 'danger',
      confirmText: 'Delete',
    });
    if (!confirmed) return;

    try {
      await deleteCommissionRule(rule.id);
      toast.success('Rule deleted');
    } catch (err) {
      toast.error(err.message || 'Failed to delete rule');
    }
  };

  const handleToggle = async (rule) => {
    try {
      await updateCommissionRule(rule.id, { active: !rule.active });
      toast.success(rule.active ? 'Rule disabled' : 'Rule enabled');
      fetchCommissionRules();
    } catch (err) {
      toast.error(err.message || 'Failed to update rule');
    }
  };

  const fmt = (amount) => `$${Number(amount || 0).toFixed(2)}`;

  return (
    <div className="hr-page">
      <div className="page-header">
        <div>
          <h1>Commission Rules</h1>
          <p className="page-subtitle">Configure sales commission policies</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Rule</button>
      </div>

      {/* Rules Cards */}
      <div className="commission-rules-grid">
        {(commissionRules || []).length === 0 ? (
          <div className="empty-state-card">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4 }}>
              <path d="M12 2V22M17 7H9.5C7.57 7 6 8.57 6 10.5S7.57 14 9.5 14h5c1.93 0 3.5 1.57 3.5 3.5S16.43 21 14.5 21H6" strokeLinecap="round" />
            </svg>
            <p>No commission rules yet</p>
            <p className="text-muted">Create rules to automatically calculate commissions on sales</p>
          </div>
        ) : (
          commissionRules.map(rule => (
            <div key={rule.id} className={`commission-rule-card ${!rule.active ? 'rule-disabled' : ''}`}>
              <div className="rule-card-header">
                <h3 className="rule-name">{rule.name}</h3>
                <div className="rule-actions">
                  <button className="btn btn-sm btn-secondary" onClick={() => handleToggle(rule)}>
                    {rule.active ? 'Disable' : 'Enable'}
                  </button>
                  <button className="btn btn-sm btn-secondary" onClick={() => openEdit(rule)}>Edit</button>
                  <button className="btn btn-sm btn-danger-outline" onClick={() => handleDelete(rule)}>Delete</button>
                </div>
              </div>
              <div className="rule-card-body">
                <div className="rule-detail">
                  <span className="rule-detail-label">Type</span>
                  <span className="rule-detail-value badge badge-info">
                    {rule.type === 'percentage' ? `${rule.value}%` : fmt(rule.value) + ' flat'}
                  </span>
                </div>
                <div className="rule-detail">
                  <span className="rule-detail-label">Min. Sale</span>
                  <span className="rule-detail-value">{fmt(rule.min_sale_amount)}</span>
                </div>
                {rule.product_category && (
                  <div className="rule-detail">
                    <span className="rule-detail-label">Category</span>
                    <span className="rule-detail-value">{rule.product_category}</span>
                  </div>
                )}
                <div className="rule-detail">
                  <span className="rule-detail-label">Status</span>
                  <span className={`badge ${rule.active ? 'badge-success' : 'badge-secondary'}`}>
                    {rule.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingRule ? 'Edit Commission Rule' : 'Create Commission Rule'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Rule Name</label>
                <input type="text" className="form-input" placeholder="e.g. Standard 5% Commission" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Type</label>
                  <select className="form-input" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                    <option value="percentage">Percentage (%)</option>
                    <option value="flat">Flat Amount ($)</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Value</label>
                  <input type="number" step="0.01" className="form-input" placeholder={form.type === 'percentage' ? '5' : '10.00'} value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label>Minimum Sale Amount</label>
                <input type="number" step="0.01" className="form-input" placeholder="0.00" value={form.min_sale_amount} onChange={e => setForm(p => ({ ...p, min_sale_amount: e.target.value }))} />
                <span className="form-hint">Sales below this amount won't earn commission</span>
              </div>
              <div className="form-group">
                <label>Product Category (optional)</label>
                <input type="text" className="form-input" placeholder="Leave empty for all products" value={form.product_category} onChange={e => setForm(p => ({ ...p, product_category: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="hr-checkbox-label">
                  <input type="checkbox" checked={form.active} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} />
                  Active (applies to new sales)
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={loading || !form.name || !form.value}>
                {loading ? 'Saving...' : editingRule ? 'Update Rule' : 'Create Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
