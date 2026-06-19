import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useImports } from '../hooks/useImports';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';

const ENTITY_CONFIG = {
  products: {
    label: 'Products',
    requiredFields: ['name', 'sku', 'price'],
    optionalFields: ['category', 'cost_price', 'opening_quantity', 'location_id'],
    fieldHints: {
      opening_quantity: 'Starting stock quantity at the location below (leave blank for 0)',
      location_id: 'The location ID this opening stock applies to (see Business Admin > Locations)',
    },
  },
  customers: {
    label: 'Customers',
    requiredFields: ['name', 'phone'],
    optionalFields: ['opening_ar_amount', 'opening_ar_as_of_date', 'opening_ar_description'],
    fieldHints: {
      opening_ar_amount: 'Outstanding balance this customer owed you before go-live (leave blank if none)',
      opening_ar_as_of_date: 'Required if opening_ar_amount is set — the date that balance was accurate as of',
    },
  },
  suppliers: {
    label: 'Suppliers',
    requiredFields: ['name'],
    optionalFields: ['contact_person', 'phone', 'email', 'address', 'notes', 'opening_ap_amount', 'opening_ap_as_of_date', 'opening_ap_description'],
    fieldHints: {
      opening_ap_amount: 'Outstanding balance you owed this supplier before go-live (leave blank if none)',
      opening_ap_as_of_date: 'Required if opening_ap_amount is set — the date that balance was accurate as of',
    },
  },
};

const STEPS = ['Upload', 'Map Columns', 'Review', 'Results'];

