import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../lib/AuthContext';
import Modal from '../components/Modal';

export default function AccountingTemplates() {
  const { user, role, locationIds, activeLocationId } = useAuthContext();
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
      // Filter templates based on user role (Admins and Managers see all)
      const allowed = data.filter(t => {
        if (['Business Admin', 'Platform Admin', 'Manager'].includes(role)) return true;
        return t.assigned_roles?.includes(role);
      });
      setTemplates(allowed);
    } catch (err) {
      console.error(err);
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
      console.error(err);
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
    if (!amount || Number(amount) <= 0) return alert('Enter a valid amount');
    if (!selectedLocation) return alert('Select a branch/location');

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
      alert('Entry submitted successfully!');
      setSelectedTemplate(null);
    } catch (err) {
      console.error('Submit error:', err);
      alert('Failed to submit entry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Basic conditional logic evaluator
  const evaluateCondition = (conditionStr) => {
    if (!conditionStr) return true;
    try {
      // E.g. "Payment Method == 'Mobile'" -> Replace {Field Label} with metadata['Field Label']
      // This is a naive implementation for basic rules.
      let evalStr = conditionStr;
      Object.keys(metadata).forEach(key => {
        // replace {key} with the actual value (stringified)
        evalStr = evalStr.replace(new RegExp(`{${key}}`, 'g'), `'${metadata[key]}'`);
      });
      // Removing curly braces that weren't matched (empty fields)
      evalStr = evalStr.replace(/{[^}]+}/g, "''");
      
      // Extremely unsafe to use eval in production if users can inject arbitrary JS,
      // but since it's admin configured internal logic:
      // eslint-disable-next-line no-new-func
      return new Function(`return ${evalStr}`)();
    } catch (err) {
      console.warn("Logic evaluation failed:", err);
      return true; // fail open
    }
  };

  return (
    <div className="p-6 text-white max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Accounting Entries</h1>
      <p className="mb-6 text-gray-400">Select a template below to record an expense, deposit, or other accounting entry.</p>
      
      {loading ? <p>Loading templates...</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map(t => (
            <button 
              key={t.id} 
              onClick={() => handleTemplateSelect(t)}
              className="p-6 bg-slate-800 border border-slate-700 hover:border-indigo-500 transition-colors rounded-xl shadow-lg text-left group"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg group-hover:text-indigo-400 transition-colors">{t.name}</h3>
                <span className={`px-2 py-1 text-[10px] rounded font-bold uppercase ${t.type === 'expense' ? 'bg-red-900/50 text-red-400' : 'bg-green-900/50 text-green-400'}`}>
                  {t.type}
                </span>
              </div>
              <p className="text-sm text-gray-400">{t.description}</p>
            </button>
          ))}
          {templates.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-500 bg-slate-800/50 rounded-xl border border-dashed border-slate-700">
              No templates assigned to your role. Contact your manager.
            </div>
          )}
        </div>
      )}

      {selectedTemplate && (
        <Modal isOpen={!!selectedTemplate} onClose={() => setSelectedTemplate(null)} title={selectedTemplate.name}>
          <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[85vh] overflow-y-auto">
            
            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 space-y-4 mb-6">
              <h4 className="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wider">Standard Details</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-300">Date</label>
                  <input 
                    type="date" 
                    value={date} 
                    onChange={e => setDate(e.target.value)} 
                    className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white" 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-300">Branch / Location</label>
                  <select 
                    value={selectedLocation} 
                    onChange={e => setSelectedLocation(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"
                    required
                    disabled={locations.length === 1}
                  >
                    <option value="">Select Branch...</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-slate-300">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400">$</span>
                  <input 
                    type="number" 
                    step="0.01"
                    min="0.01"
                    value={amount} 
                    onChange={e => setAmount(e.target.value)} 
                    className="w-full pl-8 bg-slate-800 border border-slate-600 rounded p-2 text-white text-lg font-bold" 
                    placeholder="0.00"
                    required 
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-slate-300">Description / Notes</label>
                <textarea 
                  value={description} 
                  onChange={e => setDescription(e.target.value)} 
                  className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white" 
                  rows="2"
                  placeholder="Optional notes..."
                />
              </div>
            </div>

            {selectedTemplate.fields_schema && selectedTemplate.fields_schema.length > 0 && (
              <div className="bg-indigo-900/10 p-4 rounded-lg border border-indigo-900/30 space-y-4 mb-6">
                <h4 className="text-sm font-semibold text-indigo-300 mb-2 uppercase tracking-wider">Template Specific Fields</h4>
                
                {selectedTemplate.fields_schema.map(field => {
                  const isVisible = evaluateCondition(field.showIf);
                  if (!isVisible) return null;

                  return (
                    <div key={field.id}>
                      <label className="block text-sm font-medium mb-1 text-slate-300">
                        {field.label} {field.required && <span className="text-red-400">*</span>}
                      </label>
                      
                      {field.type === 'dropdown' ? (
                        <select
                          value={metadata[field.label] || ''}
                          onChange={e => handleMetadataChange(field.label, e.target.value)}
                          className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"
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
                          className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"
                          required={field.required}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
              <label className="block text-sm font-medium mb-2 text-slate-300">Upload Receipt / Deposit Slip</label>
              <input 
                type="file" 
                accept="image/*,.pdf"
                onChange={e => setReceiptFile(e.target.files[0])}
                className="block w-full text-sm text-slate-400
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-indigo-600 file:text-white
                  hover:file:bg-indigo-700 cursor-pointer"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button 
                type="button" 
                onClick={() => setSelectedTemplate(null)} 
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded font-semibold transition-colors"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold transition-colors shadow flex items-center gap-2"
                disabled={isSubmitting}
              >
                {isSubmitting && (
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
