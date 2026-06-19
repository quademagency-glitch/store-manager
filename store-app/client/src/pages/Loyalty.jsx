import { useState, useEffect } from 'react';
import { useLoyalty } from '../hooks/useLoyalty';
import { useAuthContext } from '../lib/AuthContext';
import { useToast } from '../hooks/useToast';
import { api } from '../lib/api';
import '../styles/loyalty.css';

const TABS = ['rules', 'points', 'gift-cards', 'store-credit'];
const TAB_LABELS = { rules: 'Rules Config', points: 'Customer Points', 'gift-cards': 'Gift Cards', 'store-credit': 'Store Credit' };

export default function Loyalty() {
  const { hasPermission } = useAuthContext();
  const toast = useToast();
  const {
    loading, rules, pointsBalance, pointsLedger, giftCards, storeCreditBalance,
    fetchRules, saveRules, fetchBalance, fetchLedger, redeemPoints,
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
  const [gcForm, setGcForm] = useState({ amount: '', customer_id: '', expires_at: '' });
  const [gcLookupCode, setGcLookupCode] = useState('');
  const [gcLookupResult, setGcLookupResult] = useState(null);

  // Redeem form
  const [redeemForm, setRedeemForm] = useState({ points: '' });

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
      api.get(`/customers?search=${encodeURIComponent(customerSearch)}&limit=10`).then(res => {
        setCustomers(Array.isArray(res) ? res : res?.data || []);
      }).catch(() => {});
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

  const handleRedeem = async () => {
    if (!selectedCustomer) return toast.error('Select a customer first');
    try {
      const result = await redeemPoints(selectedCustomer.id, Number(redeemForm.points));
      toast.success(`Redeemed! Cash value: $${result.cash_value.toFixed(2)}`);
      setRedeemForm({ points: '' });
      fetchLedger(selectedCustomer.id);
    } catch (err) {
      toast.error(err.message || 'Failed to redeem');
    }
  };

  const handleIssueGiftCard = async () => {
    try {
      const card = await issueGiftCard(Number(gcForm.amount), gcForm.customer_id || undefined, gcForm.expires_at || undefined);
      toast.success(`Gift card issued! Code: ${card.code}`);
      setGcForm({ amount: '', customer_id: '', expires_at: '' });
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
      toast.success(`Store credit ${scForm.type}d!`);
      setScForm({ amount: '', type: 'issue', note: '' });
      fetchStoreCredit(selectedCustomer.id);
    } catch (err) {
      toast.error(err.message || 'Failed to process store credit');
    }
  };

  const fmt = (v) => `$${Number(v || 0).toFixed(2)}`;

  return (
    <div className="loyalty-page">
      <div className="page-header">
        <h1>Loyalty & Rewards</h1>
        <p className="page-subtitle">Points, gift cards, and store credit</p>
      </div>

      {/* Tabs */}
      <div className="loyalty-tabs">
        {TABS.map(tab => (
          <button
            key={tab}
            className={`loyalty-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* ─── Rules Config ─── */}
      {activeTab === 'rules' && (
        <div className="loyalty-section">
          <div className="loyalty-card">
            <h3>Loyalty Program Configuration</h3>
            <p className="text-muted" style={{ marginBottom: '24px' }}>Configure how customers earn and redeem loyalty points.</p>
            <div className="form-group">
              <label>Points per $1 spent</label>
              <input type="number" step="0.1" className="form-input" value={ruleForm.points_per_currency_unit}
                onChange={e => setRuleForm(p => ({ ...p, points_per_currency_unit: e.target.value }))} />
              <span className="form-hint">How many points customers earn per dollar spent</span>
            </div>
            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>Minimum Points to Redeem</label>
                <input type="number" className="form-input" value={ruleForm.min_points_to_redeem}
                  onChange={e => setRuleForm(p => ({ ...p, min_points_to_redeem: e.target.value }))} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Point Value ($)</label>
                <input type="number" step="0.001" className="form-input" value={ruleForm.point_value}
                  onChange={e => setRuleForm(p => ({ ...p, point_value: e.target.value }))} />
                <span className="form-hint">Each point = ${ruleForm.point_value}</span>
              </div>
            </div>
            <div className="form-group">
              <label className="hr-checkbox-label">
                <input type="checkbox" checked={ruleForm.active}
                  onChange={e => setRuleForm(p => ({ ...p, active: e.target.checked }))} />
                Enable loyalty program
              </label>
            </div>
            {hasPermission('manage_business') && (
              <button className="btn btn-primary" onClick={handleSaveRules} disabled={loading}>
                {loading ? 'Saving...' : 'Save Rules'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── Customer Points ─── */}
      {activeTab === 'points' && (
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

              {/* Redeem */}
              <div className="loyalty-card">
                <h4>Redeem Points</h4>
                <div className="form-row" style={{ alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Points to Redeem</label>
                    <input type="number" className="form-input" value={redeemForm.points}
                      onChange={e => setRedeemForm({ points: e.target.value })} />
                  </div>
                  <button className="btn btn-primary" onClick={handleRedeem} disabled={loading || !redeemForm.points}>
                    Redeem
                  </button>
                </div>
                {redeemForm.points && rules && (
                  <p className="form-hint">Cash value: ${(Number(redeemForm.points) * Number(rules.point_value || 0)).toFixed(2)}</p>
                )}
              </div>

              {/* Points History */}
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Type</th><th>Points</th><th>Balance</th><th>Note</th></tr></thead>
                  <tbody>
                    {(pointsLedger?.data || []).length === 0 ? (
                      <tr><td colSpan="5" className="empty-state">No points history.</td></tr>
                    ) : (
                      pointsLedger.data.map(e => (
                        <tr key={e.id}>
                          <td>{new Date(e.created_at).toLocaleDateString()}</td>
                          <td><span className={`badge ${e.type === 'earn' ? 'badge-success' : e.type === 'redeem' ? 'badge-warning' : 'badge-secondary'}`}>{e.type}</span></td>
                          <td className={e.points > 0 ? 'text-success' : 'text-error'}>{e.points > 0 ? '+' : ''}{e.points}</td>
                          <td>{e.balance_after}</td>
                          <td className="text-muted">{e.note || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Gift Cards ─── */}
      {activeTab === 'gift-cards' && (
        <div className="loyalty-section">
          {/* Issue Card */}
          {hasPermission('manage_business') && (
            <div className="loyalty-card">
              <h3>Issue Gift Card</h3>
              <div className="form-row" style={{ alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Amount</label>
                  <input type="number" step="0.01" className="form-input" placeholder="50.00"
                    value={gcForm.amount} onChange={e => setGcForm(p => ({ ...p, amount: e.target.value }))} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Expires (optional)</label>
                  <input type="date" className="form-input"
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
            <div className="form-row" style={{ alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <input type="text" className="form-input" placeholder="Enter gift card code..."
                  value={gcLookupCode} onChange={e => setGcLookupCode(e.target.value)} />
              </div>
              <button className="btn btn-secondary" onClick={handleLookup} disabled={loading || !gcLookupCode}>
                Look Up
              </button>
            </div>
            {gcLookupResult && (
              <div className="gc-lookup-result">
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
                  <tr><td colSpan="6" className="empty-state">No gift cards issued yet.</td></tr>
                ) : (
                  giftCards.data.map(gc => (
                    <tr key={gc.id}>
                      <td><code className="gc-code">{gc.code}</code></td>
                      <td className="font-semibold">{fmt(gc.current_balance)}</td>
                      <td>{fmt(gc.initial_balance)}</td>
                      <td>{gc.customer?.name || '—'}</td>
                      <td><span className={`badge ${gc.active ? 'badge-success' : 'badge-secondary'}`}>{gc.active ? 'Active' : 'Inactive'}</span></td>
                      <td>{new Date(gc.issued_at).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Store Credit ─── */}
      {activeTab === 'store-credit' && (
        <div className="loyalty-section">
          <div className="loyalty-customer-search">
            <input type="text" className="form-input" placeholder="Search customer..."
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
                <h4>Issue / Refund Store Credit</h4>
                <div className="form-row" style={{ alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Type</label>
                    <select className="form-input" value={scForm.type} onChange={e => setScForm(p => ({ ...p, type: e.target.value }))}>
                      <option value="issue">Issue Credit</option>
                      <option value="refund">Refund to Credit</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Amount</label>
                    <input type="number" step="0.01" className="form-input" value={scForm.amount}
                      onChange={e => setScForm(p => ({ ...p, amount: e.target.value }))} />
                  </div>
                  <button className="btn btn-primary" onClick={handleStoreCredit} disabled={loading || !scForm.amount}>
                    Process
                  </button>
                </div>
                <div className="form-group" style={{ marginTop: '12px' }}>
                  <input type="text" className="form-input" placeholder="Note (optional)" value={scForm.note}
                    onChange={e => setScForm(p => ({ ...p, note: e.target.value }))} />
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
