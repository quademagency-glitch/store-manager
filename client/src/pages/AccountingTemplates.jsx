import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../lib/AuthContext';
import Modal from '../components/Modal';
import { useToast } from '../hooks/useToast';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(amount || 0);
};

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

export default function AccountingTemplates() {
  const { user, role, activeLocationId } = useAuthContext();
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [locations, setLocations] = useState([]);

  // Search + Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [metadata, setMetadata] = useState({});
  const [receiptFile, setReceiptFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success state
  const [submissionResult, setSubmissionResult] = useState(null);

  const dropzoneRef = useRef(null);

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

  useEffect(() => {
    fetchTemplates();
    fetchLocations();
  }, [role, activeLocationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up file preview URL on unmount
  useEffect(() => {
    return () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    setSubmissionResult(null);
    // Reset form
    setDate(new Date().toISOString().split('T')[0]);
    setAmount('');
    setDescription('');
    setMetadata({});
    clearFile();
  };

  const handleMetadataChange = (label, value) => {
    setMetadata(prev => ({ ...prev, [label]: value }));
  };

  // ---- File handling ----
  const handleFileSelect = (file) => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.warning(`File too large (${formatFileSize(file.size)}). Maximum is 5MB.`);
      return;
    }
    setReceiptFile(file);
    if (file.type.startsWith('image/')) {
      setFilePreview(URL.createObjectURL(file));
    } else {
      setFilePreview(null);
    }
  };

  const clearFile = () => {
    if (filePreview) URL.revokeObjectURL(filePreview);
    setReceiptFile(null);
    setFilePreview(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  // ---- Submission ----
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) { toast.warning('Enter a valid amount'); return; }
    if (!selectedLocation) { toast.warning('Select a branch/location'); return; }
    
    // Enforce receipt requirement
    const needsReceipt = selectedTemplate.require_receipt !== false;
    if (needsReceipt && !receiptFile) {
      toast.warning('A receipt or evidence document is required for this template.');
      return;
    }

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

      // Show success state instead of closing
      const loc = locations.find(l => l.id === selectedLocation);
      setSubmissionResult({
        templateName: selectedTemplate.name,
        amount: formatCurrency(Number(amount)),
        date,
        location: loc?.name || 'Unknown',
      });
    } catch (err) {
      if (import.meta.env.DEV) console.error('Submit error:', err);
      toast.error('Failed to submit entry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitAnother = () => {
    setSubmissionResult(null);
    setDate(new Date().toISOString().split('T')[0]);
    setAmount('');
    setDescription('');
    setMetadata({});
    clearFile();
  };

  const handleCloseModal = () => {
    setSelectedTemplate(null);
    setSubmissionResult(null);
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
          <h1 className="page-title">Accounting Entries</h1>
          <p className="page-subtitle">Select a template below to record an expense, deposit, or other accounting entry.</p>
        </div>
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
                  id="template-search"
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
                <button 
                  key={t.id} 
                  onClick={() => handleTemplateSelect(t)}
                  className={`acct-card type-${t.type}`}
                  aria-label={`${t.name} — ${t.type} template`}
                >
                  <div className="acct-card-header">
                    <div className={`acct-card-icon type-${t.type}`}>
                      {t.type === 'expense' ? '💸' : '🏦'}
                    </div>
                    <div className="acct-card-title-group">
                      <h3 className="acct-card-title">{t.name}</h3>
                      <span className={`acct-type-badge type-${t.type}`}>{t.type}</span>
                    </div>
                  </div>
                  <p className="acct-card-desc">{t.description}</p>
                  <div className="acct-card-footer">
                    <span className="acct-card-meta">
                      {fieldCount > 0 ? `${fieldCount} custom field${fieldCount !== 1 ? 's' : ''}` : 'Standard fields only'}
                    </span>
                  </div>
                </button>
              );
            })}

            {templates.length > 0 && filteredTemplates.length === 0 && (
              <div className="acct-empty">
                <div className="acct-empty-icon">🔍</div>
                <p className="acct-empty-title">No matching templates</p>
                <p className="acct-empty-subtitle">Try adjusting your search or filter criteria.</p>
              </div>
            )}

            {templates.length === 0 && (
              <div className="acct-empty">
                <div className="acct-empty-icon">📋</div>
                <p className="acct-empty-title">No templates available</p>
                <p className="acct-empty-subtitle">No accounting templates have been assigned to your role. Contact your manager to get started.</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Entry Form Modal */}
      {selectedTemplate && (
        <Modal isOpen={!!selectedTemplate} onClose={handleCloseModal} title={selectedTemplate.name}>
          {submissionResult ? (
            /* ---- Success State ---- */
            <div className="acct-success">
              <div className="acct-success-icon">✓</div>
              <h3 className="acct-success-title">Entry Submitted</h3>
              <div className="acct-success-summary">
                <div className="acct-success-row">
                  <span className="acct-success-label">Template</span>
                  <span className="acct-success-value">{submissionResult.templateName}</span>
                </div>
                <div className="acct-success-row">
                  <span className="acct-success-label">Amount</span>
                  <span className="acct-success-value">{submissionResult.amount}</span>
                </div>
                <div className="acct-success-row">
                  <span className="acct-success-label">Date</span>
                  <span className="acct-success-value">{submissionResult.date}</span>
                </div>
                <div className="acct-success-row">
                  <span className="acct-success-label">Branch</span>
                  <span className="acct-success-value">{submissionResult.location}</span>
                </div>
              </div>
              <div className="acct-success-actions">
                <button type="button" className="btn btn-secondary" onClick={handleSubmitAnother}>
                  Submit Another
                </button>
                <button type="button" className="btn btn-primary" onClick={handleCloseModal}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* ---- Entry Form ---- */
            <form onSubmit={handleSubmit} className="form-layout" style={{ padding: 'var(--space-lg)', maxHeight: '85vh', overflowY: 'auto' }}>
              
              {/* Standard Details */}
              <div className="acct-form-section">
                <h4 className="acct-form-section-title">Standard Details</h4>
                
                <div className="form-row" style={{ marginBottom: 'var(--space-md)' }}>
                  <div className="form-group">
                    <label htmlFor="entry-date">Date</label>
                    <input 
                      id="entry-date"
                      type="date" 
                      value={date} 
                      onChange={e => setDate(e.target.value)} 
                      className="form-input"
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="entry-location">Branch / Location</label>
                    <select 
                      id="entry-location"
                      value={selectedLocation} 
                      onChange={e => setSelectedLocation(e.target.value)}
                      className="form-input"
                      required
                      disabled={locations.length === 1}
                    >
                      <option value="">Select Branch...</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 'var(--space-md)' }}>
                  <label htmlFor="entry-amount">Amount</label>
                  <div className="acct-amount-input">
                    <span className="acct-amount-currency">GH₵</span>
                    <input 
                      id="entry-amount"
                      type="number" 
                      step="0.01"
                      min="0.01"
                      inputMode="decimal"
                      value={amount} 
                      onChange={e => setAmount(e.target.value)} 
                      placeholder="0.00"
                      required 
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="entry-description">Description / Notes</label>
                  <textarea 
                    id="entry-description"
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    className="form-input"
                    rows="2"
                    placeholder="Optional notes..."
                  />
                </div>
              </div>

              {/* Template Specific Fields */}
              {selectedTemplate.fields_schema && selectedTemplate.fields_schema.length > 0 && (
                <div className="acct-form-section accent">
                  <h4 className="acct-form-section-title">Template Specific Fields</h4>
                  
                  {selectedTemplate.fields_schema.map(field => {
                    const isVisible = evaluateCondition(field.showIf);
                    if (!isVisible) return null;

                    const fieldId = `custom-field-${field.id}`;
                    return (
                      <div key={field.id} className="form-group" style={{ marginBottom: 'var(--space-md)' }}>
                        <label htmlFor={fieldId}>
                          {field.label} {field.required && <span style={{ color: 'var(--color-error)' }}>*</span>}
                        </label>
                        
                        {field.type === 'dropdown' ? (
                          <select
                            id={fieldId}
                            value={metadata[field.label] || ''}
                            onChange={e => handleMetadataChange(field.label, e.target.value)}
                            className="form-input"
                            required={field.required}
                          >
                            <option value="">Select...</option>
                            {field.options?.split(',').map(opt => (
                              <option key={opt.trim()} value={opt.trim()}>{opt.trim()}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id={fieldId}
                            type={field.type === 'number' ? 'number' : 'text'}
                            value={metadata[field.label] || ''}
                            onChange={e => handleMetadataChange(field.label, e.target.value)}
                            className="form-input"
                            required={field.required}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* File Upload */}
              {(() => {
                const needsReceipt = selectedTemplate.require_receipt !== false;
                return (
                  <div className="acct-form-section">
                    <h4 className="acct-form-section-title">
                      Upload Receipt / Evidence{needsReceipt && <span style={{ color: 'var(--color-error)', marginLeft: '4px' }}>*</span>}
                    </h4>
                    {receiptFile ? (
                      <div className="acct-file-preview">
                        <div className="acct-file-thumb">
                          {filePreview ? (
                            <img src={filePreview} alt="Receipt preview" />
                          ) : (
                            '📄'
                          )}
                        </div>
                        <div className="acct-file-info">
                          <div className="acct-file-name">{receiptFile.name}</div>
                          <div className="acct-file-size">{formatFileSize(receiptFile.size)}</div>
                        </div>
                        <button type="button" className="acct-file-remove" onClick={clearFile}>
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div
                        ref={dropzoneRef}
                        className={`acct-dropzone ${isDragging ? 'drag-over' : ''}`}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                      >
                        <div className="acct-dropzone-icon">📎</div>
                        <p className="acct-dropzone-text">Drag & drop a file here, or click to browse</p>
                        <p className="acct-dropzone-hint">Images or PDFs up to 5MB</p>
                        <input 
                          type="file" 
                          accept="image/*,.pdf"
                          onChange={e => handleFileSelect(e.target.files[0])}
                        />
                      </div>
                    )}
                    {needsReceipt && (
                      <div className={`acct-receipt-required-hint ${receiptFile ? 'satisfied' : ''}`}>
                        {receiptFile ? '✓ Evidence document attached' : '⚠ A receipt or evidence document is required to submit this entry.'}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Submit */}
              {(() => {
                const needsReceipt = selectedTemplate.require_receipt !== false;
                const receiptBlocked = needsReceipt && !receiptFile;
                return (
                  <div className="acct-form-footer">
                    <button 
                      type="button" 
                      onClick={handleCloseModal} 
                      className="btn btn-secondary"
                      disabled={isSubmitting}
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="btn btn-primary"
                      disabled={isSubmitting || receiptBlocked}
                      title={receiptBlocked ? 'Attach a receipt to enable submission' : ''}
                    >
                      {isSubmitting && (
                        <svg className="acct-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <circle cx="12" cy="12" r="10" opacity="0.25" /><path d="M4 12a8 8 0 018-8" opacity="0.75" />
                        </svg>
                      )}
                      Submit Entry
                    </button>
                  </div>
                );
              })()}
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
