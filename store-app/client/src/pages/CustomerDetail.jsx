import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCustomers } from '../hooks/useCustomers';
import { useLoyalty } from '../hooks/useLoyalty';
import { useBillingLedger } from '../hooks/useBillingLedger';
import { useAuthContext } from '../lib/AuthContext';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import { usePrintDocument } from '../hooks/usePrintDocument';
import { useCurrency } from '../hooks/useCurrency';
import { api } from '../lib/api';
import Modal from '../components/Modal';
import RecordPaymentModal from '../features/financials/components/RecordPaymentModal';
import { PageHeader, TabPanel, Tabs } from '../components/ui';

const TABS = [
  { key: 'purchases', label: 'Purchase History' },
  { key: 'credit', label: 'Credit (AR)', permission: 'manage_financials' },
  { key: 'store_credit', label: 'Deposits' },
  { key: 'loyalty', label: 'Loyalty Points' },
  { key: 'notes', label: 'Notes' },
];

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role, hasPermission, user } = useAuthContext();
  const toast = useToast();
  const confirm = useConfirm();
  const canEdit = role === 'Business Admin' || role === 'Platform Admin';

  const { business, printElement } = usePrintDocument();
  const { fmt } = useCurrency(business);

  const { fetchCustomer, updateCustomer, deleteCustomer } = useCustomers();
  const loyalty = useLoyalty();
  const ar = useBillingLedger('ar');

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('purchases');

  const [sales, setSales] = useState([]);
  const [salesLoading, setSalesLoading] = useState(false);

  const [storeCreditLedger, setStoreCreditLedger] = useState([]);

  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesPending, setNotesPending] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', credit_limit: '' });

  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [depositForm, setDepositForm] = useState({ amount: '', note: '' });
  const [isSubmittingDeposit, setIsSubmittingDeposit] = useState(false);

  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [withdrawStep, setWithdrawStep] = useState(1);
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', note: '', code: '', location_id: '' });
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState(false);

  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [verifyStep, setVerifyStep] = useState(1);
  const [verifyCode, setVerifyCode] = useState('');
  const [isSubmittingVerify, setIsSubmittingVerify] = useState(false);

  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [statement, setStatement] = useState(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementRange, setStatementRange] = useState({ from: '', to: '' });

  const [locations, setLocations] = useState([]);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  const visibleTabs = TABS.filter(t => !t.permission || hasPermission(t.permission));

  const loadCustomer = useCallback(async () => {
    setLoading(true);
    const data = await fetchCustomer(id);
    setCustomer(data);
    setLoading(false);
  }, [fetchCustomer, id]);

  const loadSales = useCallback(async () => {
    setSalesLoading(true);
    try {
      const data = await api.get(`/sales?customer_id=${id}&limit=50`);
      setSales(data.data || []);
    } catch {
      setSales([]);
    } finally {
      setSalesLoading(false);
    }
  }, [id]);

  const loadStoreCredit = useCallback(async () => {
    await loyalty.fetchStoreCredit(id);
    try {
      const data = await api.get(`/loyalty/store-credit/${id}/ledger`);
      setStoreCreditLedger(data.data || []);
    } catch {
      setStoreCreditLedger([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadNotes = useCallback(async () => {
    setNotesLoading(true);
    try {
      const data = await api.get(`/customers/${id}/notes`);
      setNotes(data.data || []);
      /* The server says so explicitly rather than us inferring it from an
         empty list, which would show the same thing for "no notes yet". */
      setNotesPending(!!data.pending_migration);
    } catch {
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  }, [id]);

  useEffect(() => { loadCustomer(); }, [loadCustomer]);
  useEffect(() => { loadSales(); }, [loadSales]);
  useEffect(() => { loadStoreCredit(); }, [loadStoreCredit]);
  useEffect(() => { loyalty.fetchBalance(id); loyalty.fetchLedger(id); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (activeTab === 'notes') loadNotes(); }, [activeTab, loadNotes]);

  useEffect(() => {
    if (activeTab === 'credit' && hasPermission('manage_financials')) {
      ar.fetchDocuments({ customer_id: id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, id]);

  useEffect(() => {
    api.get('/locations').then(res => { 
      if (Array.isArray(res)) {
        const userLocs = user?.user_metadata?.location_ids || [];
        const userLoc = user?.user_metadata?.location_id;
        const isAdmin = role === 'Platform Admin' || role === 'Business Admin';
        
        let filtered = res;
        if (!isAdmin && userLocs.length <= 1) {
          filtered = res.filter(l => l.id === userLoc || userLocs.includes(l.id));
        }
        setLocations(filtered);
      }
    }).catch(() => {
      toast.error("Couldn't load branches. Refresh to try again.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, user]);

  useEffect(() => {
    if (locations.length === 1) {
      setWithdrawForm(prev => ({ ...prev, location_id: locations[0].id }));
    }
  }, [locations]);

  const openEditModal = () => {
    setEditForm({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      /* '' is "no limit", which is not 0. The server reads a blank as NULL and
         a 0 as "this customer pays cash", so the two must stay distinguishable
         all the way through the form. */
      credit_limit: customer.credit_limit === null || customer.credit_limit === undefined
        ? ''
        : String(customer.credit_limit),
    });
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    const res = await updateCustomer(id, editForm);
    if (res.success) {
      setCustomer(prev => ({
        ...prev,
        ...editForm,
        credit_limit: editForm.credit_limit === '' ? null : Number(editForm.credit_limit),
      }));
      setIsEditOpen(false);
      toast.success('Customer updated.');
    } else {
      toast.error(res.error);
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm({ title: 'Delete Customer', message: 'Are you sure you want to delete this customer?', variant: 'danger', confirmText: 'Delete' });
    if (!confirmed) return;
    const res = await deleteCustomer(id);
    if (res.success) {
      toast.success('Customer deleted.');
      navigate('/customers');
    } else {
      toast.error(res.error);
    }
  };

  const handleDeposit = async (e) => {
    e.preventDefault();
    const amount = Number(depositForm.amount);
    if (!amount || amount <= 0) return;
    setIsSubmittingDeposit(true);
    try {
      await loyalty.issueStoreCredit(id, amount, 'issue', undefined, depositForm.note || 'Cash deposit');
      await loadStoreCredit();
      setIsDepositOpen(false);
      setDepositForm({ amount: '', note: '' });
      toast.success('Deposit recorded.');
    } catch (err) {
      toast.error(err.message || 'Failed to record deposit');
    } finally {
      setIsSubmittingDeposit(false);
    }
  };

  const handleWithdrawRequest = async (e) => {
    e.preventDefault();
    const amount = Number(withdrawForm.amount);
    if (!amount || amount <= 0) return;
    if (amount > loyalty.storeCreditBalance) {
      toast.error('Withdrawal amount exceeds available deposit balance.');
      return;
    }
    if (!withdrawForm.location_id) {
      toast.error('Please select a till location to withdraw cash from.');
      return;
    }
    setIsSubmittingWithdraw(true);
    try {
      await api.post(`/customers/${id}/send-verification`);
      setWithdrawStep(2);
      toast.success('Verification code sent to customer.');
    } catch (err) {
      toast.error(err.message || 'Failed to send verification code');
    } finally {
      setIsSubmittingWithdraw(false);
    }
  };

  const handleWithdrawConfirm = async (e) => {
    e.preventDefault();
    if (!withdrawForm.code) return;
    setIsSubmittingWithdraw(true);
    try {
      await api.post(`/loyalty/store-credit/withdraw`, {
        customer_id: id,
        amount: Number(withdrawForm.amount),
        code: withdrawForm.code,
        location_id: withdrawForm.location_id,
        note: withdrawForm.note || 'Cash Withdrawal'
      });
      await loadStoreCredit();
      setIsWithdrawOpen(false);
      setWithdrawStep(1);
      setWithdrawForm({ amount: '', note: '', code: '', location_id: '' });
      toast.success('Funds withdrawn successfully.');
    } catch (err) {
      toast.error(err.message || 'Failed to complete withdrawal. Incorrect code?');
    } finally {
      setIsSubmittingWithdraw(false);
    }
  };

  /* Verification had no route in from this page. is_verified was rendered only
     when true, so an unverified customer looked identical to one whose badge
     had failed to render, and the only caller of send-verification was the
     withdrawal flow: a customer could not be verified without withdrawing
     money. Same two-step code exchange, on its own. */
  const handleSendVerification = async () => {
    setIsSubmittingVerify(true);
    try {
      await api.post(`/customers/${id}/send-verification`);
      setVerifyStep(2);
      toast.success('Verification code sent.');
    } catch (err) {
      toast.error(err.message || 'Failed to send verification code');
    } finally {
      setIsSubmittingVerify(false);
    }
  };

  const handleConfirmVerification = async (e) => {
    e.preventDefault();
    if (!verifyCode) return;
    setIsSubmittingVerify(true);
    try {
      await api.post(`/customers/${id}/verify`, { code: verifyCode });
      await loadCustomer();
      setIsVerifyOpen(false);
      setVerifyStep(1);
      setVerifyCode('');
      toast.success('Customer verified.');
    } catch (err) {
      toast.error(err.message || 'Could not verify. Check the code and try again.');
    } finally {
      setIsSubmittingVerify(false);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    const body = noteDraft.trim();
    if (!body) return;
    setIsSavingNote(true);
    try {
      await api.post(`/customers/${id}/notes`, { body });
      setNoteDraft('');
      await loadNotes();
      toast.success('Note added.');
    } catch (err) {
      toast.error(err.message || 'Failed to add note');
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    const ok = await confirm({
      title: 'Delete this note?',
      message: 'Notes are a record of what was agreed with the customer. This cannot be undone.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/customers/${id}/notes/${noteId}`);
      await loadNotes();
      toast.success('Note deleted.');
    } catch (err) {
      toast.error(err.message || 'Failed to delete note');
    }
  };

  const loadStatement = async (range = statementRange) => {
    setStatementLoading(true);
    try {
      const qs = new URLSearchParams();
      if (range.from) qs.set('from', range.from);
      if (range.to) qs.set('to', range.to);
      const suffix = qs.toString() ? `?${qs}` : '';
      setStatement(await api.get(`/customers/${id}/statement${suffix}`));
    } catch (err) {
      toast.error(err.message || 'Failed to build the statement');
      setStatement(null);
    } finally {
      setStatementLoading(false);
    }
  };

  const openStatement = () => {
    setIsStatementOpen(true);
    loadStatement();
  };

  const handleRecordPayment = async (payload) => {
    setIsSubmittingPayment(true);
    const res = await ar.recordPayment(paymentTarget.id, payload);
    setIsSubmittingPayment(false);
    if (res.success) {
      setPaymentTarget(null);
      toast.success('Payment recorded.');
      ar.fetchDocuments({ customer_id: id });
    } else {
      toast.error(res.error);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem' }}>
        <div className="spinner mx-auto"></div>
        <p className="mt-sm text-muted">Loading customer...</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="glass-panel mt-xl" style={{ textAlign: 'center', padding: '3rem' }}>
        <p>Customer not found.</p>
        <button className="btn btn-secondary mt-lg" onClick={() => navigate('/customers')}>Back to Customers</button>
      </div>
    );
  }

  const totalSpent = sales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
  const arOutstanding = ar.documents.reduce((sum, d) => sum + (Number(d.total_amount) - Number(d.amount_paid)), 0);
  const hasCreditLimit = customer.credit_limit !== null && customer.credit_limit !== undefined;
  const overLimit = hasCreditLimit && arOutstanding > Number(customer.credit_limit);

  return (
    <div>
      <button className="btn btn-outline btn-sm mb-lg" onClick={() => navigate('/customers')}>← Back to Customers</button>

      <PageHeader
        title={customer.name}
        badge={customer.is_verified ? (
          <span className="badge badge-success" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>Verified ✓</span>
        ) : (
          <span className="badge badge-warning" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>Unverified</span>
        )}
        subtitle={
          <>
            {customer.phone} · {customer.customer_code} · Joined{' '}
            {new Date(customer.created_at).toLocaleDateString()}
          </>
        }
        actions={
          <>
            {/* Printing a statement is a read. Gating it behind canEdit meant
                a cashier could see every figure on this page and not be able
                to hand the customer a copy of them. */}
            <button className="btn btn-secondary" onClick={openStatement}>Statement</button>
            {canEdit && (
              <>
                {!customer.is_verified && (
                  <button className="btn btn-primary" onClick={() => { setVerifyStep(1); setVerifyCode(''); setIsVerifyOpen(true); }}>
                    Verify Customer
                  </button>
                )}
                <button className="btn btn-secondary" onClick={openEditModal}>Edit</button>
                <button className="btn btn-outline text-error" onClick={handleDelete}>Delete</button>
              </>
            )}
          </>
        }
      />

      <div className="stats-grid mt-xl mb-xl" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-lg)' }}>
        <div className="pos-glass-card" style={{ padding: 'var(--space-lg)' }}>
          <span className="stat-label" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Total Spent</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px' }}>{fmt(totalSpent)}</div>
        </div>
        <div className="pos-glass-card" style={{ padding: 'var(--space-lg)' }}>
          <span className="stat-label" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Deposit Balance</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px' }}>{fmt(loyalty.storeCreditBalance)}</div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button className="btn btn-sm btn-primary" onClick={() => setIsDepositOpen(true)}>Deposit</button>
            <button className="btn btn-sm btn-outline" onClick={() => setIsWithdrawOpen(true)}>Withdraw</button>
          </div>
        </div>
        <div className="pos-glass-card" style={{ padding: 'var(--space-lg)' }}>
          <span className="stat-label" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Loyalty Points</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px' }}>{loyalty.pointsBalance || 0}</div>
        </div>
        {hasPermission('manage_financials') && (
          <div className="pos-glass-card" style={{ padding: 'var(--space-lg)' }}>
            <span className="stat-label" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Outstanding Credit (AR)</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px', color: overLimit ? 'var(--color-error)' : undefined }}>
              {fmt(arOutstanding)}
            </div>
            {/* A limit of 0 is a real setting and has to render, so this tests
                for null rather than falsiness. */}
            {hasCreditLimit ? (
              <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                {overLimit ? 'over' : 'of'} {fmt(customer.credit_limit)} limit
              </div>
            ) : (
              <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '4px' }}>No credit limit set</div>
            )}
          </div>
        )}
      </div>

      <Tabs
        idPrefix="customer"
        variant="underline"
        items={visibleTabs.map(tab => ({ id: tab.key, label: tab.label }))}
        value={activeTab}
        onChange={setActiveTab}
        ariaLabel="Customer sections"
      />

      <TabPanel idPrefix="customer" id="purchases" value={activeTab}>
        <div className="glass-panel">
          {salesLoading ? (
            <div className="text-center p-xl"><div className="spinner mx-auto"></div></div>
          ) : sales.length === 0 ? (
            <div className="text-center p-xl text-secondary">No purchases yet.</div>
          ) : (
            <>
              <div className="desktop-table-view">
                <table className="glass-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Items</th>
                      <th>Payment</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map(sale => (
                      <tr key={sale.id}>
                        <td className="text-muted">{new Date(sale.created_at).toLocaleString()}</td>
                        <td>{(sale.sale_items || []).length} item(s)</td>
                        <td className="capitalize">{sale.payment_method}</td>
                        <td className="font-bold">{fmt(sale.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mobile-card-view">
                {sales.map(sale => (
                  <div key={sale.id} className="m-card">
                    <div className="m-card-top">
                      <div className="flex-1 min-w-0">
                        <div className="m-card-title">{new Date(sale.created_at).toLocaleDateString()}</div>
                        <div className="m-card-sub">{(sale.sale_items || []).length} item(s) · <span className="capitalize">{sale.payment_method}</span></div>
                      </div>
                      <span className="m-card-amount">{fmt(sale.total_amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </TabPanel>

      {hasPermission('manage_financials') && (
      <TabPanel idPrefix="customer" id="credit" value={activeTab}>
        <div className="glass-panel">
          {ar.loading ? (
            <div className="text-center p-xl"><div className="spinner mx-auto"></div></div>
          ) : ar.documents.length === 0 ? (
            <div className="text-center p-xl text-secondary">No credit history.</div>
          ) : (
            <>
              <div className="desktop-table-view">
                <table className="glass-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Amount</th>
                      <th>Outstanding</th>
                      <th>Due Date</th>
                      <th>Status</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ar.documents.map(doc => {
                      const outstanding = Number(doc.total_amount) - Number(doc.amount_paid);
                      return (
                        <tr key={doc.id}>
                          <td className="font-bold">{doc.invoice_number}</td>
                          <td>{fmt(doc.total_amount)}</td>
                          <td>{fmt(outstanding)}</td>
                          <td className="text-muted">{doc.due_date ? new Date(doc.due_date).toLocaleDateString() : '-'}</td>
                          <td><span className="badge badge-secondary">{doc.status}</span></td>
                          <td className="text-right">
                            {doc.status !== 'void' && doc.status !== 'paid' && (
                              <button className="btn btn-sm btn-outline" onClick={() => setPaymentTarget({ ...doc, outstanding })}>Record Payment</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mobile-card-view">
                {ar.documents.map(doc => {
                  const outstanding = Number(doc.total_amount) - Number(doc.amount_paid);
                  return (
                    <div key={doc.id} className="m-card">
                      <div className="m-card-top">
                        <div className="flex-1 min-w-0">
                          <div className="m-card-title">{doc.invoice_number}</div>
                          <div className="m-card-sub">Due {doc.due_date ? new Date(doc.due_date).toLocaleDateString() : '-'}</div>
                        </div>
                        <span className="badge badge-secondary" style={{ flexShrink: 0 }}>{doc.status}</span>
                      </div>
                      <div className="m-card-row">
                        <span>Amount: {fmt(doc.total_amount)}</span>
                        <span className="m-card-amount">Outstanding: {fmt(outstanding)}</span>
                      </div>
                      {doc.status !== 'void' && doc.status !== 'paid' && (
                        <div className="m-card-actions">
                          <button className="btn btn-sm btn-secondary" onClick={() => setPaymentTarget({ ...doc, outstanding })}>Record Payment</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </TabPanel>
      )}

      <TabPanel idPrefix="customer" id="store_credit" value={activeTab}>
        <div className="glass-panel">
          {storeCreditLedger.length === 0 ? (
            <div className="text-center p-xl text-secondary">No deposits or activity yet.</div>
          ) : (
            <>
              <div className="desktop-table-view">
                <table className="glass-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Balance After</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storeCreditLedger.map(entry => (
                      <tr key={entry.id}>
                        <td className="text-muted">{new Date(entry.created_at).toLocaleString()}</td>
                        <td className="capitalize">{entry.type}</td>
                        <td>{Number(entry.amount) >= 0 ? '+' : ''}{fmt(entry.amount)}</td>
                        <td>{fmt(entry.balance_after)}</td>
                        <td className="text-muted">{entry.note || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mobile-card-view">
                {storeCreditLedger.map(entry => (
                  <div key={entry.id} className="m-card">
                    <div className="m-card-top">
                      <div className="flex-1 min-w-0">
                        <div className="m-card-title capitalize">{entry.type}</div>
                        <div className="m-card-sub">{new Date(entry.created_at).toLocaleString()}</div>
                        {entry.note && <div className="m-card-meta">{entry.note}</div>}
                      </div>
                      <span className="m-card-amount">{Number(entry.amount) >= 0 ? '+' : ''}{fmt(entry.amount)}</span>
                    </div>
                    <div className="m-card-row">
                      <span>Balance After: {fmt(entry.balance_after)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </TabPanel>

      <TabPanel idPrefix="customer" id="loyalty" value={activeTab}>
        <div className="glass-panel">
          {(loyalty.pointsLedger.data || []).length === 0 ? (
            <div className="text-center p-xl text-secondary">No loyalty activity yet.</div>
          ) : (
            <>
              <div className="desktop-table-view">
                <table className="glass-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Points</th>
                      <th>Balance After</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loyalty.pointsLedger.data.map(entry => (
                      <tr key={entry.id}>
                        <td className="text-muted">{new Date(entry.created_at).toLocaleString()}</td>
                        <td className="capitalize">{entry.type}</td>
                        <td>{entry.points >= 0 ? '+' : ''}{entry.points}</td>
                        <td>{entry.balance_after}</td>
                        <td className="text-muted">{entry.note || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mobile-card-view">
                {loyalty.pointsLedger.data.map(entry => (
                  <div key={entry.id} className="m-card">
                    <div className="m-card-top">
                      <div className="flex-1 min-w-0">
                        <div className="m-card-title capitalize">{entry.type}</div>
                        <div className="m-card-sub">{new Date(entry.created_at).toLocaleString()}</div>
                        {entry.note && <div className="m-card-meta">{entry.note}</div>}
                      </div>
                      <span className="m-card-amount">{entry.points >= 0 ? '+' : ''}{entry.points} pts</span>
                    </div>
                    <div className="m-card-row">
                      <span>Balance After: {entry.balance_after} pts</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </TabPanel>

      <TabPanel idPrefix="customer" id="notes" value={activeTab}>
        <div className="glass-panel">
          {notesPending ? (
            <p className="text-muted" style={{ padding: 'var(--space-lg)' }}>
              Notes need migration 075, which has not been applied to this database yet.
            </p>
          ) : (
            <>
              <form onSubmit={handleAddNote} style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--color-border)' }}>
                <div className="form-group">
                  <label htmlFor="customer-note">Add a note</label>
                  <textarea
                    id="customer-note"
                    className="input"
                    rows={3}
                    maxLength={2000}
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="What was agreed, what to follow up, anything the next person at the counter should know."
                  />
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="btn btn-primary btn-sm" disabled={isSavingNote || !noteDraft.trim()}>
                    {isSavingNote ? 'Saving...' : 'Add Note'}
                  </button>
                </div>
              </form>

              {notesLoading ? (
                <p className="text-muted" style={{ padding: 'var(--space-lg)' }}>Loading notes...</p>
              ) : notes.length === 0 ? (
                <p className="text-muted" style={{ padding: 'var(--space-lg)' }}>No notes yet.</p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {notes.map(note => (
                    <li key={note.id} style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--color-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-md)' }}>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{note.body}</div>
                        {canEdit && (
                          <button
                            className="btn btn-sm btn-outline text-error"
                            onClick={() => handleDeleteNote(note.id)}
                            aria-label="Delete note"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '6px' }}>
                        {/* The author is null once that user is deleted; the note is still true. */}
                        {note.author?.name || 'Removed user'} · {new Date(note.created_at).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </TabPanel>

      <Modal
        isOpen={isStatementOpen}
        onClose={() => setIsStatementOpen(false)}
        title="Statement of Account"
        size="lg"
      >
        <div className="flex gap-md items-end mb-lg no-print" style={{ flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="stmt-from">From</label>
            <input id="stmt-from" type="date" className="input" value={statementRange.from}
              onChange={(e) => setStatementRange({ ...statementRange, from: e.target.value })} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="stmt-to">To</label>
            <input id="stmt-to" type="date" className="input" value={statementRange.to}
              onChange={(e) => setStatementRange({ ...statementRange, to: e.target.value })} />
          </div>
          <button className="btn btn-secondary" onClick={() => loadStatement()} disabled={statementLoading}>
            {statementLoading ? 'Building...' : 'Apply'}
          </button>
          <button className="btn btn-primary" onClick={() => printElement('customer-statement', 'a4')} disabled={!statement}>
            Print
          </button>
        </div>

        {statementLoading && <p className="text-muted">Building statement...</p>}

        {statement && (
          <div id="customer-statement">
            <h3 style={{ marginBottom: '2px' }}>{business?.name || 'Statement of Account'}</h3>
            <p className="text-muted" style={{ marginTop: 0 }}>
              Statement for {statement.customer.name}
              {statement.customer.customer_code ? ` (${statement.customer.customer_code})` : ''}
              {statement.customer.phone ? ` · ${statement.customer.phone}` : ''}
            </p>
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>
              Purchases and deposits from {new Date(statement.period.from).toLocaleDateString()} to{' '}
              {new Date(statement.period.to).toLocaleDateString()}. Balances are as at{' '}
              {new Date(statement.period.asAtDate).toLocaleString()}.
            </p>

            <table className="glass-table" style={{ marginTop: 'var(--space-lg)' }}>
              <tbody>
                <tr><td>Purchases in period ({statement.summary.purchaseCount})</td>
                    <td className="font-bold text-right">{fmt(statement.summary.purchaseTotal)}</td></tr>
                <tr><td>Deposits paid in</td>
                    <td className="text-right">{fmt(statement.summary.depositsIn)}</td></tr>
                <tr><td>Deposits withdrawn or spent</td>
                    <td className="text-right">{fmt(statement.summary.depositsOut)}</td></tr>
                <tr><td>Deposit balance held</td>
                    <td className="font-bold text-right">
                      {statement.summary.depositBalance === null ? 'No deposit account' : fmt(statement.summary.depositBalance)}
                    </td></tr>
                <tr><td>Outstanding on credit</td>
                    <td className="font-bold text-right">{fmt(statement.summary.arOutstanding)}</td></tr>
                {statement.summary.creditLimit !== null && (
                  <tr><td>Credit limit</td>
                      <td className="text-right">{fmt(statement.summary.creditLimit)}</td></tr>
                )}
              </tbody>
            </table>

            {statement.purchases.length > 0 && (
              <>
                <h4 style={{ marginTop: 'var(--space-xl)' }}>Purchases</h4>
                <table className="glass-table">
                  <thead><tr><th>Date</th><th>Receipt</th><th>Payment</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {statement.purchases.map(row => (
                      <tr key={row.id}>
                        <td>{new Date(row.created_at).toLocaleDateString()}</td>
                        <td>{row.receipt_number}</td>
                        <td className="capitalize">{row.payment_method}</td>
                        <td className="text-right">{fmt(row.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {statement.deposits.length > 0 && (
              <>
                <h4 style={{ marginTop: 'var(--space-xl)' }}>Deposit account</h4>
                <table className="glass-table">
                  <thead><tr><th>Date</th><th>Type</th><th>Note</th><th className="text-right">Amount</th><th className="text-right">Balance</th></tr></thead>
                  <tbody>
                    {statement.deposits.map(row => (
                      <tr key={row.id}>
                        <td>{new Date(row.created_at).toLocaleDateString()}</td>
                        <td className="capitalize">{row.type}</td>
                        <td>{row.note}</td>
                        <td className="text-right">{fmt(row.amount)}</td>
                        <td className="text-right">{fmt(row.balance_after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {statement.receivables.length > 0 && (
              <>
                <h4 style={{ marginTop: 'var(--space-xl)' }}>Credit (all open invoices, not only this period)</h4>
                <table className="glass-table">
                  <thead><tr><th>Invoice</th><th>Issued</th><th>Due</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Owing</th></tr></thead>
                  <tbody>
                    {statement.receivables.map(row => (
                      <tr key={row.id}>
                        <td>{row.invoice_number}</td>
                        <td>{row.issued_date ? new Date(row.issued_date).toLocaleDateString() : '—'}</td>
                        <td>{row.due_date ? new Date(row.due_date).toLocaleDateString() : '—'}</td>
                        <td className="text-right">{fmt(row.total_amount)}</td>
                        <td className="text-right">{fmt(row.amount_paid)}</td>
                        <td className="text-right font-bold">{fmt(Number(row.total_amount) - Number(row.amount_paid))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title="Edit Customer">
        <form onSubmit={handleEditSubmit}>
          <div className="form-group">
            <label>Full Name</label>
            <input type="text" className="input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Phone Number</label>
            <input type="tel" className="input" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              className="input"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              placeholder="Optional"
            />
          </div>
          <div className="form-group">
            <label>Credit Limit</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input"
              value={editForm.credit_limit}
              onChange={(e) => setEditForm({ ...editForm, credit_limit: e.target.value })}
              placeholder="Leave blank for no limit"
            />
            <small className="text-muted">
              The most this customer may owe on credit at any one time. Leave blank for no limit;
              enter 0 to stop credit sales to them entirely.
            </small>
          </div>
          <div className="modal-actions mt-xl flex justify-end gap-md">
            <button type="button" className="btn btn-outline" onClick={() => setIsEditOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isVerifyOpen}
        onClose={() => { setIsVerifyOpen(false); setVerifyStep(1); }}
        title="Verify Customer"
      >
        {verifyStep === 1 ? (
          <div>
            <p className="text-muted mb-lg">
              We will send a 4-digit code by SMS to {customer.phone}. Ask the customer to read it
              back to you, then enter it on the next step.
            </p>
            <div className="modal-actions mt-xl flex justify-end gap-md">
              <button type="button" className="btn btn-outline" onClick={() => setIsVerifyOpen(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleSendVerification} disabled={isSubmittingVerify}>
                {isSubmittingVerify ? 'Sending SMS...' : 'Send Code'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleConfirmVerification}>
            <div className="alert alert-info mb-lg">
              An SMS with a 4-digit code has been sent to {customer.phone}.
            </div>
            <div className="form-group">
              <label>Verification Code *</label>
              <input
                type="text"
                maxLength="4"
                className="input"
                style={{ fontSize: '1.5rem', letterSpacing: '0.5em', textAlign: 'center', fontFamily: 'monospace' }}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                required
                autoFocus
                placeholder="0000"
              />
            </div>
            <div className="modal-actions mt-xl flex justify-end gap-md">
              <button type="button" className="btn btn-outline" onClick={() => setVerifyStep(1)}>Back</button>
              <button type="submit" className="btn btn-primary" disabled={isSubmittingVerify || verifyCode.length !== 4}>
                {isSubmittingVerify ? 'Verifying...' : 'Confirm'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={isDepositOpen} onClose={() => setIsDepositOpen(false)} title="Deposit Funds">
        <form onSubmit={handleDeposit}>
          <p className="text-muted mt-0">
            Record cash received from {customer.name} as a deposit they can spend on future purchases.
          </p>
          <div className="form-group">
            <label>Amount *</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="input"
              value={depositForm.amount}
              onChange={(e) => setDepositForm({ ...depositForm, amount: e.target.value })}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Note</label>
            <input type="text" className="input" value={depositForm.note} onChange={(e) => setDepositForm({ ...depositForm, note: e.target.value })} placeholder="Optional" />
          </div>
          <div className="modal-actions mt-xl flex justify-end gap-md">
            <button type="button" className="btn btn-outline" onClick={() => setIsDepositOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmittingDeposit}>
              {isSubmittingDeposit ? 'Saving...' : 'Record Deposit'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isWithdrawOpen} onClose={() => { setIsWithdrawOpen(false); setWithdrawStep(1); }} title="Withdraw Funds">
        {withdrawStep === 1 ? (
          <form onSubmit={handleWithdrawRequest}>
            <p className="text-muted mt-0">
              Initiate a cash withdrawal from {customer.name}'s deposit balance. They will receive an SMS code to verify.
            </p>
            <div className="form-group">
              <label>Amount * (Max: {fmt(loyalty.storeCreditBalance)})</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                max={loyalty.storeCreditBalance}
                className="input"
                value={withdrawForm.amount}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Till Location (Cash Source) *</label>
              <select 
                className="input" 
                value={withdrawForm.location_id} 
                onChange={(e) => setWithdrawForm({ ...withdrawForm, location_id: e.target.value })} 
                required
                disabled={locations.length === 1}
              >
                {locations.length !== 1 && <option value="">Select a location...</option>}
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Note</label>
              <input type="text" className="input" value={withdrawForm.note} onChange={(e) => setWithdrawForm({ ...withdrawForm, note: e.target.value })} placeholder="Optional" />
            </div>
            <div className="modal-actions mt-xl flex justify-end gap-md">
              <button type="button" className="btn btn-outline" onClick={() => setIsWithdrawOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={isSubmittingWithdraw}>
                {isSubmittingWithdraw ? 'Sending SMS...' : 'Request Code'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleWithdrawConfirm}>
            <div className="alert alert-info mb-lg">
              An SMS with a 4-digit code has been sent to {customer.phone}.
            </div>
            <div className="form-group">
              <label>Verification Code *</label>
              <input
                type="text"
                maxLength="4"
                className="input"
                style={{ fontSize: '1.5rem', letterSpacing: '0.5em', textAlign: 'center', fontFamily: 'monospace' }}
                value={withdrawForm.code}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, code: e.target.value })}
                required
                autoFocus
                placeholder="0000"
              />
            </div>
            <div className="modal-actions mt-xl flex justify-end gap-md">
              <button type="button" className="btn btn-outline" onClick={() => setWithdrawStep(1)}>Back</button>
              <button type="submit" className="btn btn-primary" disabled={isSubmittingWithdraw || withdrawForm.code.length !== 4}>
                {isSubmittingWithdraw ? 'Processing...' : 'Confirm Withdrawal'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <RecordPaymentModal
        isOpen={!!paymentTarget}
        onClose={() => setPaymentTarget(null)}
        onSubmit={handleRecordPayment}
        document={paymentTarget}
        outstanding={paymentTarget?.outstanding}
        locations={locations}
        isSubmitting={isSubmittingPayment}
        error={null}
      />
    </div>
  );
}
