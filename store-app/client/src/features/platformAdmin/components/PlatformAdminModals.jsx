import { usePlatformAdmin } from '../PlatformAdminContext';
import Modal from '../../../components/Modal';
import { Icons } from '../../../components/icons/Icons';

export default function PlatformAdminModals() {
  const {
    businesses, roles, plans, ALL_PERMISSIONS,
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
    showPlanModal, setShowPlanModal,
    editingPlan,
    planForm, setPlanForm,
    showGatewayModal, setShowGatewayModal,
    editingGateway,
    gatewayForm, setGatewayForm,
    showSendInvoiceModal, setShowSendInvoiceModal,
    showRecordPaymentModal, setShowRecordPaymentModal,
    paymentForm, setPaymentForm,
    showAssignPlanModal, setShowAssignPlanModal,
    assignForm, setAssignForm,
    handleCreateBusiness, handleUpdateBusiness,
    handleCreateUser, handleUpdateUser,
    handleCreateRole, handleUpdateRole, togglePermission,
    handleSavePlan, handleSaveGateway, handleSendInvoice, handleRecordPayment, handleAssignPlan,
    showTemplateModal, setShowTemplateModal,
    editingTemplate, templateForm, setTemplateForm, handleSaveTemplate,
    showCommsGatewayModal, setShowCommsGatewayModal,
    editingCommsGateway, commsGatewayForm, setCommsGatewayForm, handleSaveCommsGateway,
    FEATURE_LABELS, formatCurrency,
  } = usePlatformAdmin();

  return (
    <>
    

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

{/* ═══════════════════════════════════
    MODAL: CREATE/EDIT TEMPLATE
    ═══════════════════════════════════ */}
{showTemplateModal && (
  <Modal isOpen={true} title={editingTemplate ? 'Edit Template' : 'New Template'} onClose={() => setShowTemplateModal(false)}>
    <form onSubmit={handleSaveTemplate}>
      <div className="form-group" style={{ marginBottom: '1.25rem' }}>
        <label className="form-label">Template Name</label>
        <input className="form-input" value={templateForm.name} onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })} required placeholder="e.g., Black Friday Promo" style={{ fontSize: '1rem', padding: '0.75rem' }} />
      </div>
      <div className="form-group" style={{ marginBottom: '1.25rem' }}>
        <label className="form-label">Type</label>
        <select className="form-input" value={templateForm.type} onChange={e => setTemplateForm({ ...templateForm, type: e.target.value })} style={{ padding: '0.75rem' }}>
          <option value="email">Email Template</option>
          <option value="sms">SMS Template</option>
        </select>
      </div>
      {templateForm.type === 'email' && (
        <div className="form-group" style={{ marginBottom: '1.25rem' }}>
          <label className="form-label">Subject Line</label>
          <input className="form-input" value={templateForm.subject} onChange={e => setTemplateForm({ ...templateForm, subject: e.target.value })} required={templateForm.type === 'email'} placeholder="Catchy email subject..." style={{ padding: '0.75rem' }} />
        </div>
      )}
      <div className="form-group" style={{ marginBottom: '1.5rem' }}>
        <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Message Content</span>
          {templateForm.type === 'sms' && <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>{templateForm.content.length} chars</span>}
        </label>
        <textarea className="form-input" rows="8" value={templateForm.content} onChange={e => setTemplateForm({ ...templateForm, content: e.target.value })} required placeholder={templateForm.type === 'email' ? "Design your HTML email..." : "Type your SMS message..."} style={{ padding: '0.75rem', fontFamily: templateForm.type === 'email' ? 'monospace' : 'inherit', resize: 'vertical' }} />
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={() => setShowTemplateModal(false)}>Cancel</button>
        <button type="submit" className="btn btn-primary">{editingTemplate ? 'Update Template' : 'Save Template'}</button>
      </div>
    </form>
  </Modal>
)}

