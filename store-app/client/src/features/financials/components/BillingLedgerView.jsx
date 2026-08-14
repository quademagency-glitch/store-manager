import { useState, useEffect, useCallback } from 'react';
import { useBillingLedger } from '../../../hooks/useBillingLedger';
import { useToast } from '../../../hooks/useToast';
import { useConfirm } from '../../../hooks/useConfirm';
import { usePrintDocument } from '../../../hooks/usePrintDocument';
import { useCurrency } from '../../../hooks/useCurrency';
import { api } from '../../../lib/api';
import BillingDocumentModal from './BillingDocumentModal';
import RecordPaymentModal from './RecordPaymentModal';
import { EmptyStateRow, PageHeader, SkeletonRows, TabPanel, Tabs } from '../../../components/ui';

const STATUS_BADGE = {
  open: 'badge-secondary',
  sent: 'badge-secondary',
  partial: 'badge-warning',
  paid: 'badge-success',
  overdue: 'badge-error',
  void: 'badge-secondary',
};

// ar_invoices uses total_amount + a sent/partial/paid/overdue/void vocabulary
// (matching the existing reports.js/Reports page); ap_bills keeps the
// original amount + open/partial/paid/void.
const KIND_CONFIG = {
  ar: { amountField: 'total_amount', statuses: ['sent', 'partial', 'paid', 'overdue', 'void'], openStatus: 'sent' },
  ap: { amountField: 'amount', statuses: ['open', 'partial', 'paid', 'void'], openStatus: 'open' },
};

const AGING_BUCKETS = [
  { key: 'current', label: 'Current' },
  { key: '1_30', label: '1–30 days' },
  { key: '31_60', label: '31–60 days' },
  { key: '61_90', label: '61–90 days' },
  { key: 'over_90', label: '90+ days' },
];

/**
 * Shared list + aging view for Accounts Receivable and Accounts Payable —
 * the two are structurally identical (invoices vs bills, customers vs
 * suppliers); only labels and the API paths (handled by useBillingLedger)
 * differ.
 */
