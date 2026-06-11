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
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-300">Template Name</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" 
                  placeholder="e.g., POS Machine Deposit"
                  required 
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-300">Type</label>
                <select 
                  value={type} 
                  onChange={e => setType(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                >
                  <option value="expense">Expense</option>
                  <option value="deposit">Deposit (To Bank/Mobile)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">Description</label>
              <textarea 
                value={description} 
                onChange={e => setDescription(e.target.value)} 
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" 
                rows="2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">Who can use this template?</label>
              <div className="flex flex-wrap gap-2">
                {availableRoles.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRole(r)}
                    className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                      assignedRoles.includes(r) 
                        ? 'bg-indigo-600 border-indigo-500 text-white' 
                        : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-400'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-700 pt-6">
              <div className="flex justify-between items-center mb-4">
                <label className="block text-lg font-bold text-slate-200">Custom Form Fields</label>
                <button type="button" onClick={handleAddField} className="text-sm bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded font-semibold">
                  + Add Field
                </button>
              </div>
              
              <div className="space-y-4">
                {fieldsSchema.map((field, index) => (
                  <div key={field.id} className="p-4 bg-slate-900 border border-slate-700 rounded-lg relative">
                    <button 
                      type="button" 
                      onClick={() => handleRemoveField(index)}
                      className="absolute top-2 right-2 text-slate-500 hover:text-red-400"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Field Label</label>
                        <input 
                          type="text" 
                          value={field.label} 
                          onChange={e => handleUpdateField(index, 'label', e.target.value)} 
                          className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-sm" 
                          placeholder="e.g. Bank Name"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Input Type</label>
                        <select 
                          value={field.type} 
                          onChange={e => handleUpdateField(index, 'type', e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-sm"
                        >
                          <option value="text">Text</option>
                          <option value="number">Number</option>
                          <option value="dropdown">Dropdown</option>
                        </select>
                      </div>
                    </div>

                    {field.type === 'dropdown' && (
                      <div className="mb-3">
                        <label className="block text-xs text-slate-400 mb-1">Options (comma separated)</label>
                        <input 
                          type="text" 
                          value={field.options} 
                          onChange={e => handleUpdateField(index, 'options', e.target.value)} 
                          className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-sm" 
                          placeholder="Chase, Bank of America, Wells Fargo"
                        />
                      </div>
                    )}

                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input 
                          type="checkbox" 
                          checked={field.required} 
                          onChange={e => handleUpdateField(index, 'required', e.target.checked)} 
                          className="rounded bg-slate-800 border-slate-700"
                        />
                        Required Field
                      </label>

                      <div className="flex-1">
                        <input 
                          type="text" 
                          value={field.showIf || ''} 
                          onChange={e => handleUpdateField(index, 'showIf', e.target.value)} 
                          className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-sm" 
                          placeholder="Conditional Logic (e.g. {field_label} == 'Yes')"
                          title="Advanced: Enter basic logic condition. Currently experimental."
                        />
                      </div>
                    </div>
                  </div>
                ))}
                
                {fieldsSchema.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-4">No custom fields added. The form will only ask for Date, Amount, and Receipt Image.</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-slate-700">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded font-semibold transition-colors">
                Cancel
              </button>
              <button type="submit" className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold transition-colors shadow">
                Save Template
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
