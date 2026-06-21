import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCustomers } from '../hooks/useCustomers';
import { useLoyalty } from '../hooks/useLoyalty';
import { useBillingLedger } from '../hooks/useBillingLedger';
import { useAuthContext } from '../lib/AuthContext';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import { api } from '../lib/api';
import Modal from '../components/Modal';
import RecordPaymentModal from '../features/financials/components/RecordPaymentModal';

const TABS = [
  { key: 'purchases', label: 'Purchase History' },
  { key: 'credit', label: 'Credit (AR)', permission: 'manage_financials' },
  { key: 'store_credit', label: 'Store Credit' },
  { key: 'loyalty', label: 'Loyalty Points' },
];

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role, hasPermission } = useAuthContext();
  const toast = useToast();
  const confirm = useConfirm();
  const canEdit = role === 'Business Admin' || role === 'Platform Admin';

  const { fetchCustomer, updateCustomer, deleteCustomer } = useCustomers();
  const loyalty = useLoyalty();
  const ar = useBillingLedger('ar');

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('purchases');

  const [sales, setSales] = useState([]);
  const [salesLoading, setSalesLoading] = useState(false);

  const [storeCreditLedger, setStoreCreditLedger] = useState([]);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '' });

  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [depositForm, setDepositForm] = useState({ amount: '', note: '' });
  const [isSubmittingDeposit, setIsSubmittingDeposit] = useState(false);

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

  useEffect(() => { loadCustomer(); }, [loadCustomer]);
  useEffect(() => { loadSales(); }, [loadSales]);
  useEffect(() => { loadStoreCredit(); }, [loadStoreCredit]);
  useEffect(() => { loyalty.fetchBalance(id); loyalty.fetchLedger(id); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'credit' && hasPermission('manage_financials')) {
      ar.fetchDocuments({ customer_id: id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, id]);

  useEffect(() => {
    api.get('/locations').then(res => { if (Array.isArray(res)) setLocations(res); }).catch(() => {});
  }, []);

  const openEditModal = () => {
    setEditForm({ name: customer.name, phone: customer.phone });
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    const res = await updateCustomer(id, editForm);
    if (res.success) {
      setCustomer(prev => ({ ...prev, ...editForm }));
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

  return (
    <div>
      <button className="btn btn-outline btn-sm mb-lg" onClick={() => navigate('/customers')}>← Back to Customers</button>

      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="dashboard-title">
            {customer.name}
            {customer.is_verified && (
              <span className="badge badge-success ml-sm" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>Verified ✓</span>
            )}
          </h1>
          <p className="dashboard-subtitle">{customer.phone} · {customer.customer_code} · Joined {new Date(customer.created_at).toLocaleDateString()}</p>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={openEditModal}>Edit</button>
            <button className="btn btn-outline text-error" onClick={handleDelete}>Delete</button>
          </div>
        )}
      </header>

      <div className="stats-grid mt-xl mb-xl" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-lg)' }}>
        <div className="pos-glass-card" style={{ padding: 'var(--space-lg)' }}>
          <span className="stat-label" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Total Spent</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px' }}>${totalSpent.toFixed(2)}</div>
        </div>
        <div className="pos-glass-card" style={{ padding: 'var(--space-lg)' }}>
          <span className="stat-label" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Store Credit Balance</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px' }}>${Number(loyalty.storeCreditBalance || 0).toFixed(2)}</div>
          <button className="btn btn-sm btn-primary mt-sm" onClick={() => setIsDepositOpen(true)}>Deposit Funds</button>
        </div>
        <div className="pos-glass-card" style={{ padding: 'var(--space-lg)' }}>
          <span className="stat-label" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Loyalty Points</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px' }}>{loyalty.pointsBalance || 0}</div>
        </div>
        {hasPermission('manage_financials') && (
          <div className="pos-glass-card" style={{ padding: 'var(--space-lg)' }}>
            <span className="stat-label" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Outstanding Credit (AR)</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px' }}>${arOutstanding.toFixed(2)}</div>
          </div>
        )}
      </div>

      <div className="tabs mb-lg" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', borderBottom: '1px solid var(--color-border)' }}>
        {visibleTabs.map(tab => (
          <button
            key={tab.key}
            className={`btn btn-sm ${activeTab === tab.key ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'purchases' && (
        <div className="glass-panel">
          {salesLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner mx-auto"></div></div>
          ) : sales.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>No purchases yet.</div>
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
                        <td style={{ textTransform: 'capitalize' }}>{sale.payment_method}</td>
                        <td style={{ fontWeight: 600 }}>${Number(sale.total_amount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mobile-card-view">
                {sales.map(sale => (
                  <div key={sale.id} className="m-card">
                    <div className="m-card-top">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="m-card-title">{new Date(sale.created_at).toLocaleDateString()}</div>
                        <div className="m-card-sub">{(sale.sale_items || []).length} item(s) · <span style={{ textTransform: 'capitalize' }}>{sale.payment_method}</span></div>
                      </div>
                      <span className="m-card-amount">${Number(sale.total_amount).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'credit' && hasPermission('manage_financials') && (
        <div className="glass-panel">
          {ar.loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner mx-auto"></div></div>
          ) : ar.documents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>No credit history.</div>
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
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ar.documents.map(doc => {
                      const outstanding = Number(doc.total_amount) - Number(doc.amount_paid);
                      return (
                        <tr key={doc.id}>
                          <td style={{ fontWeight: 600 }}>{doc.invoice_number}</td>
                          <td>${Number(doc.total_amount).toFixed(2)}</td>
                          <td>${outstanding.toFixed(2)}</td>
                          <td className="text-muted">{doc.due_date ? new Date(doc.due_date).toLocaleDateString() : '—'}</td>
                          <td><span className="badge badge-secondary">{doc.status}</span></td>
                          <td style={{ textAlign: 'right' }}>
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
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="m-card-title">{doc.invoice_number}</div>
                          <div className="m-card-sub">Due {doc.due_date ? new Date(doc.due_date).toLocaleDateString() : '—'}</div>
                        </div>
                        <span className="badge badge-secondary" style={{ flexShrink: 0 }}>{doc.status}</span>
                      </div>
                      <div className="m-card-row">
                        <span>Amount: ${Number(doc.total_amount).toFixed(2)}</span>
                        <span className="m-card-amount">Outstanding: ${outstanding.toFixed(2)}</span>
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
      )}

      {activeTab === 'store_credit' && (
        <div className="glass-panel">
          {storeCreditLedger.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>No store credit activity yet.</div>
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
                        <td style={{ textTransform: 'capitalize' }}>{entry.type}</td>
                        <td>{Number(entry.amount) >= 0 ? '+' : ''}${Number(entry.amount).toFixed(2)}</td>
                        <td>${Number(entry.balance_after).toFixed(2)}</td>
                        <td className="text-muted">{entry.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mobile-card-view">
                {storeCreditLedger.map(entry => (
                  <div key={entry.id} className="m-card">
                    <div className="m-card-top">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="m-card-title" style={{ textTransform: 'capitalize' }}>{entry.type}</div>
                        <div className="m-card-sub">{new Date(entry.created_at).toLocaleString()}</div>
                        {entry.note && <div className="m-card-meta">{entry.note}</div>}
                      </div>
                      <span className="m-card-amount">{Number(entry.amount) >= 0 ? '+' : ''}${Number(entry.amount).toFixed(2)}</span>
                    </div>
                    <div className="m-card-row">
                      <span>Balance After: ${Number(entry.balance_after).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'loyalty' && (
        <div className="glass-panel">
          {(loyalty.pointsLedger.data || []).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>No loyalty activity yet.</div>
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
                        <td style={{ textTransform: 'capitalize' }}>{entry.type}</td>
                        <td>{entry.points >= 0 ? '+' : ''}{entry.points}</td>
                        <td>{entry.balance_after}</td>
                        <td className="text-muted">{entry.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mobile-card-view">
                {loyalty.pointsLedger.data.map(entry => (
                  <div key={entry.id} className="m-card">
                    <div className="m-card-top">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="m-card-title" style={{ textTransform: 'capitalize' }}>{entry.type}</div>
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
      )}

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
          <div className="modal-actions mt-xl" style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setIsEditOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isDepositOpen} onClose={() => setIsDepositOpen(false)} title="Deposit Funds">
        <form onSubmit={handleDeposit}>
          <p className="text-muted" style={{ marginTop: 0 }}>
            Record cash received from {customer.name} as store credit they can spend on future purchases.
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
          <div className="modal-actions mt-xl" style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setIsDepositOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmittingDeposit}>
              {isSubmittingDeposit ? 'Saving...' : 'Record Deposit'}
            </button>
          </div>
        </form>
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
