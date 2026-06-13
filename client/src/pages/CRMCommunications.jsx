import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import Modal from '../components/Modal';

// Simple SVG Icons
const Icons = {
  email: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 7.00005L10.2 11.65C11.2667 12.45 12.7333 12.45 13.8 11.65L20 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  sms: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="2"/></svg>,
  plus: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  edit: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  trash: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><line x1="10" y1="11" x2="10" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><line x1="14" y1="11" x2="14" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  send: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><line x1="22" y1="2" x2="11" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><polygon points="22 2 15 22 11 13 2 9 22 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

export default function CRMCommunications() {
  const showToast = useToast();
  const confirm = useConfirm();

  const [templates, setTemplates] = useState([]);
  const [gateways, setGateways] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Campaign State
  const [campaignForm, setCampaignForm] = useState({
    targetAudience: 'all_customers',
    customerId: '',
    type: 'both',
    templateId: '',
    subject: '',
    message: ''
  });

  // Modals
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({ name: '', type: 'sms', subject: '', content: '' });

  const [isGatewayModalOpen, setIsGatewayModalOpen] = useState(false);
  const [editingGateway, setEditingGateway] = useState(null);
  const [gatewayForm, setGatewayForm] = useState({ provider: 'arkesel', type: 'sms', display_name: '', api_key: '', secret_key: '', sender_id: '', is_active: true, is_default: false });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resTmpl, resGw, resCust] = await Promise.all([
        api.get('/crm-communications/templates').catch(() => []),
        api.get('/crm-communications/gateways').catch(() => []),
        api.get('/customers').catch(() => []) // Fetch customers to pick from
      ]);
      setTemplates(resTmpl);
      setGateways(resGw);
      setCustomers(resCust.data || resCust || []);
    } catch (err) {
      console.error(err);
      showToast('Failed to load CRM data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // -- Campaigns --
  const handleCampaignChange = (e) => {
    const { name, value } = e.target;
    setCampaignForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSendCampaign = async (e) => {
    e.preventDefault();
    const isConfirmed = await confirm({
      title: 'Send Campaign',
      message: 'Are you sure you want to send this message? This action cannot be undone.',
      confirmText: 'Send Message'
    });
    if (!isConfirmed) return;

    try {
      const res = await api.post('/crm-communications/send', campaignForm);
      showToast(`Campaign sent successfully! SMS: ${res.smsResults?.success ? 'Sent' : 'Skipped/Failed'}, Email: ${res.emailResults?.success ? 'Sent' : 'Skipped/Failed'}`, 'success');
      setCampaignForm({ targetAudience: 'all_customers', customerId: '', type: 'both', templateId: '', subject: '', message: '' });
    } catch (err) {
      showToast(err.message || 'Failed to send campaign', 'error');
    }
  };

  // -- Templates --
  const openTemplateModal = (tmpl = null) => {
    setEditingTemplate(tmpl);
    if (tmpl) {
      setTemplateForm({ name: tmpl.name, type: tmpl.type, subject: tmpl.subject || '', content: tmpl.content });
    } else {
      setTemplateForm({ name: '', type: 'sms', subject: '', content: '' });
    }
    setIsTemplateModalOpen(true);
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    try {
      if (editingTemplate) {
        await api.post('/crm-communications/templates', { ...templateForm, id: editingTemplate.id });
        showToast('Template updated successfully', 'success');
      } else {
        await api.post('/crm-communications/templates', templateForm);
        showToast('Template created successfully', 'success');
      }
      setIsTemplateModalOpen(false);
      fetchData();
    } catch (err) {
      showToast(err.message || 'Failed to save template', 'error');
    }
  };

  const handleDeleteTemplate = async (id, name) => {
    if (await confirm({ title: 'Delete Template', message: `Delete template "${name}"?`, variant: 'danger' })) {
      try {
        await api.delete(`/crm-communications/templates/${id}`);
        showToast('Template deleted', 'success');
        fetchData();
      } catch (err) {
        showToast('Failed to delete template', 'error');
      }
    }
  };

  // -- Gateways --
  const openGatewayModal = (gw = null) => {
    setEditingGateway(gw);
    if (gw) {
      setGatewayForm({ 
        provider: gw.provider, 
        type: gw.type, 
        display_name: gw.display_name, 
        api_key: gw.api_key || '', 
        secret_key: gw.secret_key || '', 
        sender_id: gw.sender_id || '', 
        is_active: gw.is_active, 
        is_default: gw.is_default 
      });
    } else {
      setGatewayForm({ provider: 'arkesel', type: 'sms', display_name: '', api_key: '', secret_key: '', sender_id: '', is_active: true, is_default: false });
    }
    setIsGatewayModalOpen(true);
  };

  const handleSaveGateway = async (e) => {
    e.preventDefault();
    try {
      if (editingGateway) {
        await api.put(`/crm-communications/gateways/${editingGateway.id}`, gatewayForm);
        showToast('Gateway updated successfully', 'success');
      } else {
        await api.post('/crm-communications/gateways', gatewayForm);
        showToast('Gateway added successfully', 'success');
      }
      setIsGatewayModalOpen(false);
      fetchData();
    } catch (err) {
      showToast(err.message || 'Failed to save gateway', 'error');
    }
  };

  const handleDeleteGateway = async (id) => {
    if (await confirm({ title: 'Remove Gateway', message: 'Are you sure you want to remove this gateway?', variant: 'danger' })) {
      try {
        await api.delete(`/crm-communications/gateways/${id}`);
        showToast('Gateway removed', 'success');
        fetchData();
      } catch (err) {
        showToast('Failed to remove gateway', 'error');
      }
    }
  };

  if (loading && templates.length === 0 && gateways.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="spinner mx-auto" />
        <p className="mt-sm text-muted">Loading CRM Communications...</p>
      </div>
    );
  }

  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="dashboard-title">Marketing & Communications</h1>
          <p className="dashboard-subtitle">Manage communication gateways, templates, and send direct messages to customers.</p>
        </div>
      </header>

      <div className="dashboard-content mt-xl">
        
        {/* Gateways Section */}
        <div style={{ marginBottom: 'var(--space-2xl)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
            <h2 className="pa-section-title" style={{ marginBottom: 0 }}>
              {Icons.settings} Custom Communication Gateways
            </h2>
            <button className="btn btn-secondary btn-sm" onClick={() => openGatewayModal()}>
              {Icons.plus} Add Gateway
            </button>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
            If you don't configure your own gateways, the platform's default gateways will be used to send your messages.
          </p>
          
          <div className="pa-gateway-grid">
            {gateways.map(gw => (
              <div key={gw.id} className="pa-gateway-card" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
                <div className="pa-gateway-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--color-accent-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                      {gw.provider.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>{gw.display_name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {gw.is_default && <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Default {gw.type.toUpperCase()}</span>}
                    <span style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', color: gw.is_active ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'currentColor' }}></span>
                      {gw.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div><strong>Type:</strong> <span style={{ textTransform: 'uppercase' }}>{gw.type}</span></div>
                  {gw.sender_id && <div><strong>Sender ID:</strong> {gw.sender_id}</div>}
                  {gw.api_key && <div style={{ gridColumn: '1 / -1' }}><strong>API Key:</strong> {gw.api_key}</div>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => openGatewayModal(gw)}>{Icons.edit} Edit</button>
                  <button className="btn btn-secondary btn-sm text-error" style={{ flex: 1 }} onClick={() => handleDeleteGateway(gw.id)}>{Icons.trash} Remove</button>
                </div>
              </div>
            ))}
            {gateways.length === 0 && (
              <div className="text-center py-xl text-muted" style={{ gridColumn: '1 / -1', border: '1px dashed var(--color-border)', borderRadius: '8px' }}>
                No custom gateways configured. The platform default will be used.
              </div>
            )}
          </div>
        </div>

        {/* Campaign & Templates Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
          
          {/* Send Campaign */}
          <div className="glass-panel" style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', fontWeight: 600 }}>Send Campaign</h2>
            <form onSubmit={handleSendCampaign} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              <div>
                <label className="form-label">Target Audience</label>
                <select 
                  name="targetAudience"
                  value={campaignForm.targetAudience}
                  onChange={handleCampaignChange}
                  className="input"
                  required
                >
                  <option value="all_customers">All Customers</option>
                  <option value="recent_buyers">Recent Buyers (Last 30 Days)</option>
                  <option value="specific_customer">Specific Customer</option>
                </select>
              </div>

              {campaignForm.targetAudience === 'specific_customer' && (
                <div>
                  <label className="form-label">Select Customer</label>
                  <select 
                    name="customerId"
                    value={campaignForm.customerId}
                    onChange={handleCampaignChange}
                    className="input"
                    required={campaignForm.targetAudience === 'specific_customer'}
                  >
                    <option value="">-- Choose Customer --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.phone || c.email})</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="form-label">Channel</label>
                <select 
                  name="type"
                  value={campaignForm.type}
                  onChange={handleCampaignChange}
                  className="input"
                  required
                >
                  <option value="both">Both (Email & SMS)</option>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
              </div>

              <div>
                <label className="form-label">Template (Optional)</label>
                <select 
                  name="templateId"
                  value={campaignForm.templateId}
                  onChange={(e) => {
                    const tmpl = templates.find(t => t.id === e.target.value);
                    if (tmpl) {
                      setCampaignForm(prev => ({ ...prev, templateId: tmpl.id, subject: tmpl.subject || '', message: tmpl.content }));
                    } else {
                      setCampaignForm(prev => ({ ...prev, templateId: '' }));
                    }
                  }}
                  className="input"
                >
                  <option value="">-- Start Blank --</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                  ))}
                </select>
              </div>

              {(campaignForm.type === 'email' || campaignForm.type === 'both') && (
                <div>
                  <label className="form-label">Subject</label>
                  <input 
                    type="text"
                    name="subject"
                    value={campaignForm.subject}
                    onChange={handleCampaignChange}
                    className="input"
                    required={campaignForm.type === 'email' || campaignForm.type === 'both'}
                    placeholder="Email Subject"
                  />
                </div>
              )}

              <div>
                <label className="form-label">Message Content</label>
                <textarea 
                  name="message"
                  value={campaignForm.message}
                  onChange={handleCampaignChange}
                  className="input"
                  style={{ minHeight: '150px', resize: 'vertical' }}
                  required
                  placeholder={campaignForm.type === 'email' ? 'HTML or text content...' : 'Text message...'}
                />
                {(campaignForm.type === 'sms' || campaignForm.type === 'both') && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>
                    SMS Length: {campaignForm.message.length} characters ({(Math.ceil(campaignForm.message.length / 160)) || 1} message(s) per recipient).
                  </p>
                )}
              </div>

              <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                {Icons.send} Review & Send Campaign
              </button>
            </form>
          </div>

          {/* Templates */}
          <div className="glass-panel" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Saved Templates</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => openTemplateModal()}>+ New Template</button>
            </div>

            {templates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-border)' }}>
                <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>No templates saved yet.</p>
                <button className="btn btn-primary btn-sm" onClick={() => openTemplateModal()}>Create your first template</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {templates.map(t => (
                  <div key={t.id} style={{ padding: '1rem', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ flex: 1, marginBottom: '1rem' }}>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>{t.name}</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                        <span className="badge badge-secondary" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {t.type === 'email' ? Icons.email : Icons.sms} {t.type.toUpperCase()}
                        </span>
                        {t.subject && <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>{t.subject}</span>}
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.content}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => openTemplateModal(t)} className="btn btn-sm btn-outline" style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: '4px' }}>
                        {Icons.edit} Edit
                      </button>
                      <button onClick={() => handleDeleteTemplate(t.id, t.name)} className="btn btn-sm btn-outline text-error" style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: '4px' }}>
                        {Icons.trash} Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Gateway Modal */}
      <Modal isOpen={isGatewayModalOpen} onClose={() => setIsGatewayModalOpen(false)} title={editingGateway ? 'Edit Gateway' : 'Add Gateway'}>
        <form onSubmit={handleSaveGateway} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="form-label">Provider</label>
            <select name="provider" value={gatewayForm.provider} onChange={(e) => setGatewayForm(p => ({ ...p, provider: e.target.value }))} className="input" required>
              <option value="arkesel">Arkesel</option>
              <option value="twilio">Twilio</option>
              <option value="sendgrid">SendGrid</option>
              <option value="smtp">Custom SMTP</option>
              <option value="mnotify">mNotify</option>
              <option value="hubtel">Hubtel</option>
            </select>
          </div>
          <div>
            <label className="form-label">Type</label>
            <select name="type" value={gatewayForm.type} onChange={(e) => setGatewayForm(p => ({ ...p, type: e.target.value }))} className="input" required>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div>
            <label className="form-label">Display Name</label>
            <input type="text" value={gatewayForm.display_name} onChange={(e) => setGatewayForm(p => ({ ...p, display_name: e.target.value }))} className="input" required placeholder="e.g. My Arkesel SMS" />
          </div>
          <div>
            <label className="form-label">Sender ID / From Email</label>
            <input type="text" value={gatewayForm.sender_id} onChange={(e) => setGatewayForm(p => ({ ...p, sender_id: e.target.value }))} className="input" placeholder="e.g. MYSTORE" />
          </div>
          <div>
            <label className="form-label">API Key</label>
            <input type="password" value={gatewayForm.api_key} onChange={(e) => setGatewayForm(p => ({ ...p, api_key: e.target.value }))} className="input" placeholder={editingGateway && gatewayForm.api_key?.includes('••') ? '••••••••' : 'Enter API Key'} />
          </div>
          <div>
            <label className="form-label">Secret Key (Optional)</label>
            <input type="password" value={gatewayForm.secret_key} onChange={(e) => setGatewayForm(p => ({ ...p, secret_key: e.target.value }))} className="input" placeholder={editingGateway && gatewayForm.secret_key?.includes('••') ? '••••••••' : 'Enter Secret Key if needed'} />
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={gatewayForm.is_active} onChange={(e) => setGatewayForm(p => ({ ...p, is_active: e.target.checked }))} />
              Is Active
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={gatewayForm.is_default} onChange={(e) => setGatewayForm(p => ({ ...p, is_default: e.target.checked }))} />
              Set as Default for {gatewayForm.type.toUpperCase()}
            </label>
          </div>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setIsGatewayModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Gateway</button>
          </div>
        </form>
      </Modal>

      {/* Template Modal */}
      <Modal isOpen={isTemplateModalOpen} onClose={() => setIsTemplateModalOpen(false)} title={editingTemplate ? 'Edit Template' : 'New Template'}>
        <form onSubmit={handleSaveTemplate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="form-label">Template Name</label>
            <input type="text" value={templateForm.name} onChange={(e) => setTemplateForm(p => ({ ...p, name: e.target.value }))} className="input" required placeholder="e.g. Welcome Message" />
          </div>
          <div>
            <label className="form-label">Type</label>
            <select value={templateForm.type} onChange={(e) => setTemplateForm(p => ({ ...p, type: e.target.value }))} className="input" required>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="both">Both</option>
            </select>
          </div>
          {(templateForm.type === 'email' || templateForm.type === 'both') && (
            <div>
              <label className="form-label">Subject</label>
              <input type="text" value={templateForm.subject} onChange={(e) => setTemplateForm(p => ({ ...p, subject: e.target.value }))} className="input" required placeholder="Email Subject" />
            </div>
          )}
          <div>
            <label className="form-label">Content</label>
            <textarea value={templateForm.content} onChange={(e) => setTemplateForm(p => ({ ...p, content: e.target.value }))} className="input" required rows={6} placeholder="Template body..." style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setIsTemplateModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Template</button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
