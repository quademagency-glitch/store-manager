import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import Modal from '../components/Modal';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import { Icons } from '../components/icons/Icons';

export default function AccountingSettings() {
  const toast = useToast();
  const confirm = useConfirm();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  // Search + Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  // Available Roles (fetched from API)
  const [availableRoles, setAvailableRoles] = useState([]);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('expense');
  const [assignedRoles, setAssignedRoles] = useState([]);
  const [fieldsSchema, setFieldsSchema] = useState([]);
  const [requireReceipt, setRequireReceipt] = useState(true);
  const [accountCategory, setAccountCategory] = useState('');
  const [glCode, setGlCode] = useState('');

  // Dirty tracking for unsaved changes protection
  const [isDirty, setIsDirty] = useState(false);
  const initialFormRef = useRef(null);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const data = await api.get('/accounting/templates');
      setTemplates(data);
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const data = await api.get('/roles');
      // Map to role names, exclude Platform Admin
      const roleNames = data
        .map(r => r.name)
        .filter(n => n !== 'Platform Admin');
      setAvailableRoles(roleNames);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to fetch roles:', err);
      // Fallback to defaults if roles endpoint fails
      setAvailableRoles(['Salesperson', 'Cashier', 'Manager', 'Business Admin']);
    }
  };

  useEffect(() => {
    fetchTemplates();
    fetchRoles();
  }, []);  

  const markDirty = () => setIsDirty(true);

  const handleOpenModal = (template = null) => {
    if (template) {
      setEditingTemplate(template);
      setName(template.name);
      setDescription(template.description || '');
      setType(template.type);
      setAssignedRoles(template.assigned_roles || []);
      setFieldsSchema((template.fields_schema || []).map(f => ({ ...f })));
      setRequireReceipt(template.require_receipt !== false);
      setAccountCategory(template.account_category || '');
      setGlCode(template.gl_code || '');
    } else {
      setEditingTemplate(null);
      setName('');
      setDescription('');
      setType('expense');
      setAssignedRoles([]);
      setFieldsSchema([]);
      setRequireReceipt(true);
      setAccountCategory('');
      setGlCode('');
    }
    setIsDirty(false);
    initialFormRef.current = JSON.stringify({
      name: template?.name || '',
      description: template?.description || '',
      type: template?.type || 'expense',
      assignedRoles: template?.assigned_roles || [],
      fieldsSchema: template?.fields_schema || [],
      requireReceipt: template?.require_receipt !== false,
      accountCategory: template?.account_category || '',
      glCode: template?.gl_code || '',
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = async () => {
    if (isDirty) {
      const confirmed = await confirm({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Are you sure you want to close?',
        variant: 'warning',
        confirmText: 'Discard',
      });
      if (!confirmed) return;
    }
    setIsModalOpen(false);
  };

  const handleDuplicate = async (template) => {
    try {
      const data = await api.post(`/accounting/templates/${template.id}/duplicate`);
      toast.success(`"${data.name}" created!`);
      fetchTemplates();
    } catch (err) {
      if (import.meta.env.DEV) console.error('Duplicate failed:', err);
      toast.error('Failed to duplicate template.');
    }
  };

  // ---- Field management ----
  const handleAddField = () => {
    setFieldsSchema([...fieldsSchema, { 
      id: Date.now().toString(), 
      label: '', 
      type: 'text', 
      required: false,
      options: '',
      showIf: ''
    }]);
    markDirty();
  };

  const handleUpdateField = (index, key, value) => {
    const newFields = [...fieldsSchema];
    newFields[index] = { ...newFields[index], [key]: value };
    setFieldsSchema(newFields);
    markDirty();
  };

  const handleRemoveField = (index) => {
    const newFields = [...fieldsSchema];
    newFields.splice(index, 1);
    setFieldsSchema(newFields);
    markDirty();
  };

  const handleMoveField = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= fieldsSchema.length) return;
    const newFields = [...fieldsSchema];
    [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
    setFieldsSchema(newFields);
    markDirty();
  };

  const toggleRole = (role) => {
    if (assignedRoles.includes(role)) {
      setAssignedRoles(assignedRoles.filter(r => r !== role));
    } else {
      setAssignedRoles([...assignedRoles, role]);
    }
    markDirty();
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name,
        description,
        type,
        assigned_roles: assignedRoles,
        fields_schema: fieldsSchema,
        require_receipt: requireReceipt,
        account_category: accountCategory || null,
        gl_code: glCode || null
      };

      if (editingTemplate) {
        await api.put(`/accounting/templates/${editingTemplate.id}`, payload);
        toast.success('Template updated!');
      } else {
        await api.post('/accounting/templates', payload);
        toast.success('Template created!');
      }
      setIsModalOpen(false);
      setIsDirty(false);
      fetchTemplates();
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to save template', err);
      toast.error('Failed to save template. Make sure you have Admin permissions.');
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({ title: 'Delete Template', message: 'Are you sure you want to delete this template?', variant: 'danger', confirmText: 'Delete' });
    if (!confirmed) return;
    try {
      await api.delete(`/accounting/templates/${id}`);
      toast.success('Template deleted.');
      fetchTemplates();
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to delete template', err);
      toast.error('Failed to delete template.');
    }
  };

  // ---- Filtered templates ----
  const filteredTemplates = templates.filter(t => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1 className="page-title">Accounting Template Settings</h1>
          <p className="page-subtitle">Build and manage your dynamic accounting templates (Forms).</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="btn btn-primary"
          aria-label="Create a new template"
        >
          + Create Template
        </button>
      </header>
      
      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-2xl)', color: 'var(--color-text-secondary)' }}>Loading templates...</div>
      ) : (
        <>
          {/* Search + Filter Toolbar */}
          {templates.length > 0 && (
            <div className="acct-toolbar">
              <div className="acct-search">
                <svg className="acct-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  id="settings-template-search"
                  type="text"
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="acct-filter-pills">
                {['all', 'expense', 'deposit'].map(f => (
                  <button
                    key={f}
                    className={`acct-filter-pill ${typeFilter === f ? 'active' : ''}`}
                    onClick={() => setTypeFilter(f)}
                    aria-pressed={typeFilter === f}
                  >
                    {f === 'all' ? 'All' : f === 'expense' ? 'Expenses' : 'Deposits'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Template Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTemplates.map(t => {
              const fieldCount = t.fields_schema?.length || 0;
              return (
                <div key={t.id} className={`acct-card type-${t.type}`} style={{ cursor: 'default' }}>
                  <div className="acct-card-header">
                    <div className={`acct-card-icon type-${t.type}`} aria-hidden="true">
                      {t.type === 'expense' ? Icons.dollar : Icons.bank}
                    </div>
                    <div className="acct-card-title-group">
                      <h3 className="acct-card-title">{t.name}</h3>
                      <span className={`acct-type-badge type-${t.type}`}>{t.type}</span>
                    </div>
                  </div>
                  <p className="acct-card-desc">{t.description}</p>

                  {/* Roles Section */}
                  <div className="acct-roles-section">
                    <div className="acct-roles-label">Assigned Roles</div>
                    <div className="acct-roles-list">
                      {t.assigned_roles && t.assigned_roles.length > 0 ? t.assigned_roles.map(r => (
                        <span key={r} className="acct-role-tag">{r}</span>
                      )) : <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>None</span>}
                    </div>
                  </div>

                  {/* Footer with field count */}
                  <div className="acct-card-footer" style={{ borderTop: 'none', paddingTop: 'var(--space-sm)' }}>
                    <span className="acct-card-meta">
                      {fieldCount > 0 ? `${fieldCount} custom field${fieldCount !== 1 ? 's' : ''}` : 'Standard fields only'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="acct-card-actions">
                    <button 
                      onClick={() => handleOpenModal(t)} 
                      className="acct-action-edit"
                      aria-label={`Edit ${t.name}`}
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDuplicate(t)} 
                      className="acct-action-duplicate"
                      aria-label={`Duplicate ${t.name}`}
                    >
                      Duplicate
                    </button>
                    <button 
                      onClick={() => handleDelete(t.id)} 
                      className="acct-action-delete"
                      aria-label={`Delete ${t.name}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}

            {templates.length > 0 && filteredTemplates.length === 0 && (
              <div className="acct-empty">
                <div className="acct-empty-icon" aria-hidden="true">{Icons.search}</div>
                <p className="acct-empty-title">No matching templates</p>
                <p className="acct-empty-subtitle">Try adjusting your search or filter criteria.</p>
              </div>
            )}

            {templates.length === 0 && (
              <div className="acct-empty">
                <div className="acct-empty-icon" aria-hidden="true">{Icons.clipboard}</div>
                <p className="acct-empty-title">No templates yet</p>
                <p className="acct-empty-subtitle">Create your first accounting template to enable your team to record expenses and deposits.</p>
                <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                  + Create Your First Template
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingTemplate ? "Edit Template" : "Create Template"} size="lg">
          <form onSubmit={handleSave} className="form-layout" style={{ padding: 'var(--space-lg)', overflowY: 'auto', maxHeight: '80vh' }}>
            
            {/* Section 1: Basic Info */}
            <div className="acct-form-section">
              <h4 className="acct-form-section-title">Template Details</h4>
              
              <div className="form-row" style={{ marginBottom: 'var(--space-md)' }}>
                <div className="form-group">
                  <label htmlFor="tpl-name">Template Name</label>
                  <input 
                    id="tpl-name"
                    type="text" 
                    value={name} 
                    onChange={e => { setName(e.target.value); markDirty(); }}
                    className="form-input"
                    placeholder="e.g., POS Machine Deposit"
                    required 
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="tpl-type">Type</label>
                  <select 
                    id="tpl-type"
                    value={type} 
                    onChange={e => { setType(e.target.value); markDirty(); }}
                    className="form-input"
                  >
                    <option value="expense">Expense</option>
                    <option value="deposit">Deposit (To Bank/Mobile)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="tpl-description">Description</label>
                <textarea 
                  id="tpl-description"
                  value={description} 
                  onChange={e => { setDescription(e.target.value); markDirty(); }}
                  className="form-input"
                  rows="2"
                  placeholder="Briefly describe what this template is for..."
                />
              </div>
            </div>

            {/* Section 2: Receipt & Account Category */}
            <div className="acct-form-section">
              <h4 className="acct-form-section-title">Evidence & Classification</h4>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-md)', padding: '0.6rem 0.8rem', background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                <label htmlFor="tpl-require-receipt" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-primary)', flex: 1 }}>
                  <input 
                    id="tpl-require-receipt"
                    type="checkbox" 
                    checked={requireReceipt} 
                    onChange={e => { setRequireReceipt(e.target.checked); markDirty(); }}
                    style={{ accentColor: 'var(--color-accent-primary)' }}
                  />
                  Require Receipt / Evidence
                </label>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                  {requireReceipt ? 'Users must attach a document to submit' : 'Evidence is optional'}
                </span>
              </div>

              <div className="form-row" style={{ marginBottom: 'var(--space-md)' }}>
                <div className="form-group">
                  <label htmlFor="tpl-account-category">Account Category</label>
                  <select 
                    id="tpl-account-category"
                    value={accountCategory} 
                    onChange={e => { setAccountCategory(e.target.value); markDirty(); }}
                    className="form-input"
                  >
                    <option value="">None (Uncategorized)</option>
                    <optgroup label="Expenses">
                      <option value="Operating Expense">Operating Expense</option>
                      <option value="Capital Expense">Capital Expense</option>
                      <option value="Utilities">Utilities</option>
                      <option value="Salaries">Salaries & Wages</option>
                      <option value="Rent">Rent & Lease</option>
                      <option value="Transport">Transport & Logistics</option>
                      <option value="Marketing">Marketing & Advertising</option>
                      <option value="Maintenance">Repairs & Maintenance</option>
                      <option value="Supplies">Office Supplies</option>
                      <option value="Miscellaneous Expense">Miscellaneous Expense</option>
                    </optgroup>
                    <optgroup label="Income / Revenue">
                      <option value="Revenue">Revenue</option>
                      <option value="Other Income">Other Income</option>
                    </optgroup>
                    <optgroup label="Banking">
                      <option value="Bank Deposit">Bank Deposit</option>
                      <option value="Mobile Money Deposit">Mobile Money Deposit</option>
                      <option value="Petty Cash">Petty Cash</option>
                    </optgroup>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="tpl-gl-code">GL Code <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional)</span></label>
                  <input 
                    id="tpl-gl-code"
                    type="text" 
                    value={glCode} 
                    onChange={e => { setGlCode(e.target.value); markDirty(); }}
                    className="form-input"
                    placeholder="e.g. 5200, 4100"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Role Assignment */}
            <div className="acct-form-section">
              <h4 className="acct-form-section-title">Role Assignment</h4>
              <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: 'var(--space-md)' }}>Select which roles can use this template.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {availableRoles.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRole(r)}
                    className={`acct-filter-pill ${assignedRoles.includes(r) ? 'active' : ''}`}
                    aria-pressed={assignedRoles.includes(r)}
                    style={{ fontSize: '0.78rem' }}
                  >
                    {r}
                  </button>
                ))}
                {availableRoles.length === 0 && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Loading roles...</span>
                )}
              </div>
            </div>

            {/* Section 3: Custom Fields */}
            <div className="acct-form-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                <div>
                  <h4 className="acct-form-section-title" style={{ marginBottom: '2px' }}>Custom Form Fields</h4>
                  <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', margin: 0 }}>Add extra fields beyond Date, Amount, and Receipt.</p>
                </div>
                <button 
                  type="button" 
                  onClick={handleAddField} 
                  className="btn btn-primary"
                  style={{ fontSize: '0.78rem', padding: '0.4rem 0.8rem' }}
                >
                  + Add Field
                </button>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                {fieldsSchema.map((field, index) => (
                  <div key={field.id} className="acct-field-card">
                    {/* Field header: badge + controls */}
                    <div className="acct-field-header">
                      <span className="acct-field-badge">Field {index + 1}</span>
                      <div className="acct-field-controls">
                        <button 
                          type="button"
                          className="acct-field-move-btn"
                          onClick={() => handleMoveField(index, -1)}
                          disabled={index === 0}
                          aria-label="Move field up"
                          title="Move Up"
                        >
                          ↑
                        </button>
                        <button 
                          type="button"
                          className="acct-field-move-btn"
                          onClick={() => handleMoveField(index, 1)}
                          disabled={index === fieldsSchema.length - 1}
                          aria-label="Move field down"
                          title="Move Down"
                        >
                          ↓
                        </button>
                        <button 
                          type="button" 
                          onClick={() => handleRemoveField(index)}
                          className="acct-field-remove-btn"
                          aria-label={`Remove field ${index + 1}`}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    
                    {/* Field inputs */}
                    <div className="form-row" style={{ marginBottom: 'var(--space-sm)' }}>
                      <div className="form-group">
                        <label htmlFor={`field-label-${field.id}`}>Field Label</label>
                        <input 
                          id={`field-label-${field.id}`}
                          type="text" 
                          value={field.label} 
                          onChange={e => handleUpdateField(index, 'label', e.target.value)} 
                          className="form-input"
                          placeholder="e.g. Bank Name"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor={`field-type-${field.id}`}>Input Type</label>
                        <select 
                          id={`field-type-${field.id}`}
                          value={field.type} 
                          onChange={e => handleUpdateField(index, 'type', e.target.value)}
                          className="form-input"
                        >
                          <option value="text">Text</option>
                          <option value="number">Number</option>
                          <option value="dropdown">Dropdown</option>
                        </select>
                      </div>
                    </div>

                    {field.type === 'dropdown' && (
                      <div className="form-group" style={{ marginBottom: 'var(--space-sm)' }}>
                        <label htmlFor={`field-options-${field.id}`}>Dropdown Options</label>
                        <input 
                          id={`field-options-${field.id}`}
                          type="text" 
                          value={field.options} 
                          onChange={e => handleUpdateField(index, 'options', e.target.value)} 
                          className="form-input"
                          placeholder="Comma separated: Chase, Bank of America, Wells Fargo"
                        />
                      </div>
                    )}

                    {/* Footer: Required toggle + Conditional Logic */}
                    <div className="acct-field-footer">
                      <label htmlFor={`field-required-${field.id}`}>
                        <input 
                          id={`field-required-${field.id}`}
                          type="checkbox" 
                          checked={field.required} 
                          onChange={e => handleUpdateField(index, 'required', e.target.checked)} 
                        />
                        Required
                      </label>

                      <div className="acct-field-condition">
                        <input 
                          type="text" 
                          value={field.showIf || ''} 
                          onChange={e => handleUpdateField(index, 'showIf', e.target.value)} 
                          placeholder="Conditional: {field_label} == 'Yes'"
                          aria-label={`Conditional logic for field ${index + 1}`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                
                {fieldsSchema.length === 0 && (
                  <div className="acct-fields-empty">
                    <p>No custom fields added yet.</p>
                    <p>The form will only ask for Date, Amount, and Receipt.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="acct-form-footer">
              <button 
                type="button" 
                onClick={handleCloseModal} 
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn btn-primary"
              >
                {editingTemplate ? 'Save Changes' : 'Create Template'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