{/* ═══════════════════════════════════
    MODAL: CREATE/EDIT COMMS GATEWAY
    ═══════════════════════════════════ */}
{showCommsGatewayModal && (
  <Modal isOpen={true} title={editingCommsGateway ? 'Edit Communication Gateway' : 'Add Communication Gateway'} onClose={() => setShowCommsGatewayModal(false)}>
    <form onSubmit={handleSaveCommsGateway}>
      <div className="form-row" style={{ marginBottom: '1rem' }}>
        <div className="form-group">
          <label className="form-label">Gateway Type</label>
          <select className="form-input" value={commsGatewayForm.type} onChange={e => setCommsGatewayForm({ ...commsGatewayForm, type: e.target.value, provider: e.target.value === 'sms' ? 'arkesel' : 'resend' })}>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Provider</label>
          <select className="form-input" value={commsGatewayForm.provider} onChange={e => setCommsGatewayForm({ ...commsGatewayForm, provider: e.target.value })}>
            {commsGatewayForm.type === 'sms' ? (
              <>
                <optgroup label="Local (Ghana)">
                  <option value="arkesel">Arkesel</option>
                  <option value="mnotify">mNotify</option>
                  <option value="hubtel">Hubtel</option>
                </optgroup>
                <optgroup label="Global">
                  <option value="twilio">Twilio</option>
                </optgroup>
              </>
            ) : (
              <>
                <option value="resend">Resend</option>
                <option value="sendgrid">SendGrid</option>
                <option value="smtp">SMTP</option>
              </>
            )}
          </select>
        </div>
      </div>
      <div className="form-group" style={{ marginBottom: '1rem' }}>
        <label className="form-label">Display Name</label>
        <input className="form-input" value={commsGatewayForm.display_name} onChange={e => setCommsGatewayForm({ ...commsGatewayForm, display_name: e.target.value })} required placeholder="e.g. Arkesel Primary" />
      </div>
      
      {commsGatewayForm.type === 'sms' && (
        <div className="form-group" style={{ marginBottom: '1rem' }}>
          <label className="form-label">Sender ID</label>
          <input className="form-input" value={commsGatewayForm.sender_id} onChange={e => setCommsGatewayForm({ ...commsGatewayForm, sender_id: e.target.value })} placeholder="e.g. QUADEM (max 11 chars)" maxLength={11} />
        </div>
      )}

      {commsGatewayForm.type === 'email' && commsGatewayForm.provider === 'resend' && (
        <div className="form-group" style={{ marginBottom: '1rem' }}>
          <label className="form-label">From Email Address</label>
          <input className="form-input" value={commsGatewayForm.sender_id} onChange={e => setCommsGatewayForm({ ...commsGatewayForm, sender_id: e.target.value })} placeholder="e.g. Acme Corp <updates@acme.com>" />
        </div>
      )}
      
      <div className="form-group" style={{ marginBottom: '1rem' }}>
        <label className="form-label">API Key</label>
        <input className="form-input" type="password" value={commsGatewayForm.api_key} onChange={e => setCommsGatewayForm({ ...commsGatewayForm, api_key: e.target.value })} placeholder="Enter API Key" />
      </div>
      
      <div className="form-row" style={{ marginBottom: '1rem' }}>
        <label className="checkbox-label">
          <input type="checkbox" checked={commsGatewayForm.is_active} onChange={e => setCommsGatewayForm({ ...commsGatewayForm, is_active: e.target.checked })} />
          Active
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={commsGatewayForm.is_default} onChange={e => setCommsGatewayForm({ ...commsGatewayForm, is_default: e.target.checked })} />
          Default for {commsGatewayForm.type.toUpperCase()}
        </label>
      </div>
      
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={() => setShowCommsGatewayModal(false)}>Cancel</button>
        <button type="submit" className="btn btn-primary">{editingCommsGateway ? 'Update Gateway' : 'Add Gateway'}</button>
      </div>
    </form>
  </Modal>
)}

    </>
  );
}
