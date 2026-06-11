import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../lib/AuthContext';
import Modal from '../components/Modal';
import { useToast } from '../hooks/useToast';

export default function AccountingTemplates() {
  const { user, role, locationIds, activeLocationId } = useAuthContext();
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [locations, setLocations] = useState([]);

  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [metadata, setMetadata] = useState({});
  const [receiptFile, setReceiptFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchTemplates();
    fetchLocations();
  }, [role, activeLocationId]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const data = await api.get('/accounting/templates');
      // Filter templates based on user role (Admins see all)
      const allowed = data.filter(t => {
        if (['Business Admin', 'Platform Admin'].includes(role)) return true;
        return t.assigned_roles?.includes(role);
      });
      setTemplates(allowed);
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLocations = async () => {
    try {
      const data = await api.get('/locations');
      setLocations(data);
      if (data.length === 1) {
        setSelectedLocation(data[0].id);
      } else if (activeLocationId) {
        setSelectedLocation(activeLocationId);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
    }
  };

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    // Reset form
    setDate(new Date().toISOString().split('T')[0]);
    setAmount('');
    setDescription('');
    setMetadata({});
    setReceiptFile(null);
  };

  const handleMetadataChange = (label, value) => {
    setMetadata(prev => ({ ...prev, [label]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) { toast.warning('Enter a valid amount'); return; }
    if (!selectedLocation) { toast.warning('Select a branch/location'); return; }

    try {
      setIsSubmitting(true);
      
      let receipt_url = null;
      if (receiptFile) {
        const fileExt = receiptFile.name.split('.').pop();
        const fileName = `${user.business_id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { data, error } = await supabase.storage
          .from('receipts')
          .upload(fileName, receiptFile);
          
        if (error) throw error;
        receipt_url = data.path;
      }

      const payload = {
        type: selectedTemplate.type === 'expense' ? 'expense' : 'deposit_to_bank',
        amount: Number(amount),
        description: description || selectedTemplate.name,
        location_id: selectedLocation,
        template_id: selectedTemplate.id,
        receipt_url,
        metadata,
        date
      };

      await api.post('/ledger', payload);
      toast.success('Entry submitted successfully!');
      setSelectedTemplate(null);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Submit error:', err);
      toast.error('Failed to submit entry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Safe conditional logic evaluator — no eval/new Function
  const evaluateCondition = (conditionStr) => {
    if (!conditionStr) return true;
    try {
      // Resolve {Field Label} placeholders with actual metadata values
      let resolved = conditionStr;
      Object.keys(metadata).forEach(key => {
        resolved = resolved.replace(new RegExp(`\\{${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}`, 'g'), metadata[key] || '');
      });
      // Replace unresolved placeholders with empty string
      resolved = resolved.replace(/\{[^}]+\}/g, '');

      // Parse and evaluate simple boolean expressions safely
      // Supports: ==, !=, &&, ||  with string/number operands
      const evaluateSimple = (expr) => {
        expr = expr.trim();

        // Handle || (lowest precedence)
        const orParts = splitOnOperator(expr, '||');
        if (orParts.length > 1) return orParts.some(p => evaluateSimple(p));

        // Handle && 
        const andParts = splitOnOperator(expr, '&&');
        if (andParts.length > 1) return andParts.every(p => evaluateSimple(p));

        // Handle == and !=
        for (const op of ['!=', '==']) {
          const idx = expr.indexOf(op);
          if (idx !== -1) {
            const left = stripQuotes(expr.substring(0, idx).trim());
            const right = stripQuotes(expr.substring(idx + op.length).trim());
            return op === '==' ? left === right : left !== right;
          }
        }

        // Single truthy value
        const val = stripQuotes(expr);
        return val !== '' && val !== 'false' && val !== '0';
      };

      const splitOnOperator = (expr, op) => {
        const parts = [];
        let depth = 0, start = 0;
        for (let i = 0; i < expr.length; i++) {
          if (expr[i] === '(') depth++;
          else if (expr[i] === ')') depth--;
          else if (depth === 0 && expr.substring(i, i + op.length) === op) {
            parts.push(expr.substring(start, i));
            i += op.length - 1;
            start = i + 1;
          }
        }
        parts.push(expr.substring(start));
        return parts.filter(p => p.trim());
      };

      const stripQuotes = (s) => {
        s = s.trim();
        if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
          return s.slice(1, -1);
        }
        return s;
      };

      return evaluateSimple(resolved);
    } catch (err) {
      if (import.meta.env.DEV) console.warn('Logic evaluation failed:', err);
      return true; // fail open
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto transition-colors duration-300">
      <h1 className="text-2xl font-bold mb-2 tracking-tight" style={{ color: 'var(--color-text-primary)' }}>Accounting Entries</h1>
      <p className="mb-8" style={{ color: 'var(--color-text-secondary)' }}>Select a template below to record an expense, deposit, or other accounting entry.</p>
      
      {loading ? <p style={{ color: 'var(--color-text-secondary)' }}>Loading templates...</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map(t => (
            <button 
              key={t.id} 
              onClick={() => handleTemplateSelect(t)}
              className="glass-panel p-6 rounded-xl text-left hover:-translate-y-1 transition-transform"
              style={{ display: 'flex', flexDirection: 'column' }}
            >
              <div className="flex justify-between items-start w-full mb-3">
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
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{t.description}</p>
            </button>
          ))}
          {templates.length === 0 && (
            <div className="col-span-full text-center py-12 rounded-xl" style={{ border: '1px dashed var(--color-border)', color: 'var(--color-text-tertiary)' }}>
              No templates assigned to your role. Contact your manager.
            </div>
          )}
        </div>
      )}

      {selectedTemplate && (
        <Modal isOpen={!!selectedTemplate} onClose={() => setSelectedTemplate(null)} title={selectedTemplate.name}>
          <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[85vh] overflow-y-auto">
            
            <div className="p-5 rounded-lg space-y-4 mb-6" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
              <h4 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--color-text-tertiary)' }}>Standard Details</h4>
              
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Date</label>
                  <input 
                    type="date" 
                    value={date} 
                    onChange={e => setDate(e.target.value)} 
                    className="w-full rounded p-2.5 transition-colors focus:outline-none" 
                    style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                    required 
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Branch / Location</label>
                  <select 
                    value={selectedLocation} 
                    onChange={e => setSelectedLocation(e.target.value)}
                    className="w-full rounded p-2.5 transition-colors focus:outline-none"
                    style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                    required
                    disabled={locations.length === 1}
                  >
                    <option value="">Select Branch...</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 font-medium" style={{ color: 'var(--color-text-tertiary)' }}>$</span>
                  <input 
                    type="number" 
                    step="0.01"
                    min="0.01"
                    value={amount} 
                    onChange={e => setAmount(e.target.value)} 
                    className="w-full pl-8 rounded p-2.5 text-lg font-bold transition-colors focus:outline-none" 
                    style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                    placeholder="0.00"
                    required 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Description / Notes</label>
                <textarea 
                  value={description} 
                  onChange={e => setDescription(e.target.value)} 
                  className="w-full rounded p-2.5 transition-colors focus:outline-none" 
                  style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                  rows="2"
                  placeholder="Optional notes..."
                />
              </div>
            </div>

            {selectedTemplate.fields_schema && selectedTemplate.fields_schema.length > 0 && (
              <div className="p-5 rounded-lg space-y-4 mb-6" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-accent-glow)' }}>
                <h4 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--color-accent-primary)' }}>Template Specific Fields</h4>
                
                {selectedTemplate.fields_schema.map(field => {
                  const isVisible = evaluateCondition(field.showIf);
                  if (!isVisible) return null;

                  return (
                    <div key={field.id}>
                      <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
                        {field.label} {field.required && <span style={{ color: 'var(--color-error)' }}>*</span>}
                      </label>
                      
                      {field.type === 'dropdown' ? (
                        <select
                          value={metadata[field.label] || ''}
                          onChange={e => handleMetadataChange(field.label, e.target.value)}
                          className="w-full rounded p-2.5 transition-colors focus:outline-none"
                          style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                          required={field.required}
                        >
                          <option value="">Select...</option>
                          {field.options?.split(',').map(opt => (
                            <option key={opt.trim()} value={opt.trim()}>{opt.trim()}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={field.type === 'number' ? 'number' : 'text'}
                          value={metadata[field.label] || ''}
                          onChange={e => handleMetadataChange(field.label, e.target.value)}
                          className="w-full rounded p-2.5 transition-colors focus:outline-none"
                          style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                          required={field.required}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="p-5 rounded-lg" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Upload Receipt / Deposit Slip</label>
              <input 
                type="file" 
                accept="image/*,.pdf"
                onChange={e => setReceiptFile(e.target.files[0])}
                className="block w-full text-sm cursor-pointer"
                style={{ color: 'var(--color-text-muted)' }}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button 
                type="button" 
                onClick={() => setSelectedTemplate(null)} 
                className="px-5 py-2 rounded font-medium transition-colors"
                style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="px-6 py-2 rounded font-medium transition-transform active:scale-95 shadow flex items-center gap-2"
                style={{ background: 'var(--color-accent-primary)', color: '#ffffff', border: 'none' }}
                disabled={isSubmitting}
              >
                {isSubmitting && (
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" style={{ color: 'currentColor' }}>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                Submit Entry
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
