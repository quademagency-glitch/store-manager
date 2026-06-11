import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import Modal from '../components/Modal';

export default function AccountingSettings() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('expense');
  const [assignedRoles, setAssignedRoles] = useState([]);
  const [fieldsSchema, setFieldsSchema] = useState([]);

  // Available Roles (Mocked, should fetch from API in real implementation)
  const availableRoles = ['Salesperson', 'Cashier', 'Manager', 'Business Admin'];

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const data = await api.get('/accounting/templates');
      setTemplates(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (template = null) => {
    if (template) {
      setEditingTemplate(template);
      setName(template.name);
      setDescription(template.description || '');
      setType(template.type);
      setAssignedRoles(template.assigned_roles || []);
      setFieldsSchema(template.fields_schema || []);
    } else {
      setEditingTemplate(null);
      setName('');
      setDescription('');
      setType('expense');
      setAssignedRoles([]);
      setFieldsSchema([]);
    }
    setIsModalOpen(true);
  };

  const handleAddField = () => {
    setFieldsSchema([...fieldsSchema, { 
      id: Date.now().toString(), 
      label: '', 
      type: 'text', 
      required: false,
      options: '', // For dropdowns, comma separated
      showIf: '' // basic conditional logic string e.g. "payment_method == 'mobile'"
    }]);
  };

  const handleUpdateField = (index, key, value) => {
    const newFields = [...fieldsSchema];
    newFields[index][key] = value;
    setFieldsSchema(newFields);
  };

  const handleRemoveField = (index) => {
    const newFields = [...fieldsSchema];
    newFields.splice(index, 1);
    setFieldsSchema(newFields);
  };

  const toggleRole = (role) => {
    if (assignedRoles.includes(role)) {
      setAssignedRoles(assignedRoles.filter(r => r !== role));
    } else {
      setAssignedRoles([...assignedRoles, role]);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name,
        description,
        type,
        assigned_roles: assignedRoles,
        fields_schema: fieldsSchema
      };

      if (editingTemplate) {
        await api.put(`/accounting/templates/${editingTemplate.id}`, payload);
      } else {
        await api.post('/accounting/templates', payload);
      }
      setIsModalOpen(false);
      fetchTemplates();
    } catch (err) {
      console.error('Failed to save template', err);
      alert('Failed to save template. Make sure you have Admin permissions.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    try {
      await api.delete(`/accounting/templates/${id}`);
      fetchTemplates();
    } catch (err) {
      console.error('Failed to delete template', err);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto transition-colors duration-300">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>Accounting Template Settings</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>Build and manage your dynamic accounting templates (Forms).</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="action-btn"
          style={{ background: 'var(--color-accent-primary)', color: '#ffffff', border: 'none' }}
        >
          + Create Template
        </button>
      </div>
      
      {loading ? <p style={{ color: 'var(--color-text-secondary)' }}>Loading templates...</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map(t => (
            <div key={t.id} className="glass-panel p-6 rounded-xl flex flex-col hover:-translate-y-1 transition-transform">
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-semibold text-lg" style={{ color: 'var(--color-text-primary)' }}>{t.name}</h3>
                <span 
                  className="px-2 py-0.5 text-[10px] rounded uppercase font-bold tracking-wider" 
                  style={{ 
                    border: `1px solid ${t.type === 'expense' ? 'var(--color-error-border)' : 'var(--color-success)'}`,
                    color: t.type === 'expense' ? 'var(--color-error)' : 'var(--color-success)',
                    background: 'transparent'
                  }}
                >
                  {t.type}
                </span>
              </div>
              <p className="text-sm mb-4 h-10 overflow-hidden" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{t.description}</p>
              
              <div className="mb-4">
                <div className="text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>Assigned Roles</div>
                <div className="flex flex-wrap gap-1">
                  {t.assigned_roles && t.assigned_roles.length > 0 ? t.assigned_roles.map(r => (
                    <span key={r} className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>{r}</span>
                  )) : <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>None</span>}
                </div>
              </div>

              <div className="flex gap-3 mt-auto pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                <button onClick={() => handleOpenModal(t)} className="flex-1 py-1.5 rounded text-sm font-semibold transition-colors hover:opacity-80" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>
                  Edit
                </button>
                <button onClick={() => handleDelete(t.id)} className="flex-1 py-1.5 rounded text-sm font-semibold transition-colors hover:opacity-80" style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)', border: '1px solid var(--color-error-border)' }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
          {templates.length === 0 && (
            <div className="col-span-full text-center py-12 rounded-xl" style={{ border: '1px dashed var(--color-border)', color: 'var(--color-text-tertiary)' }}>
              No templates created yet. Click "Create Template" to get started.
            </div>
          )}
        </div>
      )}

      {isModalOpen && (
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingTemplate ? "Edit Template" : "Create Template"}>
          <form onSubmit={handleSave} className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
            
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Template Name</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  className="w-full rounded p-2.5 transition-colors focus:outline-none" 
                  style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                  placeholder="e.g., POS Machine Deposit"
                  required 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Type</label>
                <select 
                  value={type} 
                  onChange={e => setType(e.target.value)}
                  className="w-full rounded p-2.5 transition-colors focus:outline-none"
                  style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                >
                  <option value="expense">Expense</option>
                  <option value="deposit">Deposit (To Bank/Mobile)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Description</label>
              <textarea 
                value={description} 
                onChange={e => setDescription(e.target.value)} 
                className="w-full rounded p-2.5 transition-colors focus:outline-none" 
                style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                rows="2"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Who can use this template?</label>
              <div className="flex flex-wrap gap-2">
                {availableRoles.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRole(r)}
                    className="px-4 py-1.5 text-xs font-semibold rounded-full border transition-colors"
                    style={{
                      background: assignedRoles.includes(r) ? 'var(--color-accent-primary)' : 'var(--color-bg-tertiary)',
                      borderColor: assignedRoles.includes(r) ? 'var(--color-accent-primary)' : 'var(--color-border)',
                      color: assignedRoles.includes(r) ? '#ffffff' : 'var(--color-text-secondary)'
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-6 mt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
              <div className="flex justify-between items-center mb-4">
                <label className="block text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-primary)' }}>Custom Form Fields</label>
                <button type="button" onClick={handleAddField} className="text-xs px-3 py-1.5 rounded font-semibold transition-colors" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  + Add Field
                </button>
              </div>
              
              <div className="space-y-4">
                {fieldsSchema.map((field, index) => (
                  <div key={field.id} className="p-5 rounded-lg relative" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                    <button 
                      type="button" 
                      onClick={() => handleRemoveField(index)}
                      className="absolute top-3 right-3 hover:opacity-70 transition-opacity"
                      style={{ color: 'var(--color-error)' }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    
                    <div className="grid grid-cols-2 gap-4 mb-3 pr-8">
                      <div>
                        <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Field Label</label>
                        <input 
                          type="text" 
                          value={field.label} 
                          onChange={e => handleUpdateField(index, 'label', e.target.value)} 
                          className="w-full rounded p-2 transition-colors focus:outline-none" 
                          style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                          placeholder="e.g. Bank Name"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Input Type</label>
                        <select 
                          value={field.type} 
                          onChange={e => handleUpdateField(index, 'type', e.target.value)}
                          className="w-full rounded p-2 transition-colors focus:outline-none"
                          style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                        >
                          <option value="text">Text</option>
                          <option value="number">Number</option>
                          <option value="dropdown">Dropdown</option>
                        </select>
                      </div>
                    </div>

                    {field.type === 'dropdown' && (
                      <div className="mb-3">
                        <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Options (comma separated)</label>
                        <input 
                          type="text" 
                          value={field.options} 
                          onChange={e => handleUpdateField(index, 'options', e.target.value)} 
                          className="w-full rounded p-2 transition-colors focus:outline-none" 
                          style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                          placeholder="Chase, Bank of America, Wells Fargo"
                        />
                      </div>
                    )}

                    <div className="flex items-center gap-4 mt-2">
                      <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
                        <input 
                          type="checkbox" 
                          checked={field.required} 
                          onChange={e => handleUpdateField(index, 'required', e.target.checked)} 
                          style={{ accentColor: 'var(--color-accent-primary)' }}
                        />
                        Required
                      </label>

                      <div className="flex-1">
                        <input 
                          type="text" 
                          value={field.showIf || ''} 
                          onChange={e => handleUpdateField(index, 'showIf', e.target.value)} 
                          className="w-full rounded p-2 transition-colors focus:outline-none text-xs" 
                          style={{ background: 'var(--color-bg-primary)', border: '1px dashed var(--color-border)', color: 'var(--color-text-primary)' }}
                          placeholder="Conditional Logic (e.g. {field_label} == 'Yes')"
                          title="Advanced: Enter basic logic condition. Currently experimental."
                        />
                      </div>
                    </div>
                  </div>
                ))}
                
                {fieldsSchema.length === 0 && (
                  <p className="text-sm text-center py-4" style={{ color: 'var(--color-text-tertiary)' }}>No custom fields added. The form will only ask for Date, Amount, and Receipt Image.</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6" style={{ borderTop: '1px solid var(--color-border)' }}>
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)} 
                className="px-5 py-2 rounded font-medium transition-colors"
                style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="px-6 py-2 rounded font-medium transition-transform active:scale-95 shadow"
                style={{ background: 'var(--color-accent-primary)', color: '#ffffff', border: 'none' }}
              >
                Save Template
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