export default function ImportWizard() {
  const { entityType } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { loading, uploadPreview, validateRows, commitImport, previewUndo, undoBatch } = useImports();
  const [isUndone, setIsUndone] = useState(false);

  const config = ENTITY_CONFIG[entityType];

  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [fieldToHeader, setFieldToHeader] = useState({});
  const [validation, setValidation] = useState(null);
  const [commitResult, setCommitResult] = useState(null);

  if (!config) {
    return <div className="alert alert-error">Unknown import type "{entityType}".</div>;
  }

  const allFields = [...config.requiredFields, ...config.optionalFields];

  const handleFileChange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);

    const res = await uploadPreview(f, entityType);
    if (!res) return;

    setHeaders(res.headers);
    setRows(res.rows);

    const inverted = {};
    Object.entries(res.suggested_mapping || {}).forEach(([header, field]) => {
      inverted[field] = header;
    });
    setFieldToHeader(inverted);
    setStep(1);
  };

  const buildColumnMapping = () => {
    const mapping = {};
    Object.entries(fieldToHeader).forEach(([field, header]) => {
      if (header) mapping[header] = field;
    });
    return mapping;
  };

  const handleValidate = async () => {
    const columnMapping = buildColumnMapping();
    const missingRequired = config.requiredFields.filter(f => !fieldToHeader[f]);
    if (missingRequired.length > 0) {
      toast.error(`Please map a column for: ${missingRequired.join(', ')}`);
      return;
    }

    const res = await validateRows({ entityType, columnMapping, rows });
    if (!res) return;
    setValidation(res);
    setStep(2);
  };

  const handleCommit = async () => {
    const columnMapping = buildColumnMapping();
    const res = await commitImport({ entityType, sourceFilename: file?.name || 'upload', columnMapping, rows });
    if (!res) return;
    setCommitResult(res);
    setStep(3);
    toast.success(`Imported ${res.batch.success_count} of ${res.batch.total_rows} rows.`);
  };

  const reset = () => {
    setStep(0);
    setFile(null);
    setHeaders([]);
    setRows([]);
    setFieldToHeader({});
    setValidation(null);
    setCommitResult(null);
    setIsUndone(false);
  };

  const handleUndo = async () => {
    const batchId = commitResult.batch.id;
    const preview = await previewUndo(batchId);
    if (!preview) return;

    const deleted = preview.outcomes.filter(o => o.action === 'deleted').length;
    const compensated = preview.outcomes.filter(o => o.action === 'compensated').length;
    const blocked = preview.outcomes.filter(o => o.action === 'blocked').length;

    const confirmed = await confirm({
      title: 'Undo This Import',
      message: `This will permanently delete ${deleted} record(s). ${compensated} record(s) have other activity and will be left in place with stock reversed instead. ${blocked} record(s) have payments or sales against them and cannot be touched.`,
      variant: 'danger',
      confirmText: 'Undo Import',
    });
    if (!confirmed) return;

    const result = await undoBatch(batchId);
    if (result) {
      setIsUndone(true);
      toast.success('Import undone.');
    }
  };

  return (
    <div>
      <header className="page-header">
        <h1 className="dashboard-title">Import {config.label}</h1>
        <p className="dashboard-subtitle">Upload a CSV or Excel file to bulk-create {config.label.toLowerCase()}.</p>
      </header>

      <div className="mb-xl" style={{ display: 'flex', gap: '8px' }}>
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`badge ${i === step ? 'badge-primary' : i < step ? 'badge-success' : 'badge-secondary'}`}
          >
            {i + 1}. {label}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="glass-panel" style={{ padding: 'var(--space-xl)' }}>
          <p>Upload a .csv or .xlsx file. Required columns: <strong>{config.requiredFields.join(', ')}</strong>.</p>
          <p className="text-muted">Optional columns: {config.optionalFields.join(', ')}.</p>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} disabled={loading} className="form-input" style={{ marginTop: '16px' }} />
          {loading && <p className="text-muted mt-sm">Reading file...</p>}
        </div>
      )}

      {step === 1 && (
        <div className="glass-panel" style={{ padding: 'var(--space-xl)' }}>
          <h3 className="mb-lg">Map your columns</h3>
          <p className="text-muted mb-lg">We matched what we could automatically — confirm or adjust each field below.</p>

          {allFields.map(field => (
            <div key={field} className="form-row mb-md" style={{ alignItems: 'center' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>
                  {field} {config.requiredFields.includes(field) && <span className="text-error">*</span>}
                </label>
                {config.fieldHints[field] && <small className="text-muted" style={{ display: 'block' }}>{config.fieldHints[field]}</small>}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <select
                  className="form-input"
                  value={fieldToHeader[field] || ''}
                  onChange={(e) => setFieldToHeader(prev => ({ ...prev, [field]: e.target.value }))}
                >
                  <option value="">— Not in file —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>
          ))}

          <div className="modal-footer mt-xl" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={reset}>Start Over</button>
            <button className="btn btn-primary" onClick={handleValidate} disabled={loading}>
              {loading ? 'Validating...' : 'Validate Rows'}
            </button>
          </div>
        </div>
      )}

      {step === 2 && validation && (
        <div className="glass-panel" style={{ padding: 'var(--space-xl)' }}>
          <div className="stats-grid mb-xl" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-lg)' }}>
            <div className="pos-glass-card" style={{ padding: 'var(--space-lg)' }}>
              <span className="stat-label text-muted">Total Rows</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{validation.total_rows}</div>
            </div>
            <div className="pos-glass-card" style={{ padding: 'var(--space-lg)' }}>
              <span className="stat-label text-muted">Ready to Import</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-success)' }}>{validation.valid_count}</div>
            </div>
            <div className="pos-glass-card" style={{ padding: 'var(--space-lg)' }}>
              <span className="stat-label text-muted">Errors</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: validation.error_count > 0 ? 'var(--color-error)' : 'inherit' }}>{validation.error_count}</div>
            </div>
            <div className="pos-glass-card" style={{ padding: 'var(--space-lg)' }}>
              <span className="stat-label text-muted">Warnings</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: validation.warning_count > 0 ? 'var(--color-warning)' : 'inherit' }}>{validation.warning_count}</div>
            </div>
          </div>

          {validation.errors.length > 0 && (
            <div className="mb-lg">
              <h4 className="text-error mb-sm">Errors (these rows will be skipped)</h4>
              <table className="glass-table">
                <thead><tr><th>Row</th><th>Field</th><th>Message</th></tr></thead>
                <tbody>
                  {validation.errors.slice(0, 50).map((e, i) => (
                    <tr key={i}><td>{e.row}</td><td>{e.field}</td><td>{e.message}</td></tr>
                  ))}
                </tbody>
              </table>
              {validation.errors.length > 50 && <p className="text-muted">...and {validation.errors.length - 50} more.</p>}
            </div>
          )}

          {validation.warnings.length > 0 && (
            <div className="mb-lg">
              <h4 className="text-warning mb-sm">Warnings (these rows will still import)</h4>
              <table className="glass-table">
                <thead><tr><th>Row</th><th>Field</th><th>Message</th></tr></thead>
                <tbody>
                  {validation.warnings.slice(0, 50).map((w, i) => (
                    <tr key={i}><td>{w.row}</td><td>{w.field}</td><td>{w.message}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="modal-footer mt-xl" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>Back to Mapping</button>
            <button className="btn btn-primary" onClick={handleCommit} disabled={loading || validation.valid_count === 0}>
              {loading ? 'Importing...' : `Import ${validation.valid_count} Rows`}
            </button>
          </div>
        </div>
      )}

      {step === 3 && commitResult && (
        <div className="glass-panel" style={{ padding: 'var(--space-xl)' }}>
          <h3 className="mb-lg">Import Complete</h3>
          <p>
            Successfully imported <strong>{commitResult.batch.success_count}</strong> of <strong>{commitResult.batch.total_rows}</strong> rows.
            {commitResult.batch.error_count > 0 && <span className="text-error"> {commitResult.batch.error_count} row(s) failed.</span>}
          </p>

          {commitResult.outcomes.filter(o => !o.success).length > 0 && (
            <table className="glass-table mt-lg">
              <thead><tr><th>Row</th><th>Error</th></tr></thead>
              <tbody>
                {commitResult.outcomes.filter(o => !o.success).map((o, i) => (
                  <tr key={i}><td>{o.row}</td><td className="text-error">{o.error}</td></tr>
                ))}
              </tbody>
            </table>
          )}

          {isUndone && <div className="alert alert-success mt-lg">This import has been undone.</div>}

          {!isUndone && entityType === 'products' && commitResult.batch.success_count > 0 && (
            <div className="alert alert-info mt-lg">
              Opening stock quantities here are estimates. Once you've done a physical count, reconcile your{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); navigate('/inventory?tab=audits'); }}>opening stock counts</a> to correct any discrepancies.
            </div>
          )}

          <div className="modal-footer mt-xl" style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            {!isUndone && commitResult.batch.success_count > 0 && (
              <button className="btn btn-outline text-error" onClick={handleUndo}>Undo This Import</button>
            )}
            <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
              <button className="btn btn-secondary" onClick={reset}>Import Another File</button>
              <button className="btn btn-primary" onClick={() => navigate(entityType === 'products' ? '/inventory' : `/${entityType}`)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