export default function BillingLedgerView({ kind, parties }) {
  const partyLabel = kind === 'ar' ? 'Customer' : 'Supplier';
  const docLabel = kind === 'ar' ? 'Invoice' : 'Bill';
  const docNumberKey = kind === 'ar' ? 'invoice_number' : 'bill_number';
  const { amountField, statuses, openStatus } = KIND_CONFIG[kind];

  const {
    documents, page, totalPages, total, aging, loading, error, setError,
    fetchDocuments, createDocument, recordPayment, voidDocument, fetchAging,
  } = useBillingLedger(kind);

  const toast = useToast();
  const confirm = useConfirm();
  const { business } = usePrintDocument();
  const { fmt } = useCurrency(business);

  const [activeTab, setActiveTab] = useState('documents');
  const [statusFilter, setStatusFilter] = useState('');
  const [locations, setLocations] = useState([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState(null);

  const loadDocuments = useCallback((pageNum = 1) => {
    fetchDocuments({ page: pageNum, status: statusFilter });
  }, [fetchDocuments, statusFilter]);

  useEffect(() => {
    loadDocuments(1);
  }, [loadDocuments]);

  useEffect(() => {
    if (activeTab === 'aging') fetchAging();
  }, [activeTab, fetchAging]);

  useEffect(() => {
    api.get('/locations').then(res => {
      if (Array.isArray(res)) setLocations(res);
    }).catch(() => {});
  }, []);

  const partyName = (doc) => (kind === 'ar' ? doc.customer?.name : doc.supplier?.name) || 'Unknown';

  const handleCreate = async (payload) => {
    setIsSubmitting(true);
    setError(null);
    const res = await createDocument(payload);
    setIsSubmitting(false);
    if (res.success) {
      setIsCreateOpen(false);
      toast.success(`${docLabel} created.`);
      loadDocuments(page);
    } else {
      setError(res.error);
    }
  };

  const handleRecordPayment = async (payload) => {
    setIsSubmitting(true);
    const res = await recordPayment(paymentTarget.id, payload);
    setIsSubmitting(false);
    if (res.success) {
      setPaymentTarget(null);
      toast.success('Payment recorded.');
      loadDocuments(page);
    } else {
      toast.error(res.error);
    }
  };

  const handleVoid = async (doc) => {
    const confirmed = await confirm({
      title: `Void ${docLabel}`,
      message: `Void ${doc[docNumberKey]}? This only works if no payments have been recorded against it.`,
      variant: 'danger',
      confirmText: 'Void',
    });
    if (!confirmed) return;
    const res = await voidDocument(doc.id);
    if (res.success) {
      toast.success(`${docLabel} voided.`);
      loadDocuments(page);
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div>
      <PageHeader
        title={kind === 'ar' ? 'Accounts Receivable' : 'Accounts Payable'}
        subtitle={kind === 'ar' ? 'Money owed to you by customers.' : 'Money you owe to suppliers.'}
        actions={
            <button className="btn btn-primary" onClick={() => { setError(null); setIsCreateOpen(true); }}>
            New {docLabel}
            </button>
        }
      />

      <Tabs
        idPrefix="ledger"
        variant="underline"
        items={[
          { id: 'documents', label: `${docLabel}s` },
          { id: 'aging', label: 'Aging Report' },
        ]}
        value={activeTab}
        onChange={setActiveTab}
        ariaLabel={`${docLabel} sections`}
      />

      {error && <div className="alert alert-error mb-xl">{error}</div>}

      <TabPanel idPrefix="ledger" id="documents" value={activeTab}>
        <>
          <div className="mb-lg flex gap-sm">
            <select className="form-input" style={{ maxWidth: '220px' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {statuses.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>

          <div className="glass-panel">
            <table className="glass-table">
              <thead>
                <tr>
                  <th>{docLabel} #</th>
                  <th>{partyLabel}</th>
                  <th>Amount</th>
                  <th>Outstanding</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonRows rows={4} cols={7} />
                ) : documents.length === 0 ? (
                  <EmptyStateRow colSpan={7} icon="billing" title={`No ${docLabel.toLowerCase()}s found`} hint={statusFilter ? 'Try clearing the status filter.' : `New ${docLabel.toLowerCase()}s will appear here.`} />
                ) : (
                  documents.map(doc => {
                    const outstanding = Number(doc[amountField]) - Number(doc.amount_paid);
                    return (
                      <tr key={doc.id}>
                        <td className="font-bold">
                          {doc[docNumberKey]}
                          {doc.is_opening_balance && <span className="badge badge-secondary ml-sm" style={{ fontSize: '0.65rem' }}>Opening</span>}
                        </td>
                        <td>{partyName(doc)}</td>
                        <td>{fmt(doc[amountField])}</td>
                        <td>{fmt(outstanding)}</td>
                        <td className="text-muted">{doc.due_date ? new Date(doc.due_date).toLocaleDateString() : '—'}</td>
                        <td><span className={`badge ${STATUS_BADGE[doc.status] || 'badge-secondary'}`}>{doc.status}</span></td>
                        <td className="text-right">
                          {doc.status !== 'void' && doc.status !== 'paid' && (
                            <button className="btn btn-sm btn-outline mr-sm" onClick={() => setPaymentTarget({ ...doc, outstanding })}>Record Payment</button>
                          )}
                          {doc.status === openStatus && Number(doc.amount_paid) === 0 && (
                            <button className="btn btn-sm btn-outline text-error" onClick={() => handleVoid(doc)}>Void</button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="p-md border-t flex justify-between items-center">
                <div className="text-sm text-muted">Page {page} of {totalPages} ({total} total)</div>
                <div className="flex gap-sm">
                  <button className="btn btn-secondary btn-sm" onClick={() => loadDocuments(Math.max(1, page - 1))} disabled={page === 1}>Previous</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => loadDocuments(Math.min(totalPages, page + 1))} disabled={page === totalPages}>Next</button>
                </div>
              </div>
            )}
          </div>
        </>
      </TabPanel>

      <TabPanel idPrefix="ledger" id="aging" value={activeTab}>
        <div>
          <div className="stats-grid mb-xl" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-lg)' }}>
            {AGING_BUCKETS.map(bucket => (
              <div key={bucket.key} className="pos-glass-card" style={{ padding: 'var(--space-lg)' }}>
                <span className="stat-label" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>{bucket.label}</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px' }}>
                  {fmt(aging?.totals?.[bucket.key])}
                </div>
              </div>
            ))}
          </div>

          {AGING_BUCKETS.map(bucket => {
            const rows = aging?.buckets?.[bucket.key] || [];
            if (rows.length === 0) return null;
            return (
              <div key={bucket.key} className="glass-panel mb-lg">
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', fontWeight: 600 }}>{bucket.label}</div>
                <table className="glass-table">
                  <thead>
                    <tr>
                      <th>{docLabel} #</th>
                      <th>{partyLabel}</th>
                      <th>Outstanding</th>
                      <th>Days Overdue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.id}>
                        <td>{row[docNumberKey]}</td>
                        <td>{(kind === 'ar' ? row.customer?.name : row.supplier?.name) || 'Unknown'}</td>
                        <td>{fmt(row.outstanding)}</td>
                        <td className="text-muted">{row.days_overdue > 0 ? row.days_overdue : 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </TabPanel>

      <BillingDocumentModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreate}
        kind={kind}
        parties={parties}
        isSubmitting={isSubmitting}
        error={error}
      />

      <RecordPaymentModal
        isOpen={!!paymentTarget}
        onClose={() => setPaymentTarget(null)}
        onSubmit={handleRecordPayment}
        document={paymentTarget}
        outstanding={paymentTarget?.outstanding}
        locations={locations}
        isSubmitting={isSubmitting}
        error={null}
      />
    </div>
  );
}
