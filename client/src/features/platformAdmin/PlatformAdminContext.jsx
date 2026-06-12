import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import { useAuthContext } from '../../lib/AuthContext';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';

const PlatformAdminContext = createContext();

export function usePlatformAdmin() {
  const context = useContext(PlatformAdminContext);
  if (!context) throw new Error("usePlatformAdmin must be used within PlatformAdminProvider");
  return context;
}

export function PlatformAdminProvider({ children }) {
  const { user, role, signOut } = useAuthContext();
  const toast = useToast();
  const confirmDialog = useConfirm();

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
        if (import.meta.env.DEV) console.warn('Billing data not available yet (run migration 015):', billingErr.message);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error fetching platform data:', err);
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
      if (import.meta.env.DEV) console.error('Error fetching business details:', err);
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
        toast.success(`Business "${newBusinessName}" and admin account created successfully!`);
      } else {
        toast.success(`Business "${newBusinessName}" created successfully!`);
      }
      setShowAddBusinessModal(false);
      setNewBusinessName(''); setAdminEmail(''); setAdminPassword('');
      fetchData();
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error creating business:', err);
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
    } catch (err) { toast.error(`Error updating business: ${err.message}`); }
  };

  const handleToggleBusinessBan = async (business) => {
    const newStatus = business.status === 'banned' ? 'active' : 'banned';
    const action = newStatus === 'banned' ? 'ban' : 'unban';
    const confirmed = await confirmDialog({ title: `${action.charAt(0).toUpperCase() + action.slice(1)} Business`, message: `Are you sure you want to ${action} ${business.name}? Users in a banned business cannot access the system.`, variant: 'danger', confirmText: action.charAt(0).toUpperCase() + action.slice(1) });
    if (!confirmed) return;
    try {
      const { error } = await supabase.from('businesses').update({ status: newStatus }).eq('id', business.id);
      if (error) throw error;
      fetchData();
    } catch (err) { toast.error(`Error updating status: ${err.message}`); }
  };

  const handleDeleteBusiness = async (id, name) => {
    const confirmed = await confirmDialog({ title: 'Delete Business', message: `CRITICAL: Are you sure you want to permanently delete "${name}"? This will delete all associated products and sales! This action cannot be undone.`, variant: 'danger', confirmText: 'Delete Permanently' });
    if (!confirmed) return;
    try {
      const { error } = await supabase.from('businesses').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err) { 
      if (err.message && err.message.includes('users_business_id_fkey')) {
        toast.error(`Cannot delete business "${name}" because there are users associated with it. Please "Ban" the business instead, or delete its users first.`);
      } else {
        toast.error(`Error deleting business: ${err.message}`); 
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
      toast.success(`User ${newUserEmail} created successfully!`);
      setShowAddUserModal(false);
      setNewUserEmail(''); setNewUserPassword(''); setNewUserName(''); setNewUserBusinessId(''); setNewUserRoleId('');
      fetchData();
    } catch (err) { if (import.meta.env.DEV) console.error('Error creating user:', err); toast.error(`Failed to create user: ${err.message}`); }
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
    } catch (err) { toast.error(`Error updating user: ${err.response?.data?.error || err.message}`); }
  };

  const handleToggleUserBan = async (u) => {
    const newStatus = u.status === 'banned' ? 'active' : 'banned';
    const action = newStatus === 'banned' ? 'ban' : 'unban';
    const confirmed = await confirmDialog({ title: `${action.charAt(0).toUpperCase() + action.slice(1)} User`, message: `Are you sure you want to ${action} ${u.email}? A banned user cannot access any data.`, variant: 'danger', confirmText: action.charAt(0).toUpperCase() + action.slice(1) });
    if (!confirmed) return;
    try {
      await api.put(`/users/${u.id}`, {
        name: u.name,
        role_id: u.role_id,
        status: newStatus
      });
      fetchData();
    } catch (err) { toast.error(`Error updating status: ${err.response?.data?.error || err.message}`); }
  };

  const handleDeleteUser = async (id, email) => {
    const confirmed = await confirmDialog({ title: 'Delete User', message: `CRITICAL: Are you sure you want to permanently delete user "${email}"? They will lose all access.`, variant: 'danger', confirmText: 'Delete Permanently' });
    if (!confirmed) return;
    try { 
      await api.delete(`/users/${id}`); 
      fetchData(); 
    } catch (err) { 
      toast.error(`Error deleting user: ${err.response?.data?.error || err.message}`); 
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
      toast.success(`Role "${newRoleName}" created successfully!`);
      setShowAddRoleModal(false);
      setNewRoleName(''); setNewRoleDescription(''); setNewRolePermissions([]);
      fetchData();
    } catch (err) { toast.error(`Error creating role: ${err.message}`); }
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
    } catch (err) { toast.error(`Error updating role: ${err.message}`); }
  };

  const handleDeleteRole = async (id, name) => {
    const confirmed = await confirmDialog({ title: 'Delete Role', message: `Are you sure you want to delete role "${name}"? Users with this role may lose access.`, variant: 'danger', confirmText: 'Delete' });
    if (!confirmed) return;
    try {
      const { error } = await supabase.from('roles').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err) { toast.error(`Error deleting role: ${err.message}`); }
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
    } catch (err) { toast.error(`Error saving plan: ${err.message}`); }
  };

  const handleDeletePlan = async (id, name) => {
    const confirmed = await confirmDialog({ title: 'Deactivate Plan', message: `Deactivate plan "${name}"? Existing subscribers will keep their current plan.`, variant: 'danger', confirmText: 'Deactivate' });
    if (!confirmed) return;
    try { await api.delete(`/subscriptions/plans/${id}`); fetchData(); }
    catch (err) { toast.error(`Error: ${err.message}`); }
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
    } catch (err) { toast.error(`Error saving gateway: ${err.message}`); }
  };

  const handleDeleteGateway = async (id) => {
    const confirmed = await confirmDialog({ title: 'Remove Gateway', message: 'Remove this payment gateway configuration?', variant: 'danger', confirmText: 'Remove' });
    if (!confirmed) return;
    try { await api.delete(`/billing/gateways/${id}`); fetchData(); }
    catch (err) { toast.error(`Error: ${err.message}`); }
  };

  /* ============================
     ASSIGN PLAN TO BUSINESS
     ============================ */
  const handleAssignPlan = async (e) => {
    e.preventDefault();
    try {
      await api.post('/subscriptions/assign', assignForm);
      toast.success('Plan assigned successfully!');
      setShowAssignPlanModal(false);
      setAssignForm({ business_id: '', plan_id: '', billing_cycle: 'monthly' });
      fetchData();
      // Refresh business detail if viewing one
      if (selectedBusiness && selectedBusiness.id === assignForm.business_id) {
        fetchBusinessSubscription(selectedBusiness.id);
      }
    } catch (err) { toast.error(`Error assigning plan: ${err.message}`); }
  };

  /* ============================
     SEND INVOICE EMAIL
     ============================ */
  const handleSendInvoice = async () => {
    if (!selectedInvoiceId) return;
    try {
      const result = await api.post('/billing/invoices/send', { invoice_id: selectedInvoiceId });
      toast.success(result.simulated ? 'Invoice email simulated (configure Resend API key for real emails)' : `Invoice sent to: ${result.recipients?.join(', ')}`);
      setShowSendInvoiceModal(false); setSelectedInvoiceId(null); fetchData();
    } catch (err) { toast.error(`Error sending invoice: ${err.message}`); }
  };

  /* ============================
     RECORD MANUAL PAYMENT
     ============================ */
  const handleRecordPayment = async (e) => {
    e.preventDefault();
    try {
      await api.post('/billing/record-payment', { ...paymentForm, amount: Number(paymentForm.amount) });
      toast.success('Payment recorded successfully!');
      setShowRecordPaymentModal(false);
      setPaymentForm({ business_id: '', amount: '', currency: 'GHS', payment_method: 'bank_transfer', description: '' });
      fetchData();
    } catch (err) { toast.error(`Error recording payment: ${err.message}`); }
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
      if (import.meta.env.DEV) console.warn('Could not fetch subscription:', err.message);
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



  const value = {
    user, role, signOut,
    businesses, setBusinesses,
    users, setUsers,
    roles, setRoles,
    loading, setLoading,
    error, setError,
    activeTab, setActiveTab,
    businessSearchTerm, setBusinessSearchTerm,
    userSearchTerm, setUserSearchTerm,
    selectedBusiness, setSelectedBusiness,
    businessDetails, setBusinessDetails,
    detailsLoading, setDetailsLoading,
    showAddBusinessModal, setShowAddBusinessModal,
    newBusinessName, setNewBusinessName,
    adminEmail, setAdminEmail,
    adminPassword, setAdminPassword,
    showEditBusinessModal, setShowEditBusinessModal,
    editingBusiness, setEditingBusiness,
    showAddUserModal, setShowAddUserModal,
    newUserEmail, setNewUserEmail,
    newUserPassword, setNewUserPassword,
    newUserName, setNewUserName,
    newUserBusinessId, setNewUserBusinessId,
    newUserRoleId, setNewUserRoleId,
    showEditUserModal, setShowEditUserModal,
    editingUser, setEditingUser,
    showAddRoleModal, setShowAddRoleModal,
    newRoleName, setNewRoleName,
    newRoleDescription, setNewRoleDescription,
    newRolePermissions, setNewRolePermissions,
    showEditRoleModal, setShowEditRoleModal,
    editingRole, setEditingRole,
    uptimeStats,
    plans, setPlans,
    billingCycle, setBillingCycle,
    showPlanModal, setShowPlanModal,
    editingPlan, setEditingPlan,
    planForm, setPlanForm,
    gateways, setGateways,
    invoices, setInvoices,
    billingStats, setBillingStats,
    subscriptions, setSubscriptions,
    showGatewayModal, setShowGatewayModal,
    editingGateway, setEditingGateway,
    gatewayForm, setGatewayForm,
    showSendInvoiceModal, setShowSendInvoiceModal,
    selectedInvoiceId, setSelectedInvoiceId,
    showRecordPaymentModal, setShowRecordPaymentModal,
    paymentForm, setPaymentForm,
    showAssignPlanModal, setShowAssignPlanModal,
    assignForm, setAssignForm,
    businessSubscription, setBusinessSubscription,
    ALL_PERMISSIONS,
    fetchData,
    // Business CRUD
    handleCreateBusiness, handleUpdateBusiness, handleToggleBusinessBan, handleDeleteBusiness, handleViewBusiness, openEditBusiness,
    // Aliases used by tab components
    handleAddBusiness: handleCreateBusiness, handleEditBusiness: handleUpdateBusiness,
    handleBanBusiness: handleToggleBusinessBan, handleUnbanBusiness: handleToggleBusinessBan,
    // User CRUD
    handleCreateUser, handleUpdateUser, handleToggleUserBan, handleDeleteUser, openEditUser,
    handleAddUser: handleCreateUser, handleEditUser: handleUpdateUser,
    handleBanUser: handleToggleUserBan, handleUnbanUser: handleToggleUserBan,
    // Role CRUD
    handleCreateRole, handleUpdateRole, handleDeleteRole, openEditRole,
    handleAddRole: handleCreateRole, handleEditRole: openEditRole,
    // Plan CRUD
    handleSavePlan, handleDeletePlan, openPlanModal,
    // Gateway CRUD
    handleSaveGateway, handleDeleteGateway, openGatewayModal,
    // Billing
    handleSendInvoice, handleRecordPayment, handleAssignPlan,
    // Helpers
    togglePermission, formatCurrency, FEATURE_LABELS,
    activeBusinesses, recentBusinesses, activeUsers, businessAdmins,
    filteredBusinesses, filteredUsers,
    users
  };

  return (
    <PlatformAdminContext.Provider value={value}>
      {children}
    </PlatformAdminContext.Provider>
  );
}
