import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { useAuthContext } from '../lib/AuthContext';
import Modal from '../components/Modal';

/* ============================================================
   SVG Icon helpers (keep inline for zero-dep approach)
   ============================================================ */
const Icons = {
  overview: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  business: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M3 21H21M5 21V7L13 3V21M19 21V11L13 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  users: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  roles: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 2l8 4v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V6l8-4z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  plus: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 4V16M4 10H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  edit: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  ban: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" stroke="currentColor" strokeWidth="2"/></svg>
  ),
  trash: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  search: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="search-icon">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M18 18L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  back: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  eye: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  pricing: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  billing: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 10h20" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M6 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  send: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

/* ============================================================
   PLATFORM ADMIN PAGE
   ============================================================ */
export default function PlatformAdmin() {
  const { user, role, signOut } = useAuthContext();

  // ── Core data ──
  const [businesses, setBusinesses] = useState([]);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Navigation ──
  const [activeTab, setActiveTab] = useState('overview');

  // ── Search states ──
  const [businessSearchTerm, setBusinessSearchTerm] = useState('');
  const [userSearchTerm, setUserSearchTerm] = useState('');

  // ── Business drill-down ──
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [businessDetails, setBusinessDetails] = useState({ products: [], sales: [], inventory: [] });
  const [detailsLoading, setDetailsLoading] = useState(false);

  // ── Modals: Business ──
  const [showAddBusinessModal, setShowAddBusinessModal] = useState(false);
  const [newBusinessName, setNewBusinessName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showEditBusinessModal, setShowEditBusinessModal] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState(null);

  // ── Modals: User ──
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserBusinessId, setNewUserBusinessId] = useState('');
  const [newUserRoleId, setNewUserRoleId] = useState('');
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  // ── Modals: Roles ──
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [newRolePermissions, setNewRolePermissions] = useState([]);
  const [showEditRoleModal, setShowEditRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);

  const [uptimeStats] = useState({
    uptime: 99.97,
    lastDowntime: '2 days ago',
    avgResponseTime: '142ms',
    requestsToday: 1247,
  });

  // ── Pricing & Plans ──
  const [plans, setPlans] = useState([]);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [planForm, setPlanForm] = useState({
    name: '', description: '', price_monthly: 0, price_yearly: 0, currency: 'GHS',
    max_users: -1, max_locations: 1, max_products: -1, trial_days: 7, sort_order: 0,
    features: { analytics: false, multi_location: false, priority_support: false, api_access: false },
  });

  // ── Billing & Gateways ──
  const [gateways, setGateways] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [billingStats, setBillingStats] = useState({ total_revenue: 0, monthly_revenue: 0, mrr: 0, outstanding: 0, failed_payments: 0, active_subscriptions: 0 });
  const [subscriptions, setSubscriptions] = useState([]);
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [editingGateway, setEditingGateway] = useState(null);
  const [gatewayForm, setGatewayForm] = useState({
    provider: 'paystack', display_name: 'Paystack', public_key: '', secret_key: '',
    webhook_secret: '', is_active: true, is_default: true, supported_currencies: ['GHS'],
  });
  const [showSendInvoiceModal, setShowSendInvoiceModal] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ business_id: '', amount: '', currency: 'GHS', payment_method: 'bank_transfer', description: '' });

  // ── Assign Plan Modal ──
  const [showAssignPlanModal, setShowAssignPlanModal] = useState(false);
  const [assignForm, setAssignForm] = useState({ business_id: '', plan_id: '', billing_cycle: 'monthly' });

  // ── Business subscription detail ──
  const [businessSubscription, setBusinessSubscription] = useState(null);

  // All available permissions in the system
  const ALL_PERMISSIONS = [
    'manage_platform', 'manage_business', 'manage_users', 'manage_products',
    'view_sales', 'create_sales', 'manage_sales', 'manage_inventory', 'view_analytics',
  ];

  /* ============================
     DATA FETCHING
     ============================ */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, uRes, rRes] = await Promise.all([
        supabase.from('businesses').select('*').order('created_at', { ascending: false }),
        supabase.from('users').select(`id, name, email, status, business_id, role_id, businesses ( name ), roles ( name )`).order('created_at', { ascending: false }),
        supabase.from('roles').select('id, name, description, permissions').order('name'),
      ]);
      if (bRes.error) throw bRes.error;
      if (uRes.error) throw uRes.error;
      if (rRes.error) throw rRes.error;

      setBusinesses(bRes.data || []);
      setUsers(uRes.data || []);
      setRoles(rRes.data || []);

      // Fetch pricing/billing data (non-blocking)
      try {
        const [plansRes, gwRes, invRes, statsRes, subsRes] = await Promise.all([
          api.get('/subscriptions/plans/all'),
          api.get('/billing/gateways'),
          api.get('/billing/invoices?limit=100'),
          api.get('/billing/stats'),
          api.get('/subscriptions'),
        ]);
        setPlans(plansRes || []);
        setGateways(gwRes || []);
        setInvoices(invRes || []);
        setBillingStats(statsRes || {});
        setSubscriptions(subsRes || []);
      } catch (billingErr) {
        console.warn('Billing data not available yet (run migration 015):', billingErr.message);
      }
    } catch (err) {
      console.error('Error fetching platform data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    const run = async () => {
      await Promise.resolve();
      if (active) {
        fetchData();
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [fetchData]);

  /* ============================
     BUSINESS DRILL-DOWN
     ============================ */
  const handleViewBusiness = async (business) => {
    setSelectedBusiness(business);
    setActiveTab('business-detail');
    setDetailsLoading(true);
    try {
      const [pRes, sRes, smRes] = await Promise.all([
        supabase.from('products').select('*').eq('business_id', business.id).order('name'),
        supabase.from('sales').select('*, sale_items(*, products(name))').eq('business_id', business.id).order('created_at', { ascending: false }).limit(50),
        supabase.from('stock_movements').select('*, products(name)').eq('business_id', business.id).order('created_at', { ascending: false }).limit(50),
      ]);
      setBusinessDetails({
        products: pRes.data || [],
        sales: sRes.data || [],
        inventory: smRes.data || [],
      });
      // Also fetch subscription info
      fetchBusinessSubscription(business.id);
    } catch (err) {
      console.error('Error fetching business details:', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleBackFromDetail = () => {
    setSelectedBusiness(null);
    setActiveTab('businesses');
  };

  /* ============================
     BUSINESS CRUD
     ============================ */
  const handleCreateBusiness = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const { data: businessData, error: businessError } = await supabase
        .from('businesses').insert([{ name: newBusinessName }]).select().single();
      if (businessError) throw businessError;

      if (adminEmail && adminPassword) {
        await api.post('/users/create', {
          email: adminEmail, password: adminPassword, name: 'Business Admin',
          business_id: businessData.id, role_name: 'Business Admin',
        });
        alert(`Business "${newBusinessName}" and admin account created successfully!`);
      } else {
        alert(`Business "${newBusinessName}" created successfully!`);
      }
      setShowAddBusinessModal(false);
      setNewBusinessName(''); setAdminEmail(''); setAdminPassword('');
      fetchData();
    } catch (err) {
      console.error('Error creating business:', err);
      setError(err.message);
    }
  };

  const openEditBusiness = (business) => { setEditingBusiness({ ...business }); setShowEditBusinessModal(true); };

  const handleUpdateBusiness = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('businesses').update({ name: editingBusiness.name }).eq('id', editingBusiness.id);
      if (error) throw error;
      setShowEditBusinessModal(false); setEditingBusiness(null); fetchData();
    } catch (err) { alert(`Error updating business: ${err.message}`); }
  };

  const handleToggleBusinessBan = async (business) => {
    const newStatus = business.status === 'banned' ? 'active' : 'banned';
    const action = newStatus === 'banned' ? 'ban' : 'unban';
    if (!window.confirm(`Are you sure you want to ${action} ${business.name}? Users in a banned business cannot access the system.`)) return;
    try {
      const { error } = await supabase.from('businesses').update({ status: newStatus }).eq('id', business.id);
      if (error) throw error;
      fetchData();
    } catch (err) { alert(`Error updating status: ${err.message}`); }
  };

  const handleDeleteBusiness = async (id, name) => {
    if (!window.confirm(`CRITICAL: Are you sure you want to permanently delete "${name}"? This will delete all associated products and sales! This action cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('businesses').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err) { 
      if (err.message && err.message.includes('users_business_id_fkey')) {
        alert(`Cannot delete business "${name}" because there are users associated with it. Please "Ban" the business instead, or delete its users first.`);
      } else {
        alert(`Error deleting business: ${err.message}`); 
      }
    }
  };

  /* ============================
     USER CRUD
     ============================ */
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const roleName = roles.find(r => r.id === newUserRoleId)?.name || 'Salesperson';
      await api.post('/users/create', {
        email: newUserEmail, password: newUserPassword, name: newUserName,
        business_id: newUserBusinessId || null, role_name: roleName,
      });
      alert(`User ${newUserEmail} created successfully!`);
      setShowAddUserModal(false);
      setNewUserEmail(''); setNewUserPassword(''); setNewUserName(''); setNewUserBusinessId(''); setNewUserRoleId('');
      fetchData();
    } catch (err) { console.error('Error creating user:', err); alert(`Failed to create user: ${err.message}`); }
  };

  const openEditUser = (u) => { setEditingUser({ ...u }); setShowEditUserModal(true); };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/users/${editingUser.id}`, {
        name: editingUser.name,
        role_id: editingUser.role_id,
        business_id: editingUser.business_id
      });
      setShowEditUserModal(false); setEditingUser(null); fetchData();
    } catch (err) { alert(`Error updating user: ${err.response?.data?.error || err.message}`); }
  };

  const handleToggleUserBan = async (u) => {
    const newStatus = u.status === 'banned' ? 'active' : 'banned';
    const action = newStatus === 'banned' ? 'ban' : 'unban';
    if (!window.confirm(`Are you sure you want to ${action} ${u.email}? A banned user cannot access any data.`)) return;
    try {
      await api.put(`/users/${u.id}`, {
        name: u.name,
        role_id: u.role_id,
        status: newStatus
      });
      fetchData();
    } catch (err) { alert(`Error updating status: ${err.response?.data?.error || err.message}`); }
  };

  const handleDeleteUser = async (id, email) => {
    if (!window.confirm(`CRITICAL: Are you sure you want to permanently delete user "${email}"? They will lose all access.`)) return;
    try { 
      await api.delete(`/users/${id}`); 
      fetchData(); 
    } catch (err) { 
      alert(`Error deleting user: ${err.response?.data?.error || err.message}`); 
    }
  };

  /* ============================
     ROLE CRUD
     ============================ */
  const handleCreateRole = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const { error } = await supabase.from('roles').insert([{
        name: newRoleName, description: newRoleDescription, permissions: newRolePermissions,
      }]);
      if (error) throw error;
      alert(`Role "${newRoleName}" created successfully!`);
      setShowAddRoleModal(false);
      setNewRoleName(''); setNewRoleDescription(''); setNewRolePermissions([]);
      fetchData();
    } catch (err) { alert(`Error creating role: ${err.message}`); }
  };

  const openEditRole = (r) => {
    setEditingRole({ ...r, permissions: [...(r.permissions || [])] });
    setShowEditRoleModal(true);
  };

  const handleUpdateRole = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('roles').update({
        name: editingRole.name, description: editingRole.description, permissions: editingRole.permissions,
      }).eq('id', editingRole.id);
      if (error) throw error;
      setShowEditRoleModal(false); setEditingRole(null); fetchData();
    } catch (err) { alert(`Error updating role: ${err.message}`); }
  };

  const handleDeleteRole = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete role "${name}"? Users with this role may lose access.`)) return;
    try {
      const { error } = await supabase.from('roles').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err) { alert(`Error deleting role: ${err.message}`); }
  };

  const togglePermission = (perm, list, setter) => {
    setter(list.includes(perm) ? list.filter(p => p !== perm) : [...list, perm]);
  };

  /* ============================
     PLAN CRUD
     ============================ */
  const FEATURE_LABELS = { analytics: 'Analytics Dashboard', multi_location: 'Multi-Location', priority_support: 'Priority Support', api_access: 'API Access' };

  const openPlanModal = (plan = null) => {
    if (plan) {
      setEditingPlan(plan);
      setPlanForm({
        name: plan.name, description: plan.description || '', price_monthly: plan.price_monthly, price_yearly: plan.price_yearly,
        currency: plan.currency || 'GHS', max_users: plan.max_users, max_locations: plan.max_locations, max_products: plan.max_products,
        trial_days: plan.trial_days ?? 7, sort_order: plan.sort_order ?? 0, features: plan.features || {},
      });
    } else {
      setEditingPlan(null);
      setPlanForm({ name: '', description: '', price_monthly: 0, price_yearly: 0, currency: 'GHS', max_users: -1, max_locations: 1, max_products: -1, trial_days: 7, sort_order: 0, features: { analytics: false, multi_location: false, priority_support: false, api_access: false } });
    }
    setShowPlanModal(true);
  };

  const handleSavePlan = async (e) => {
    e.preventDefault();
    try {
      if (editingPlan) {
        await api.put(`/subscriptions/plans/${editingPlan.id}`, planForm);
      } else {
        await api.post('/subscriptions/plans', planForm);
      }
      setShowPlanModal(false); setEditingPlan(null); fetchData();
    } catch (err) { alert(`Error saving plan: ${err.message}`); }
  };

  const handleDeletePlan = async (id, name) => {
    if (!window.confirm(`Deactivate plan "${name}"? Existing subscribers will keep their current plan.`)) return;
    try { await api.delete(`/subscriptions/plans/${id}`); fetchData(); }
    catch (err) { alert(`Error: ${err.message}`); }
  };

  /* ============================
     GATEWAY CRUD
     ============================ */
  const openGatewayModal = (gw = null) => {
    if (gw) {
      setEditingGateway(gw);
      setGatewayForm({ provider: gw.provider, display_name: gw.display_name, public_key: gw.public_key || '', secret_key: gw.secret_key || '', webhook_secret: gw.webhook_secret || '', is_active: gw.is_active, is_default: gw.is_default, supported_currencies: gw.supported_currencies || ['GHS'] });
    } else {
      setEditingGateway(null);
      setGatewayForm({ provider: 'paystack', display_name: 'Paystack', public_key: '', secret_key: '', webhook_secret: '', is_active: true, is_default: true, supported_currencies: ['GHS'] });
    }
    setShowGatewayModal(true);
  };

  const handleSaveGateway = async (e) => {
    e.preventDefault();
    try {
      if (editingGateway) {
        await api.put(`/billing/gateways/${editingGateway.id}`, gatewayForm);
      } else {
        await api.post('/billing/gateways', gatewayForm);
      }
      setShowGatewayModal(false); setEditingGateway(null); fetchData();
    } catch (err) { alert(`Error saving gateway: ${err.message}`); }
  };

  const handleDeleteGateway = async (id) => {
    if (!window.confirm('Remove this payment gateway configuration?')) return;
    try { await api.delete(`/billing/gateways/${id}`); fetchData(); }
    catch (err) { alert(`Error: ${err.message}`); }
  };

  /* ============================
     ASSIGN PLAN TO BUSINESS
     ============================ */
  const handleAssignPlan = async (e) => {
    e.preventDefault();
    try {
      await api.post('/subscriptions/assign', assignForm);
      alert('Plan assigned successfully!');
      setShowAssignPlanModal(false);
      setAssignForm({ business_id: '', plan_id: '', billing_cycle: 'monthly' });
      fetchData();
      // Refresh business detail if viewing one
      if (selectedBusiness && selectedBusiness.id === assignForm.business_id) {
        fetchBusinessSubscription(selectedBusiness.id);
      }
    } catch (err) { alert(`Error assigning plan: ${err.message}`); }
  };

  /* ============================
     SEND INVOICE EMAIL
     ============================ */
  const handleSendInvoice = async () => {
    if (!selectedInvoiceId) return;
    try {
      const result = await api.post('/billing/invoices/send', { invoice_id: selectedInvoiceId });
      alert(result.simulated ? 'Invoice email simulated (configure Resend API key for real emails)' : `Invoice sent to: ${result.recipients?.join(', ')}`);
      setShowSendInvoiceModal(false); setSelectedInvoiceId(null); fetchData();
    } catch (err) { alert(`Error sending invoice: ${err.message}`); }
  };

  /* ============================
     RECORD MANUAL PAYMENT
     ============================ */
  const handleRecordPayment = async (e) => {
    e.preventDefault();
    try {
      await api.post('/billing/record-payment', { ...paymentForm, amount: Number(paymentForm.amount) });
      alert('Payment recorded successfully!');
      setShowRecordPaymentModal(false);
      setPaymentForm({ business_id: '', amount: '', currency: 'GHS', payment_method: 'bank_transfer', description: '' });
      fetchData();
    } catch (err) { alert(`Error recording payment: ${err.message}`); }
  };

  /* ============================
     BUSINESS SUBSCRIPTION DETAIL
     ============================ */
  const fetchBusinessSubscription = async (businessId) => {
    try {
      const [sub] = await Promise.all([
        api.get(`/subscriptions/business/${businessId}`),
        api.get(`/billing/invoices/${businessId}`),
      ]);
      setBusinessSubscription(sub);
    } catch (err) {
      console.warn('Could not fetch subscription:', err.message);
      setBusinessSubscription(null);
    }
  };

  const formatCurrency = (amount, currency = 'GHS') => {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency }).format(amount || 0);
  };


  /* ============================
     COMPUTED / MEMOS
     ============================ */
  const filteredBusinesses = useMemo(() => {
    if (!businessSearchTerm) return businesses;
    const lower = businessSearchTerm.toLowerCase();
    return businesses.filter(b => b.name.toLowerCase().includes(lower) || b.id.toLowerCase().includes(lower));
  }, [businesses, businessSearchTerm]);

  const filteredUsers = useMemo(() => {
    if (!userSearchTerm) return users;
    const lower = userSearchTerm.toLowerCase();
    return users.filter(u =>
      (u.name && u.name.toLowerCase().includes(lower)) ||
      (u.email && u.email.toLowerCase().includes(lower)) ||
      (u.roles?.name && u.roles.name.toLowerCase().includes(lower)) ||
      (u.businesses?.name && u.businesses.name.toLowerCase().includes(lower))
    );
  }, [users, userSearchTerm]);

  const activeBusinesses = useMemo(() => businesses.filter(b => b.status !== 'banned' && b.name !== 'Pending Assignment'), [businesses]);
  const activeUsers = useMemo(() => users.filter(u => u.status !== 'banned'), [users]);
  const businessAdmins = useMemo(() => users.filter(u => u.roles?.name === 'Business Admin'), [users]);
  const recentBusinesses = useMemo(() => {
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return businesses.filter(b => b.name !== 'Pending Assignment' && new Date(b.created_at) >= sevenDaysAgo);
  }, [businesses]);

  const handleSignOut = async () => { await signOut(); };

  /* ============================
     SIDEBAR NAV ITEMS
     ============================ */
  const navItems = [
    { id: 'overview', label: 'Overview', icon: Icons.overview },
    { id: 'businesses', label: 'Businesses', icon: Icons.business },
    { id: 'users', label: 'Users', icon: Icons.users },
    { id: 'roles', label: 'Roles', icon: Icons.roles },
    { id: 'pricing', label: 'Pricing', icon: Icons.pricing },
    { id: 'billing', label: 'Billing', icon: Icons.billing },
  ];

  /* ============================
     LOADING STATE
     ============================ */
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner">
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>
      </div>
    );
  }

  /* ============================
     RENDER
     ============================ */
  return (
    <div className="dashboard-page">
      {/* ── Sidebar ── */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="40" height="40" rx="12" fill="url(#pa-logo-grad)" />
              <path d="M12 20L18 14L24 20L18 26L12 20Z" fill="white" fillOpacity="0.9" />
              <path d="M18 14L24 20L30 14L24 8L18 14Z" fill="white" fillOpacity="0.6" />
              <path d="M18 26L24 20L30 26L24 32L18 26Z" fill="white" fillOpacity="0.6" />
              <defs>
                <linearGradient id="pa-logo-grad" x1="0" y1="0" x2="40" y2="40">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span className="sidebar-brand">Platform Admin</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`sidebar-link${(activeTab === item.id || (activeTab === 'business-detail' && item.id === 'businesses')) ? ' active' : ''}`}
              onClick={() => {
                if (item.id === 'businesses' && activeTab === 'business-detail') {
                  handleBackFromDetail();
                } else {
                  setActiveTab(item.id);
                  setSelectedBusiness(null);
                }
              }}
              id={`nav-${item.id}`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-info">
            <div className="sidebar-avatar" style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)' }}>
              {user?.email?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="sidebar-user-details">
              <span className="sidebar-user-name">{user?.email?.split('@')[0] || 'Admin'}</span>
              <span className="sidebar-user-role">{role || 'Platform Admin'}</span>
            </div>
          </div>
          <button className="sidebar-signout" onClick={handleSignOut} id="signout-btn">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M6.75 15.75H3.75C3.15 15.75 2.25 15.15 2.25 14.25V3.75C2.25 2.85 3.15 2.25 3.75 2.25H6.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 12.75L15.75 9L12 5.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15.75 9H6.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="dashboard-main">
        {error && (
          <div className="alert alert-error mb-xl">
            <p>{error}</p>
          </div>
        )}

        {/* ═══════════════════════════════════
            TAB: OVERVIEW
            ═══════════════════════════════════ */}
        {activeTab === 'overview' && (
          <>
            <header className="dashboard-header">
              <div>
                <h1 className="dashboard-title">Platform Overview</h1>
                <p className="dashboard-subtitle">
                  Welcome back, <strong>{user?.email?.split('@')[0] || 'Admin'}</strong> — here's how the platform is performing.
                </p>
              </div>
              <div className="dashboard-role-badge">
                <span className="role-badge" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(249,115,22,0.05))', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                  Platform Admin
                </span>
              </div>
            </header>

            <div className="dashboard-content">
              {/* ── Stats Cards ── */}
              <div className="stats-grid pa-stats-grid">
                <div className="stat-card pa-stat-card">
                  <div className="stat-icon stat-icon-products">
                    {Icons.business}
                  </div>
                  <div className="stat-details">
                    <span className="stat-label">Active Businesses</span>
                    <span className="stat-value">{activeBusinesses.length}</span>
                    <span className="stat-hint">Registered tenants</span>
                  </div>
                </div>

                <div className="stat-card pa-stat-card">
                  <div className="stat-icon stat-icon-sales">
                    {Icons.users}
                  </div>
                  <div className="stat-details">
                    <span className="stat-label">Total Users</span>
                    <span className="stat-value">{activeUsers.length}</span>
                    <span className="stat-hint">Across all businesses</span>
                  </div>
                </div>

                <div className="stat-card pa-stat-card">
                  <div className="stat-icon" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.05))', color: '#fbbf24' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="8.5" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                      <path d="M20 8v6M23 11h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div className="stat-details">
                    <span className="stat-label">Business Admins</span>
                    <span className="stat-value">{businessAdmins.length}</span>
                    <span className="stat-hint">Registered administrators</span>
                  </div>
                </div>

                <div className="stat-card pa-stat-card">
                  <div className="stat-icon" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(139,92,246,0.05))', color: '#a78bfa' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div className="stat-details">
                    <span className="stat-label">New This Week</span>
                    <span className="stat-value">{recentBusinesses.length}</span>
                    <span className="stat-hint">Recently onboarded</span>
                  </div>
                </div>
              </div>

              {/* ── System Health Panel ── */}
              <div className="pa-health-section">
                <h2 className="pa-section-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  System Health & Usage
                </h2>
                <div className="pa-health-grid">
                  <div className="pa-health-card">
                    <div className="pa-health-indicator pa-health-good"></div>
                    <div className="pa-health-info">
                      <span className="pa-health-label">Uptime</span>
                      <span className="pa-health-value">{uptimeStats.uptime}%</span>
                    </div>
                    <span className="pa-health-badge pa-health-badge-good">Operational</span>
                  </div>
                  <div className="pa-health-card">
                    <div className="pa-health-indicator pa-health-neutral"></div>
                    <div className="pa-health-info">
                      <span className="pa-health-label">Last Downtime</span>
                      <span className="pa-health-value">{uptimeStats.lastDowntime}</span>
                    </div>
                  </div>
                  <div className="pa-health-card">
                    <div className="pa-health-indicator pa-health-good"></div>
                    <div className="pa-health-info">
                      <span className="pa-health-label">Avg Response</span>
                      <span className="pa-health-value">{uptimeStats.avgResponseTime}</span>
                    </div>
                  </div>
                  <div className="pa-health-card">
                    <div className="pa-health-indicator pa-health-good"></div>
                    <div className="pa-health-info">
                      <span className="pa-health-label">Requests Today</span>
                      <span className="pa-health-value">{uptimeStats.requestsToday.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Recent Activity ── */}
              <div className="pa-activity-section">
                <h2 className="pa-section-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                    <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Recent Businesses
                </h2>
                <div className="content-card">
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Business</th>
                          <th>Status</th>
                          <th>Created</th>
                          <th className="text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {businesses.filter(b => b.name !== 'Pending Assignment').slice(0, 5).map(b => (
                          <tr key={b.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div className="product-avatar" style={{ background: b.status === 'banned' ? '#666' : 'linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-secondary))' }}>
                                  {b.name.charAt(0).toUpperCase()}
                                </div>
                                <span style={{ fontWeight: 500 }}>{b.name}</span>
                              </div>
                            </td>
                            <td>
                              {b.status === 'banned' ? (
                                <span className="badge badge-warning">Banned</span>
                              ) : (
                                <span className="badge badge-neutral" style={{ color: '#4ade80', borderColor: '#4ade80' }}>Active</span>
                              )}
                            </td>
                            <td style={{ color: 'var(--color-text-secondary)' }}>{new Date(b.created_at).toLocaleDateString()}</td>
                            <td className="text-right">
                              <button className="btn btn-secondary btn-sm" onClick={() => handleViewBusiness(b)}>
                                {Icons.eye} View
                              </button>
                            </td>
                          </tr>
                        ))}
                        {businesses.filter(b => b.name !== 'Pending Assignment').length === 0 && (
                          <tr><td colSpan="4" className="text-center py-xl text-muted">No businesses registered yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════
            TAB: BUSINESSES
            ═══════════════════════════════════ */}
        {activeTab === 'businesses' && (
          <>
            <header className="dashboard-header">
              <div>
                <h1 className="dashboard-title">Businesses</h1>
                <p className="dashboard-subtitle">Manage all registered tenants on the platform.</p>
              </div>
              <button className="btn btn-primary" onClick={() => setShowAddBusinessModal(true)}>
                {Icons.plus} New Business
              </button>
            </header>

            <div className="content-card">
              <div className="toolbar">
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Tenants ({filteredBusinesses.filter(b => b.name !== 'Pending Assignment').length})</h2>
                <div className="search-bar">
                  {Icons.search}
                  <input type="text" placeholder="Search businesses..." value={businessSearchTerm} onChange={(e) => setBusinessSearchTerm(e.target.value)} className="search-input" />
                </div>
              </div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Business Name</th>
                      <th>Users</th>
                      <th>Status</th>
                      <th>Created Date</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBusinesses.filter(b => b.name !== 'Pending Assignment').map(b => {
                      const userCount = users.filter(u => u.business_id === b.id).length;
                      return (
                        <tr key={b.id} className={b.status === 'banned' ? 'row-warning' : ''}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', opacity: b.status === 'banned' ? 0.6 : 1 }}>
                              <div className="product-avatar" style={{ background: b.status === 'banned' ? '#666' : 'linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-secondary))' }}>
                                {b.name.charAt(0).toUpperCase()}
                              </div>
                              <span style={{ fontWeight: 500 }}>{b.name}</span>
                            </div>
                          </td>
                          <td><span className="badge badge-neutral">{userCount}</span></td>
                          <td>
                            {b.status === 'banned' ? (
                              <span className="badge badge-warning">Banned</span>
                            ) : (
                              <span className="badge badge-neutral" style={{ color: '#4ade80', borderColor: '#4ade80' }}>Active</span>
                            )}
                          </td>
                          <td style={{ color: 'var(--color-text-secondary)' }}>{new Date(b.created_at).toLocaleDateString()}</td>
                          <td className="text-right">
                            <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                              <button className="btn-icon" onClick={() => handleViewBusiness(b)} title="View Details">
                                {Icons.eye}
                              </button>
                              <button className="btn-icon" onClick={() => openEditBusiness(b)} title="Edit">
                                {Icons.edit}
                              </button>
                              <button className="btn-icon text-warning hover-bg-warning" onClick={() => handleToggleBusinessBan(b)} title={b.status === 'banned' ? 'Unban' : 'Ban'}>
                                {Icons.ban}
                              </button>
                              <button className="btn-icon text-error hover-bg-error" onClick={() => handleDeleteBusiness(b.id, b.name)} title="Delete">
                                {Icons.trash}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredBusinesses.filter(b => b.name !== 'Pending Assignment').length === 0 && (
                      <tr><td colSpan="5" className="text-center py-xl text-muted">No businesses found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════
            TAB: BUSINESS DETAIL (DRILL-DOWN)
            ═══════════════════════════════════ */}
        {activeTab === 'business-detail' && selectedBusiness && (
          <>
            <header className="dashboard-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button className="btn btn-secondary" onClick={handleBackFromDetail}>
                  {Icons.back} Back
                </button>
                <div>
                  <h1 className="dashboard-title">{selectedBusiness.name}</h1>
                  <p className="dashboard-subtitle">
                    Business details — Products, Sales & Inventory
                  </p>
                </div>
              </div>
              <div>
                {selectedBusiness.status === 'banned' ? (
                  <span className="badge badge-warning">Banned</span>
                ) : (
                  <span className="badge badge-neutral" style={{ color: '#4ade80', borderColor: '#4ade80' }}>Active</span>
                )}
              </div>
            </header>

            {detailsLoading ? (
              <div className="table-loading">
                <div className="spinner"></div>
                <span>Loading business data…</span>
              </div>
            ) : (
              <div className="pa-detail-sections">
                {/* Subscription Info */}
                {businessSubscription && (
                  <div className="pa-sub-card">
                    <div className="pa-sub-header">
                      <span className="pa-sub-plan-name">{businessSubscription.platform_plans?.name || 'No Plan'} Plan</span>
                      <span className={`pa-sub-status ${businessSubscription.status}`}>{businessSubscription.status}</span>
                    </div>
                    <div className="pa-sub-details">
                      <div className="pa-sub-detail">
                        <span className="pa-sub-detail-label">Billing Cycle</span>
                        <span className="pa-sub-detail-value" style={{ textTransform: 'capitalize' }}>{businessSubscription.billing_cycle}</span>
                      </div>
                      <div className="pa-sub-detail">
                        <span className="pa-sub-detail-label">Amount</span>
                        <span className="pa-sub-detail-value">{formatCurrency(businessSubscription.amount, businessSubscription.currency)}</span>
                      </div>
                      <div className="pa-sub-detail">
                        <span className="pa-sub-detail-label">Period Start</span>
                        <span className="pa-sub-detail-value">{businessSubscription.current_period_start ? new Date(businessSubscription.current_period_start).toLocaleDateString() : '—'}</span>
                      </div>
                      <div className="pa-sub-detail">
                        <span className="pa-sub-detail-label">Period End</span>
                        <span className="pa-sub-detail-value">{businessSubscription.current_period_end ? new Date(businessSubscription.current_period_end).toLocaleDateString() : '—'}</span>
                      </div>
                      {businessSubscription.trial_ends_at && (
                        <div className="pa-sub-detail">
                          <span className="pa-sub-detail-label">Trial Ends</span>
                          <span className="pa-sub-detail-value">{new Date(businessSubscription.trial_ends_at).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                    <div className="pa-sub-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => { setAssignForm({ business_id: selectedBusiness.id, plan_id: businessSubscription.plan_id || '', billing_cycle: businessSubscription.billing_cycle || 'monthly' }); setShowAssignPlanModal(true); }}>
                        {Icons.edit} Change Plan
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setPaymentForm({ business_id: selectedBusiness.id, amount: '', currency: businessSubscription.currency || 'GHS', payment_method: 'bank_transfer', description: '' }); setShowRecordPaymentModal(true); }}>
                        {Icons.plus} Record Payment
                      </button>
                    </div>
                  </div>
                )}
                {!businessSubscription && (
                  <div className="pa-sub-card" style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
                    <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>No subscription assigned to this business.</p>
                    <button className="btn btn-primary btn-sm" onClick={() => { setAssignForm({ business_id: selectedBusiness.id, plan_id: '', billing_cycle: 'monthly' }); setShowAssignPlanModal(true); }}>
                      {Icons.pricing} Assign a Plan
                    </button>
                  </div>
                )}

                {/* Quick Stats */}
                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  <div className="stat-card">
                    <div className="stat-icon stat-icon-products">{Icons.business}</div>
                    <div className="stat-details">
                      <span className="stat-label">Products</span>
                      <span className="stat-value">{businessDetails.products.length}</span>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon stat-icon-sales">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        <path d="M17 7H9.5C7.57 7 6 8.57 6 10.5C6 12.43 7.57 14 9.5 14H14.5C16.43 14 18 15.57 18 17.5C18 19.43 16.43 21 14.5 21H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className="stat-details">
                      <span className="stat-label">Total Sales</span>
                      <span className="stat-value">{businessDetails.sales.length}</span>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon stat-icon-stock">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M9 17V7L12 3L15 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M3 17H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        <path d="M5 21H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className="stat-details">
                      <span className="stat-label">Stock Movements</span>
                      <span className="stat-value">{businessDetails.inventory.length}</span>
                    </div>
                  </div>
                </div>

                {/* Products Table */}
                <div className="content-card mb-xl">
                  <div className="toolbar">
                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Products Catalog</h2>
                  </div>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr><th>Product</th><th>Price</th><th>Stock</th></tr>
                      </thead>
                      <tbody>
                        {businessDetails.products.slice(0, 20).map(p => (
                          <tr key={p.id}>
                            <td style={{ fontWeight: 500 }}>{p.name}</td>
                            <td>${Number(p.price || 0).toFixed(2)}</td>
                            <td>
                              <span className={`stock-count ${
                                (p.product_inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0) <= 
                                (p.product_inventory?.[0]?.low_stock_threshold || 5) ? 'text-warning' : ''
                              }`}>
                                {p.product_inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {businessDetails.products.length === 0 && (
                          <tr><td colSpan="3" className="text-center py-xl text-muted">No products.</td></tr>
                        )}
                        {businessDetails.products.length > 20 && (
                          <tr><td colSpan="3" className="text-center text-muted" style={{ padding: '0.75rem' }}>…and {businessDetails.products.length - 20} more</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Recent Sales Table */}
                <div className="content-card mb-xl">
                  <div className="toolbar">
                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Recent Sales</h2>
                  </div>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr><th>Sale ID</th><th>Total</th><th>Items</th><th>Date</th></tr>
                      </thead>
                      <tbody>
                        {businessDetails.sales.slice(0, 20).map(s => (
                          <tr key={s.id}>
                            <td className="text-mono" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{s.id.substring(0, 8)}…</td>
                            <td style={{ fontWeight: 600, color: '#4ade80' }}>${Number(s.total_amount || 0).toFixed(2)}</td>
                            <td>{s.sale_items?.length || 0}</td>
                            <td style={{ color: 'var(--color-text-secondary)' }}>{new Date(s.created_at).toLocaleString()}</td>
                          </tr>
                        ))}
                        {businessDetails.sales.length === 0 && (
                          <tr><td colSpan="4" className="text-center py-xl text-muted">No sales recorded.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Stock Movements Table */}
                <div className="content-card">
                  <div className="toolbar">
                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Stock Movements</h2>
                  </div>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr><th>Product</th><th>Type</th><th>Qty</th><th>Date</th></tr>
                      </thead>
                      <tbody>
                        {businessDetails.inventory.slice(0, 20).map(m => (
                          <tr key={m.id}>
                            <td style={{ fontWeight: 500 }}>{m.products?.name || '—'}</td>
                            <td>
                              <span className={`badge ${m.movement_type === 'restock' ? 'badge-neutral' : 'badge-warning'}`} style={m.movement_type === 'restock' ? { color: '#4ade80', borderColor: '#4ade80' } : {}}>
                                {m.movement_type}
                              </span>
                            </td>
                            <td>{m.quantity}</td>
                            <td style={{ color: 'var(--color-text-secondary)' }}>{new Date(m.created_at).toLocaleString()}</td>
                          </tr>
                        ))}
                        {businessDetails.inventory.length === 0 && (
                          <tr><td colSpan="4" className="text-center py-xl text-muted">No stock movements.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══════════════════════════════════
            TAB: USERS
            ═══════════════════════════════════ */}
        {activeTab === 'users' && (
          <>
            <header className="dashboard-header">
              <div>
                <h1 className="dashboard-title">System Users</h1>
                <p className="dashboard-subtitle">Manage all users across every business on the platform.</p>
              </div>
              <button className="btn btn-primary" onClick={() => setShowAddUserModal(true)}>
                {Icons.plus} New User
              </button>
            </header>

            <div className="content-card">
              <div className="toolbar">
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>All Users ({filteredUsers.length})</h2>
                <div className="search-bar">
                  {Icons.search}
                  <input type="text" placeholder="Search users..." value={userSearchTerm} onChange={(e) => setUserSearchTerm(e.target.value)} className="search-input" />
                </div>
              </div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Assigned Business</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.id} style={{ opacity: u.status === 'banned' ? 0.6 : 1 }}>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 500 }}>{u.name || 'Unnamed User'}</span>
                            <span style={{ fontSize: '0.85em', color: 'var(--color-text-tertiary)' }}>{u.email}</span>
                          </div>
                        </td>
                        <td><span className="badge badge-neutral">{u.businesses?.name || 'Unassigned'}</span></td>
                        <td>
                          <span className={`role-badge ${
                            u.roles?.name === 'Platform Admin' ? 'role-badge-manager' :
                            u.roles?.name === 'Business Admin' ? 'role-badge-salesperson' : ''
                          }`} style={!u.roles?.name ? { background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' } : {}}>
                            {u.roles?.name || 'Pending Role'}
                          </span>
                        </td>
                        <td>
                          {u.status === 'banned' ? (
                            <span className="badge badge-warning">Banned</span>
                          ) : (
                            <span className="text-muted text-sm">Active</span>
                          )}
                        </td>
                        <td className="text-right">
                          <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn-icon" onClick={() => openEditUser(u)} title="Edit">{Icons.edit}</button>
                            <button className="btn-icon text-warning hover-bg-warning" onClick={() => handleToggleUserBan(u)} title={u.status === 'banned' ? 'Unban' : 'Ban'}>{Icons.ban}</button>
                            <button className="btn-icon text-error hover-bg-error" onClick={() => handleDeleteUser(u.id, u.email)} title="Delete">{Icons.trash}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr><td colSpan="5" className="text-center py-xl text-muted">No users found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════
            TAB: ROLES
            ═══════════════════════════════════ */}
        {activeTab === 'roles' && (
          <>
            <header className="dashboard-header">
              <div>
                <h1 className="dashboard-title">Roles & Permissions</h1>
                <p className="dashboard-subtitle">Define roles and control what each role can do on the platform.</p>
              </div>
              <button className="btn btn-primary" onClick={() => setShowAddRoleModal(true)}>
                {Icons.plus} New Role
              </button>
            </header>

            <div className="pa-roles-grid">
              {roles.map(r => {
                const usersWithRole = users.filter(u => u.role_id === r.id).length;
                return (
                  <div key={r.id} className="pa-role-card">
                    <div className="pa-role-card-header">
                      <div>
                        <h3 className="pa-role-name">{r.name}</h3>
                        <p className="pa-role-desc">{r.description || 'No description'}</p>
                      </div>
                      <span className="badge badge-neutral">{usersWithRole} user{usersWithRole !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="pa-role-permissions">
                      {(r.permissions || []).map(p => (
                        <span key={p} className="pa-perm-tag">{p.replace(/_/g, ' ')}</span>
                      ))}
                      {(!r.permissions || r.permissions.length === 0) && (
                        <span className="text-muted text-sm">No permissions assigned</span>
                      )}
                    </div>
                    <div className="pa-role-card-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => openEditRole(r)}>
                        {Icons.edit} Edit
                      </button>
                      <button className="btn btn-secondary btn-sm text-error" onClick={() => handleDeleteRole(r.id, r.name)}>
                        {Icons.trash} Delete
                      </button>
                    </div>
                  </div>
                );
              })}
              {roles.length === 0 && (
                <div className="text-center py-xl text-muted">No roles defined yet.</div>
              )}
            </div>
          </>
        )}

        {/* ═══════════════════════════════════
            TAB: PRICING & PLANS
            ═══════════════════════════════════ */}
        {activeTab === 'pricing' && (
          <>
            <header className="dashboard-header">
              <div>
                <h1 className="dashboard-title">Pricing & Plans</h1>
                <p className="dashboard-subtitle">Define subscription tiers and pricing for your tenants.</p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <div className="pa-cycle-toggle">
                  <button className={`pa-cycle-btn ${billingCycle === 'monthly' ? 'active' : ''}`} onClick={() => setBillingCycle('monthly')}>Monthly</button>
                  <button className={`pa-cycle-btn ${billingCycle === 'yearly' ? 'active' : ''}`} onClick={() => setBillingCycle('yearly')}>Yearly</button>
                </div>
                <button className="btn btn-primary" onClick={() => openPlanModal()}>
                  {Icons.plus} New Plan
                </button>
              </div>
            </header>

            <div className="pa-pricing-grid">
              {plans.map((plan, idx) => {
                const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
                const subCount = subscriptions.filter(s => s.plan_id === plan.id).length;
                const features = plan.features || {};
                return (
                  <div key={plan.id} className={`pa-plan-card ${idx === 1 ? 'featured' : ''}`}>
                    {idx === 1 && <span className="pa-plan-badge">Popular</span>}
                    <div className="pa-plan-header">
                      <h3 className="pa-plan-name">{plan.name}</h3>
                      <p className="pa-plan-desc">{plan.description || 'No description'}</p>
                    </div>
                    <div className="pa-plan-price">
                      <span className="pa-plan-currency">{plan.currency || 'GHS'}</span>
                      <span className="pa-plan-amount">{Number(price).toLocaleString()}</span>
                      <span className="pa-plan-period">/{billingCycle === 'yearly' ? 'yr' : 'mo'}</span>
                    </div>
                    <div className="pa-plan-limits">
                      <span className="pa-plan-limit"><strong>{plan.max_users === -1 ? '∞' : plan.max_users}</strong> Users</span>
                      <span className="pa-plan-limit"><strong>{plan.max_locations === -1 ? '∞' : plan.max_locations}</strong> Locations</span>
                      <span className="pa-plan-limit"><strong>{plan.max_products === -1 ? '∞' : plan.max_products}</strong> Products</span>
                      {plan.trial_days > 0 && Number(price) > 0 && <span className="pa-plan-limit"><strong>{plan.trial_days}d</strong> Trial</span>}
                    </div>
                    <div className="pa-plan-features">
                      {Object.entries(FEATURE_LABELS).map(([key, label]) => (
                        <div key={key} className="pa-plan-feature">
                          <span className={`pa-plan-feature-check ${features[key] ? 'enabled' : 'disabled'}`}>
                            {features[key] ? '✓' : '×'}
                          </span>
                          {label}
                        </div>
                      ))}
                    </div>
                    <div className="pa-plan-subscribers">
                      {Icons.users} {subCount} subscriber{subCount !== 1 ? 's' : ''}
                    </div>
                    <div className="pa-plan-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => openPlanModal(plan)}>{Icons.edit} Edit</button>
                      <button className="btn btn-secondary btn-sm text-error" onClick={() => handleDeletePlan(plan.id, plan.name)}>{Icons.trash} Remove</button>
                    </div>
                  </div>
                );
              })}
              {plans.length === 0 && (
                <div className="text-center py-xl text-muted" style={{ gridColumn: '1 / -1' }}>
                  No plans created yet. Click "New Plan" to get started.
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══════════════════════════════════
            TAB: BILLING & PAYMENTS
            ═══════════════════════════════════ */}
        {activeTab === 'billing' && (
          <>
            <header className="dashboard-header">
              <div>
                <h1 className="dashboard-title">Billing & Payments</h1>
                <p className="dashboard-subtitle">Payment gateways, revenue overview, and invoice management.</p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={() => setShowRecordPaymentModal(true)}>
                  {Icons.plus} Record Payment
                </button>
                <button className="btn btn-primary" onClick={() => { setShowAssignPlanModal(true); setAssignForm({ business_id: '', plan_id: '', billing_cycle: 'monthly' }); }}>
                  {Icons.pricing} Assign Plan
                </button>
              </div>
            </header>

            <div className="dashboard-content">
              {/* Revenue Stats */}
              <div className="pa-billing-stats">
                <div className="pa-revenue-card revenue">
                  <span className="pa-revenue-label">Total Revenue</span>
                  <span className="pa-revenue-value positive">{formatCurrency(billingStats.total_revenue)}</span>
                </div>
                <div className="pa-revenue-card mrr">
                  <span className="pa-revenue-label">Monthly Recurring</span>
                  <span className="pa-revenue-value accent">{formatCurrency(billingStats.mrr)}</span>
                </div>
                <div className="pa-revenue-card subs">
                  <span className="pa-revenue-label">Active Subs</span>
                  <span className="pa-revenue-value">{billingStats.active_subscriptions}</span>
                </div>
                <div className="pa-revenue-card outstanding">
                  <span className="pa-revenue-label">Outstanding</span>
                  <span className="pa-revenue-value warning">{formatCurrency(billingStats.outstanding)}</span>
                </div>
                <div className="pa-revenue-card failed">
                  <span className="pa-revenue-label">Failed</span>
                  <span className="pa-revenue-value error">{formatCurrency(billingStats.failed_payments)}</span>
                </div>
              </div>

              {/* Payment Gateways */}
              <div style={{ marginBottom: 'var(--space-2xl)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
                  <h2 className="pa-section-title" style={{ marginBottom: 0 }}>
                    {Icons.billing} Payment Gateways
                  </h2>
                  <button className="btn btn-secondary btn-sm" onClick={() => openGatewayModal()}>
                    {Icons.plus} Add Gateway
                  </button>
                </div>
                <div className="pa-gateway-grid">
                  {gateways.map(gw => (
                    <div key={gw.id} className="pa-gateway-card">
                      <div className="pa-gateway-header">
                        <div className="pa-gateway-provider">
                          <div className={`pa-gateway-logo ${gw.provider}`}>
                            {gw.provider === 'paystack' ? 'P' : gw.provider === 'flutterwave' ? 'F' : 'S'}
                          </div>
                          <span className="pa-gateway-name">{gw.display_name}</span>
                        </div>
                        <span className={`pa-gateway-status ${gw.is_active ? 'active' : 'inactive'}`}>
                          <span className="pa-gateway-status-dot"></span>
                          {gw.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="pa-gateway-details">
                        {gw.public_key && (
                          <div className="pa-key-field">
                            <span className="pa-key-label">Public Key</span>
                            <span className="pa-key-value">{gw.public_key}</span>
                          </div>
                        )}
                        <div className="pa-key-field">
                          <span className="pa-key-label">Secret Key</span>
                          <span className="pa-key-value">{gw.secret_key || 'Not set'}</span>
                        </div>
                      </div>
                      <div className="pa-gateway-currencies">
                        {(gw.supported_currencies || []).map(c => (
                          <span key={c} className="pa-currency-tag">{c}</span>
                        ))}
                      </div>
                      <div className="pa-gateway-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => openGatewayModal(gw)}>{Icons.edit} Edit</button>
                        <button className="btn btn-secondary btn-sm text-error" onClick={() => handleDeleteGateway(gw.id)}>{Icons.trash} Remove</button>
                      </div>
                    </div>
                  ))}
                  {gateways.length === 0 && (
                    <div className="text-center py-xl text-muted">No payment gateways configured yet.</div>
                  )}
                </div>
              </div>

              {/* Invoices Table */}
              <div>
                <h2 className="pa-section-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Recent Invoices
                </h2>
                <div className="content-card">
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Invoice #</th>
                          <th>Business</th>
                          <th>Amount</th>
                          <th>Status</th>
                          <th>Date</th>
                          <th className="text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.slice(0, 25).map(inv => (
                          <tr key={inv.id}>
                            <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{inv.invoice_number}</td>
                            <td>{inv.businesses?.name || '—'}</td>
                            <td style={{ fontWeight: 600 }}>{formatCurrency(inv.amount, inv.currency)}</td>
                            <td><span className={`pa-invoice-badge ${inv.status}`}>{inv.status}</span></td>
                            <td style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>{new Date(inv.created_at).toLocaleDateString()}</td>
                            <td className="text-right">
                              <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                                {inv.status !== 'paid' && (
                                  <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedInvoiceId(inv.id); setShowSendInvoiceModal(true); }}>
                                    {Icons.send} Send
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {invoices.length === 0 && (
                          <tr><td colSpan="6" className="text-center py-xl text-muted">No invoices yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* ═══════════════════════════════════
          MODALS
          ═══════════════════════════════════ */}

      {/* Add Business Modal */}
      {showAddBusinessModal && (
        <Modal isOpen={showAddBusinessModal} onClose={() => setShowAddBusinessModal(false)} title="Register New Tenant">
          <form onSubmit={handleCreateBusiness} className="form-layout">
            <div className="form-group">
              <label>Business Name *</label>
              <input type="text" className="form-input" value={newBusinessName} onChange={(e) => setNewBusinessName(e.target.value)} required />
            </div>
            <hr style={{ border: '1px solid var(--color-border)', margin: '1rem 0' }} />
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Initial Admin Login</h3>
            <div className="form-group">
              <label>Admin Email</label>
              <input type="email" className="form-input" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="Leave blank to skip" />
            </div>
            {adminEmail && (
              <div className="form-group">
                <label>Admin Password *</label>
                <input type="password" className="form-input" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required />
              </div>
            )}
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddBusinessModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Create Tenant</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Business Modal */}
      {showEditBusinessModal && editingBusiness && (
        <Modal isOpen={showEditBusinessModal} onClose={() => setShowEditBusinessModal(false)} title="Edit Business">
          <form onSubmit={handleUpdateBusiness} className="form-layout">
            <div className="form-group">
              <label>Business Name *</label>
              <input type="text" className="form-input" value={editingBusiness.name} onChange={(e) => setEditingBusiness({...editingBusiness, name: e.target.value})} required />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowEditBusinessModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Changes</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add User Modal */}
      {showAddUserModal && (
        <Modal isOpen={showAddUserModal} onClose={() => setShowAddUserModal(false)} title="Create User">
          <form onSubmit={handleCreateUser} className="form-layout">
            <div className="form-group">
              <label>Full Name</label>
              <input type="text" className="form-input" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} required />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Email *</label>
                <input type="email" className="form-input" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Password *</label>
                <input type="password" className="form-input" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} required minLength={6} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Assigned Business</label>
                <select className="form-input" value={newUserBusinessId} onChange={(e) => setNewUserBusinessId(e.target.value)} required>
                  <option value="" disabled>Select a Business</option>
                  {businesses.map(b => (<option key={b.id} value={b.id}>{b.name}</option>))}
                </select>
              </div>
              <div className="form-group">
                <label>System Role</label>
                <select className="form-input" value={newUserRoleId} onChange={(e) => setNewUserRoleId(e.target.value)} required>
                  <option value="" disabled>Select a Role</option>
                  {roles.map(r => (<option key={r.id} value={r.id}>{r.name}</option>))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddUserModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Create User</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit User Modal */}
      {showEditUserModal && editingUser && (
        <Modal isOpen={showEditUserModal} onClose={() => setShowEditUserModal(false)} title="Edit User">
          <form onSubmit={handleUpdateUser} className="form-layout">
            <div className="form-group">
              <label>Name</label>
              <input type="text" className="form-input" value={editingUser.name || ''} onChange={(e) => setEditingUser({...editingUser, name: e.target.value})} required />
            </div>
            <div className="form-group">
              <label>Email (Read Only)</label>
              <input type="text" className="form-input" value={editingUser.email} disabled />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Assigned Business</label>
                <select className="form-input" value={editingUser.business_id || ''} onChange={(e) => setEditingUser({...editingUser, business_id: e.target.value})}>
                  <option value="">Unassigned / Pending</option>
                  {businesses.map(b => (<option key={b.id} value={b.id}>{b.name}</option>))}
                </select>
              </div>
              <div className="form-group">
                <label>System Role</label>
                <select className="form-input" value={editingUser.role_id || ''} onChange={(e) => setEditingUser({...editingUser, role_id: e.target.value})}>
                  <option value="">Pending Role</option>
                  {roles.map(r => (<option key={r.id} value={r.id}>{r.name}</option>))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowEditUserModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Changes</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Role Modal */}
      {showAddRoleModal && (
        <Modal isOpen={showAddRoleModal} onClose={() => setShowAddRoleModal(false)} title="Create New Role">
          <form onSubmit={handleCreateRole} className="form-layout">
            <div className="form-group">
              <label>Role Name *</label>
              <input type="text" className="form-input" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} required placeholder="e.g. Warehouse Staff" />
            </div>
            <div className="form-group">
              <label>Description</label>
              <input type="text" className="form-input" value={newRoleDescription} onChange={(e) => setNewRoleDescription(e.target.value)} placeholder="Brief description of this role" />
            </div>
            <div className="form-group">
              <label>Permissions</label>
              <div className="pa-perm-grid">
                {ALL_PERMISSIONS.map(p => (
                  <label key={p} className="pa-perm-checkbox">
                    <input type="checkbox" checked={newRolePermissions.includes(p)} onChange={() => togglePermission(p, newRolePermissions, setNewRolePermissions)} />
                    <span className="pa-perm-checkbox-label">{p.replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddRoleModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Create Role</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Role Modal */}
      {showEditRoleModal && editingRole && (
        <Modal isOpen={showEditRoleModal} onClose={() => setShowEditRoleModal(false)} title={`Edit Role: ${editingRole.name}`}>
          <form onSubmit={handleUpdateRole} className="form-layout">
            <div className="form-group">
              <label>Role Name *</label>
              <input type="text" className="form-input" value={editingRole.name} onChange={(e) => setEditingRole({...editingRole, name: e.target.value})} required />
            </div>
            <div className="form-group">
              <label>Description</label>
              <input type="text" className="form-input" value={editingRole.description || ''} onChange={(e) => setEditingRole({...editingRole, description: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Permissions</label>
              <div className="pa-perm-grid">
                {ALL_PERMISSIONS.map(p => (
                  <label key={p} className="pa-perm-checkbox">
                    <input type="checkbox" checked={(editingRole.permissions || []).includes(p)} onChange={() => {
                      const perms = editingRole.permissions || [];
                      setEditingRole({
                        ...editingRole,
                        permissions: perms.includes(p) ? perms.filter(x => x !== p) : [...perms, p],
                      });
                    }} />
                    <span className="pa-perm-checkbox-label">{p.replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowEditRoleModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Changes</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ═══════════════════════════════════
          MODAL: CREATE/EDIT PLAN
          ═══════════════════════════════════ */}
      {showPlanModal && (
        <Modal isOpen={true} title={editingPlan ? 'Edit Plan' : 'Create Plan'} onClose={() => setShowPlanModal(false)}>
          <form onSubmit={handleSavePlan}>
            <div className="form-row" style={{ marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Plan Name</label>
                <input className="form-input" value={planForm.name} onChange={e => setPlanForm({ ...planForm, name: e.target.value })} required placeholder="e.g., Starter" />
              </div>
              <div className="form-group">
                <label className="form-label">Currency</label>
                <select className="form-input" value={planForm.currency} onChange={e => setPlanForm({ ...planForm, currency: e.target.value })}>
                  <option value="GHS">GHS (Ghana Cedis)</option>
                  <option value="NGN">NGN (Naira)</option>
                  <option value="USD">USD (US Dollar)</option>
                  <option value="GBP">GBP (Pound)</option>
                  <option value="EUR">EUR (Euro)</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Description</label>
              <textarea className="form-input" rows="2" value={planForm.description} onChange={e => setPlanForm({ ...planForm, description: e.target.value })} placeholder="Brief plan description..." />
            </div>
            <div className="form-row" style={{ marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Monthly Price</label>
                <input className="form-input" type="number" step="0.01" min="0" value={planForm.price_monthly} onChange={e => setPlanForm({ ...planForm, price_monthly: Number(e.target.value) })} />
              </div>
              <div className="form-group">
                <label className="form-label">Yearly Price</label>
                <input className="form-input" type="number" step="0.01" min="0" value={planForm.price_yearly} onChange={e => setPlanForm({ ...planForm, price_yearly: Number(e.target.value) })} />
              </div>
            </div>
            <div className="form-row" style={{ marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Max Users <span style={{ color: 'var(--color-text-tertiary)' }}>(-1 = unlimited)</span></label>
                <input className="form-input" type="number" value={planForm.max_users} onChange={e => setPlanForm({ ...planForm, max_users: Number(e.target.value) })} />
              </div>
              <div className="form-group">
                <label className="form-label">Max Locations</label>
                <input className="form-input" type="number" min="1" value={planForm.max_locations} onChange={e => setPlanForm({ ...planForm, max_locations: Number(e.target.value) })} />
              </div>
            </div>
            <div className="form-row" style={{ marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Max Products <span style={{ color: 'var(--color-text-tertiary)' }}>(-1 = unlimited)</span></label>
                <input className="form-input" type="number" value={planForm.max_products} onChange={e => setPlanForm({ ...planForm, max_products: Number(e.target.value) })} />
              </div>
              <div className="form-group">
                <label className="form-label">Trial Days</label>
                <input className="form-input" type="number" min="0" value={planForm.trial_days} onChange={e => setPlanForm({ ...planForm, trial_days: Number(e.target.value) })} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Features</label>
              <div className="checkbox-grid">
                {Object.entries(FEATURE_LABELS).map(([key, label]) => (
                  <label key={key} className="checkbox-label">
                    <input type="checkbox" checked={planForm.features?.[key] || false} onChange={e => setPlanForm({ ...planForm, features: { ...planForm.features, [key]: e.target.checked } })} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowPlanModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editingPlan ? 'Update Plan' : 'Create Plan'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ═══════════════════════════════════
          MODAL: CREATE/EDIT GATEWAY
          ═══════════════════════════════════ */}
      {showGatewayModal && (
        <Modal isOpen={true} title={editingGateway ? 'Edit Gateway' : 'Add Payment Gateway'} onClose={() => setShowGatewayModal(false)}>
          <form onSubmit={handleSaveGateway}>
            <div className="form-row" style={{ marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Provider</label>
                <select className="form-input" value={gatewayForm.provider} onChange={e => setGatewayForm({ ...gatewayForm, provider: e.target.value })}>
                  <option value="paystack">Paystack</option>
                  <option value="flutterwave">Flutterwave</option>
                  <option value="stripe">Stripe</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Display Name</label>
                <input className="form-input" value={gatewayForm.display_name} onChange={e => setGatewayForm({ ...gatewayForm, display_name: e.target.value })} required />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Public Key</label>
              <input className="form-input" value={gatewayForm.public_key} onChange={e => setGatewayForm({ ...gatewayForm, public_key: e.target.value })} placeholder="pk_test_..." />
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Secret Key</label>
              <input className="form-input" type="password" value={gatewayForm.secret_key} onChange={e => setGatewayForm({ ...gatewayForm, secret_key: e.target.value })} placeholder="sk_test_..." />
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Webhook Secret <span style={{ color: 'var(--color-text-tertiary)' }}>(optional)</span></label>
              <input className="form-input" type="password" value={gatewayForm.webhook_secret} onChange={e => setGatewayForm({ ...gatewayForm, webhook_secret: e.target.value })} placeholder="whsec_..." />
            </div>
            <div className="form-row" style={{ marginBottom: '1rem' }}>
              <label className="checkbox-label">
                <input type="checkbox" checked={gatewayForm.is_active} onChange={e => setGatewayForm({ ...gatewayForm, is_active: e.target.checked })} />
                Active
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={gatewayForm.is_default} onChange={e => setGatewayForm({ ...gatewayForm, is_default: e.target.checked })} />
                Default Gateway
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowGatewayModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editingGateway ? 'Update Gateway' : 'Add Gateway'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ═══════════════════════════════════
          MODAL: ASSIGN PLAN TO BUSINESS
          ═══════════════════════════════════ */}
      {showAssignPlanModal && (
        <Modal isOpen={true} title="Assign Plan to Business" onClose={() => setShowAssignPlanModal(false)}>
          <form onSubmit={handleAssignPlan}>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Business</label>
              <select className="form-input" value={assignForm.business_id} onChange={e => setAssignForm({ ...assignForm, business_id: e.target.value })} required>
                <option value="">Select a business...</option>
                {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Plan</label>
              <select className="form-input" value={assignForm.plan_id} onChange={e => setAssignForm({ ...assignForm, plan_id: e.target.value })} required>
                <option value="">Select a plan...</option>
                {plans.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.name} — {formatCurrency(p.price_monthly, p.currency)}/mo</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Billing Cycle</label>
              <select className="form-input" value={assignForm.billing_cycle} onChange={e => setAssignForm({ ...assignForm, billing_cycle: e.target.value })}>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAssignPlanModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Assign Plan</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ═══════════════════════════════════
          MODAL: SEND INVOICE
          ═══════════════════════════════════ */}
      {showSendInvoiceModal && (
        <Modal isOpen={true} title="Send Invoice Email" onClose={() => setShowSendInvoiceModal(false)}>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            This will send the invoice email to the business admin and platform admin email addresses.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setShowSendInvoiceModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSendInvoice}>{Icons.send} Send Invoice</button>
          </div>
        </Modal>
      )}

      {/* ═══════════════════════════════════
          MODAL: RECORD MANUAL PAYMENT
          ═══════════════════════════════════ */}
      {showRecordPaymentModal && (
        <Modal isOpen={true} title="Record Manual Payment" onClose={() => setShowRecordPaymentModal(false)}>
          <form onSubmit={handleRecordPayment}>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Business</label>
              <select className="form-input" value={paymentForm.business_id} onChange={e => setPaymentForm({ ...paymentForm, business_id: e.target.value })} required>
                <option value="">Select a business...</option>
                {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="form-row" style={{ marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Amount</label>
                <input className="form-input" type="number" step="0.01" min="0.01" value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} required placeholder="0.00" />
              </div>
              <div className="form-group">
                <label className="form-label">Currency</label>
                <select className="form-input" value={paymentForm.currency} onChange={e => setPaymentForm({ ...paymentForm, currency: e.target.value })}>
                  <option value="GHS">GHS</option>
                  <option value="NGN">NGN</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Payment Method</label>
              <select className="form-input" value={paymentForm.payment_method} onChange={e => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cash">Cash</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Description <span style={{ color: 'var(--color-text-tertiary)' }}>(optional)</span></label>
              <input className="form-input" value={paymentForm.description} onChange={e => setPaymentForm({ ...paymentForm, description: e.target.value })} placeholder="e.g., Bank transfer for Pro plan renewal" />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowRecordPaymentModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{Icons.plus} Record Payment</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
