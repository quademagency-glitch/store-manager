import { useState, useEffect } from 'react';
import { useLoyalty } from '../hooks/useLoyalty';
import { usePrintDocument } from '../hooks/usePrintDocument';
import { useCurrency } from '../hooks/useCurrency';
import { useAuthContext } from '../lib/AuthContext';
import { useToast } from '../hooks/useToast';
import { api } from '../lib/api';
import { reportError } from '../lib/errorReporting';
import { EmptyStateRow, TabPanel, Tabs } from '../components/ui';
import '../styles/loyalty.css';

const TABS = ['rules', 'points', 'gift-cards', 'store-credit'];
const TAB_LABELS = { rules: 'Rules Config', points: 'Customer Points', 'gift-cards': 'Gift Cards', 'store-credit': 'Store Credit' };

export default function Loyalty() {
  const { hasPermission } = useAuthContext();
  const toast = useToast();
  const { business } = usePrintDocument();
  const { fmt, currencySymbol } = useCurrency(business);
  const {
    loading, rules, pointsBalance, pointsLedger, giftCards, storeCreditBalance,
    fetchRules, saveRules, fetchBalance, fetchLedger,
    fetchGiftCards, issueGiftCard, lookupGiftCard, redeemGiftCard,
    fetchStoreCredit, issueStoreCredit,
  } = useLoyalty();

  const [activeTab, setActiveTab] = useState('rules');
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');

  // Rules form
  const [ruleForm, setRuleForm] = useState({
    points_per_currency_unit: 1, min_points_to_redeem: 100, point_value: 0.01, active: true,
  });

  // Gift card form
  const [gcForm, setGcForm] = useState({ amount: '', customer_id: '', expires_at: '', funding: 'cash', note: '' });
  const [gcLookupCode, setGcLookupCode] = useState('');
  const [gcLookupResult, setGcLookupResult] = useState(null);

  const [transferAmount, setTransferAmount] = useState('');

  // Store credit form
  const [scForm, setScForm] = useState({ amount: '', type: 'issue', note: '' });

  useEffect(() => {
    fetchRules();
    fetchGiftCards();
  }, [fetchRules, fetchGiftCards]);

  useEffect(() => {
    if (rules) {
      setRuleForm({
        points_per_currency_unit: rules.points_per_currency_unit,
        min_points_to_redeem: rules.min_points_to_redeem,
        point_value: rules.point_value,
        active: rules.active,
      });
    }
  }, [rules]);

  // Customer search
  useEffect(() => {
    if (customerSearch.length >= 2) {
      // Reported, but deliberately NOT toasted: this fires on every keystroke,
      // so a toast per failed request would bury the screen. apiError already
      // routes it to the error sink.
      api.get(`/customers?search=${encodeURIComponent(customerSearch)}&limit=10`).then(res => {
        setCustomers(Array.isArray(res) ? res : res?.data || []);
      }).catch(err => reportError(err, { context: 'loyalty:customer-search' }));
    }
  }, [customerSearch]);

  const selectCustomer = (c) => {
    setSelectedCustomer(c);
    setCustomerSearch('');
    fetchBalance(c.id);
    fetchLedger(c.id);
    fetchStoreCredit(c.id);
  };

  const handleSaveRules = async () => {
    try {
      await saveRules({
        points_per_currency_unit: Number(ruleForm.points_per_currency_unit),
        min_points_to_redeem: Number(ruleForm.min_points_to_redeem),
        point_value: Number(ruleForm.point_value),
        active: ruleForm.active,
      });
      toast.success('Loyalty rules saved!');
    } catch (err) {
      toast.error(err.message || 'Failed to save rules');
    }
  };

  const handleTransferGiftCard = async () => {
    if (!selectedCustomer) return toast.error('Select the customer on the Store Credit tab first.');
    try {
      const result = await redeemGiftCard(gcLookupCode, Number(transferAmount), selectedCustomer.id);
      setGcLookupResult(result.card); setTransferAmount(''); fetchGiftCards();
      toast.success('Gift card value transferred to customer credit. Apply it at checkout.');
    } catch (err) { toast.error(err.message); }
  };

  const handleIssueGiftCard = async () => {
    try {
      const { card } = await issueGiftCard(Number(gcForm.amount), gcForm.customer_id || undefined, gcForm.expires_at || undefined, gcForm.funding, gcForm.note);
      toast.success(`Gift card issued! Code: ${card.code}`);
      setGcForm({ amount: '', customer_id: '', expires_at: '', funding: 'cash', note: '' });
      fetchGiftCards();
    } catch (err) {
      toast.error(err.message || 'Failed to issue gift card');
    }
  };

  const handleLookup = async () => {
    try {
      const card = await lookupGiftCard(gcLookupCode);
      setGcLookupResult(card);
    } catch (err) {
      toast.error(err.message || 'Gift card not found');
      setGcLookupResult(null);
    }
  };

  const handleStoreCredit = async () => {
    if (!selectedCustomer) return toast.error('Select a customer first');
    try {
      await issueStoreCredit(selectedCustomer.id, Number(scForm.amount), scForm.type, undefined, scForm.note);
      toast.success('Credit adjustment recorded.');
      setScForm({ amount: '', type: 'issue', note: '' });
      fetchStoreCredit(selectedCustomer.id);
    } catch (err) {
      toast.error(err.message || 'Failed to process store credit');
    }
  };

  return (
    <div className="loyalty-page">
      <div className="page-header">
        <h1>Loyalty & Rewards</h1>
        <p className="page-subtitle">Points, gift cards, and store credit</p>
      </div>

      {/* Tabs */}
      <Tabs
        idPrefix="loyalty"
        items={TABS.map(tab => ({ id: tab, label: TAB_LABELS[tab] }))}
        value={activeTab}
        onChange={setActiveTab}
        ariaLabel="Loyalty sections"
      />

      {/* ─── Rules Config ─── */}
      <TabPanel idPrefix="loyalty" id="rules" value={activeTab}>
        <div className="loyalty-section">
          <div className="loyalty-card">
            <h3>Loyalty Program Configuration</h3>
            <p className="text-muted mb-lg">Configure how customers earn and redeem loyalty points.</p>
            <div className="form-group">
              <label htmlFor="loyalty-field-1">Points per {currencySymbol}1 spent</label>
              <input id="loyalty-field-1" type="number" step="0.1" className="form-input" value={ruleForm.points_per_currency_unit}
                onChange={e => setRuleForm(p => ({ ...p, points_per_currency_unit: e.target.value }))} />
              <span className="form-hint">How many points customers earn per dollar spent</span>
            </div>
            <div className="form-row">
              <div className="form-group flex-1">
                <label htmlFor="loyalty-field-2">Minimum Points to Redeem</label>
                <input id="loyalty-field-2" type="number" className="form-input" value={ruleForm.min_points_to_redeem}
                  onChange={e => setRuleForm(p => ({ ...p, min_points_to_redeem: e.target.value }))} />
              </div>
              <div className="form-group flex-1">
                <label htmlFor="loyalty-field-3">Point Value ({currencySymbol})</label>
                <input id="loyalty-field-3" type="number" step="0.001" className="form-input" value={ruleForm.point_value}
                  onChange={e => setRuleForm(p => ({ ...p, point_value: e.target.value }))} />
                <span className="form-hint">Each point = {fmt(ruleForm.point_value)}</span>
              </div>
            </div>
            <div className="form-group">
              <label className="hr-checkbox-label">
                <input type="checkbox" checked={ruleForm.active}
                  onChange={e => setRuleForm(p => ({ ...p, active: e.target.checked }))} />
                Enable loyalty program
              </label>
            </div>
            {hasPermission('manage_loyalty') && (
              <button className="btn btn-primary" onClick={handleSaveRules} disabled={loading}>
                {loading ? 'Saving...' : 'Save Rules'}
              </button>
            )}
          </div>
        </div>
      </TabPanel>

      {/* ─── Customer Points ─── */}
      <TabPanel idPrefix="loyalty" id="points" value={activeTab}>
        <div className="loyalty-section">
          <div className="loyalty-customer-search">
            <input type="text" className="form-input" placeholder="Search customer by name, email, or phone..."
              value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
            {customerSearch && customers.length > 0 && (
              <div className="customer-dropdown">
                {customers.map(c => (
                  <button key={c.id} className="customer-option" onClick={() => selectCustomer(c)}>
                    <span className="customer-name">{c.name}</span>
                    <span className="customer-detail">{c.email || c.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedCustomer && (
            <>
              <div className="loyalty-customer-header">
                <div className="loyalty-avatar">{selectedCustomer.name?.charAt(0)?.toUpperCase()}</div>
                <div>
                  <h3>{selectedCustomer.name}</h3>
                  <p className="text-muted">{selectedCustomer.email || selectedCustomer.phone}</p>
                </div>
                <div className="loyalty-points-badge">
                  <span className="points-value">{pointsBalance}</span>
                  <span className="points-label">points</span>
                </div>
              </div>

              <div className="loyalty-card">
                <h4>Use points at checkout</h4>
                <p>Select this customer in Sales and apply their points when completing payment. Points are deducted only when the purchase succeeds.</p>
              </div>

              {/* Points History */}
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Type</th><th>Points</th><th>Balance</th><th>Note</th></tr></thead>
                  <tbody>
                    {(pointsLedger?.data || []).length === 0 ? (
                      <EmptyStateRow colSpan={5} icon="clipboard" title="No points history" />
                    ) : (
                      pointsLedger.data.map(e => (
                        <tr key={e.id}>
                          <td>{new Date(e.created_at).toLocaleDateString()}</td>
                          <td><span className={`badge ${e.type === 'earn' ? 'badge-success' : e.type === 'redeem' ? 'badge-warning' : 'badge-secondary'}`}>{e.type}</span></td>
                          <td className={e.points > 0 ? 'text-success' : 'text-error'}>{e.points > 0 ? '+' : ''}{e.points}</td>
                          <td>{e.balance_after}</td>
                          <td className="text-muted">{e.note || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </TabPanel>

      {/* ─── Gift Cards ─── */}
      <TabPanel idPrefix="loyalty" id="gift-cards" value={activeTab}>
        <div className="loyalty-section">
          {/* Issue Card */}
          {hasPermission('manage_loyalty') && (
            <div className="loyalty-card">
              <h3>Issue Gift Card</h3>
              <label htmlFor="gift-funding">Funding</label>
              <select id="gift-funding" className="form-input" value={gcForm.funding} onChange={e => setGcForm(p => ({ ...p, funding: e.target.value }))}>
                <option value="cash">Cash received at the active till</option><option value="promotional">Promotional gift (no cash received)</option>
              </select>
              <label htmlFor="gift-note">Reason / note</label>
              <input id="gift-note" className="form-input" value={gcForm.note} onChange={e => setGcForm(p => ({ ...p, note: e.target.value }))} />
              <div className="form-row items-end">
                <div className="form-group flex-1">
                  <label htmlFor="loyalty-field-4">Amount</label>
                  <input id="loyalty-field-4" type="number" step="0.01" className="form-input" placeholder="50.00"
                    value={gcForm.amount} onChange={e => setGcForm(p => ({ ...p, amount: e.target.value }))} />
                </div>
                <div className="form-group flex-1">
                  <label htmlFor="loyalty-field-5">Expires (optional)</label>
                  <input id="loyalty-field-5" type="date" className="form-input"
                    value={gcForm.expires_at} onChange={e => setGcForm(p => ({ ...p, expires_at: e.target.value }))} />
                </div>
                <button className="btn btn-primary" onClick={handleIssueGiftCard} disabled={loading || !gcForm.amount}>
                  Issue Card
                </button>
              </div>
            </div>
          )}

          {/* Lookup Card */}
          <div className="loyalty-card">
            <h3>Look Up Gift Card</h3>
            <div className="form-row items-end">
              <div className="form-group flex-1">
                <input type="text" className="form-input" aria-label="Gift card code" placeholder="Enter gift card code..."
                  value={gcLookupCode} onChange={e => setGcLookupCode(e.target.value)} />
              </div>
              <button className="btn btn-secondary" onClick={handleLookup} disabled={loading || !gcLookupCode}>
                Look Up
              </button>
            </div>
            {gcLookupResult && (
              <div className="gc-lookup-result">
                <p>Transfer gift card value to {selectedCustomer?.name || 'a customer selected on the Store Credit tab'} for use at checkout.</p>
                <label htmlFor="gift-transfer-amount">Amount to transfer</label>
                <input id="gift-transfer-amount" type="number" min="0.01" step="0.01" max={gcLookupResult.current_balance} className="form-input" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} />
                <button className="btn btn-primary" disabled={loading || !selectedCustomer || !transferAmount} onClick={handleTransferGiftCard}>Transfer to customer credit</button>
                <div className="gc-result-row"><span>Code:</span><strong>{gcLookupResult.code}</strong></div>
                <div className="gc-result-row"><span>Balance:</span><strong>{fmt(gcLookupResult.current_balance)}</strong></div>
                <div className="gc-result-row"><span>Initial:</span><span>{fmt(gcLookupResult.initial_balance)}</span></div>
                <div className="gc-result-row"><span>Status:</span>
                  <span className={`badge ${gcLookupResult.active ? 'badge-success' : 'badge-secondary'}`}>
                    {gcLookupResult.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Gift Cards List */}
          <div className="data-table-wrapper">
            <h3 style={{ marginBottom: '12px' }}>All Gift Cards</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Balance</th>
                  <th>Initial</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Issued</th>
                </tr>
              </thead>
              <tbody>
                {(giftCards?.data || []).length === 0 ? (
                  <EmptyStateRow colSpan={6} icon="clipboard" title="No gift cards issued yet" />
                ) : (
                  giftCards.data.map(gc => (
                    <tr key={gc.id}>
                      <td><code className="gc-code">{gc.code}</code></td>
                      <td className="font-semibold">{fmt(gc.current_balance)}</td>
                      <td>{fmt(gc.initial_balance)}</td>
                      <td>{gc.customer?.name || '-'}</td>
                      <td><span className={`badge ${gc.active ? 'badge-success' : 'badge-secondary'}`}>{gc.active ? 'Active' : 'Inactive'}</span></td>
                      <td>{new Date(gc.issued_at).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </TabPanel>

      {/* ─── Store Credit ─── */}
      <TabPanel idPrefix="loyalty" id="store-credit" value={activeTab}>
        <div className="loyalty-section">
          <div className="loyalty-customer-search">
            <input type="text" className="form-input" aria-label="Search customer" placeholder="Search customer..."
              value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
            {customerSearch && customers.length > 0 && (
              <div className="customer-dropdown">
                {customers.map(c => (
                  <button key={c.id} className="customer-option" onClick={() => selectCustomer(c)}>
                    <span className="customer-name">{c.name}</span>
                    <span className="customer-detail">{c.email || c.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedCustomer && (
            <>
              <div className="loyalty-customer-header">
                <div className="loyalty-avatar">{selectedCustomer.name?.charAt(0)?.toUpperCase()}</div>
                <div>
                  <h3>{selectedCustomer.name}</h3>
                  <p className="text-muted">{selectedCustomer.email || selectedCustomer.phone}</p>
                </div>
                <div className="loyalty-points-badge store-credit-badge">
                  <span className="points-value">{fmt(storeCreditBalance)}</span>
                  <span className="points-label">store credit</span>
                </div>
              </div>

              <div className="loyalty-card">
                <h4>Credit adjustment</h4><p>Use Customer Details to record cash deposits. Use Returns to refund a sale.</p>
                <div className="form-row items-end">
                  <div className="form-group flex-1">
                    <label htmlFor="loyalty-field-6">Type</label>
                    <select id="loyalty-field-6" className="form-input" value={scForm.type} onChange={e => setScForm(p => ({ ...p, type: e.target.value }))}>
                      <option value="issue">Issue Credit</option>

                    </select>
                  </div>
                  <div className="form-group flex-1">
                    <label htmlFor="loyalty-field-7">Amount</label>
                    <input id="loyalty-field-7" type="number" step="0.01" className="form-input" value={scForm.amount}
                      onChange={e => setScForm(p => ({ ...p, amount: e.target.value }))} />
                  </div>
                  <button className="btn btn-primary" onClick={handleStoreCredit} disabled={loading || !scForm.amount}>
                    Process
                  </button>
                </div>
                <div className="form-group" style={{ marginTop: '12px' }}>
                  <input type="text" className="form-input" aria-label="Reason for credit adjustment" placeholder="Reason for adjustment (required)" value={scForm.note}
                    onChange={e => setScForm(p => ({ ...p, note: e.target.value }))} />
                </div>
              </div>
            </>
          )}
        </div>
      </TabPanel>
    </div>
  );
}
