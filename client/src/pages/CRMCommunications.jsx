import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import Modal from '../components/Modal';

// High-quality modern SVG icons
const Icons = {
  email: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7.00005L10.2 11.65C11.2667 12.45 12.7333 12.45 13.8 11.65L20 7"/><rect x="3" y="5" width="18" height="14" rx="2"/></svg>,
  sms: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  settings: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  plus: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  edit: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>,
  send: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  rocket: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>,
  template: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
};

export default function CRMCommunications() {
  const showToast = useToast();
  const confirm = useConfirm();

  const [activeTab, setActiveTab] = useState('campaign'); // 'campaign', 'templates', 'gateways'
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
        api.get('/customers').catch(() => []) 
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
      showToast(`Campaign sent! SMS: ${res.smsResults?.success ? 'Sent' : 'Skipped'}, Email: ${res.emailResults?.success ? 'Sent' : 'Skipped'}`, 'success');
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
        showToast('Template updated', 'success');
      } else {
        await api.post('/crm-communications/templates', templateForm);
        showToast('Template created', 'success');
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
        showToast('Gateway updated', 'success');
      } else {
        await api.post('/crm-communications/gateways', gatewayForm);
        showToast('Gateway added', 'success');
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
      <div className="flex-center" style={{ minHeight: '60vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="crm-comms-container">
      <style dangerouslySetInnerHTML={{__html: `
        .crm-comms-container {
          animation: fadeIn 0.4s ease-out;
          max-width: 1200px;
          margin: 0 auto;
        }
        .premium-header {
          background: linear-gradient(135deg, var(--color-primary), var(--color-accent-primary));
          border-radius: var(--radius-xl);
          padding: 2.5rem;
          color: white;
          margin-bottom: 2rem;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          position: relative;
          overflow: hidden;
        }
        .premium-header::after {
          content: '';
          position: absolute;
          top: -50%;
          right: -10%;
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 70%);
          border-radius: 50%;
          pointer-events: none;
        }
        .premium-header h1 {
          font-size: 2.5rem;
          font-weight: 800;
          margin-bottom: 0.5rem;
          letter-spacing: -0.02em;
          color: white;
        }
        .premium-header p {
          font-size: 1.1rem;
          opacity: 0.9;
          max-width: 600px;
          color: rgba(255,255,255,0.9);
        }
        
        .modern-tabs {
          display: flex;
          gap: 1rem;
          margin-bottom: 2.5rem;
          padding: 0.5rem;
          background: var(--color-bg-secondary);
          border-radius: 16px;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
          width: max-content;
        }
        .modern-tab {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          border-radius: 12px;
          font-weight: 600;
          font-size: 1rem;
          color: var(--color-text-secondary);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          border: none;
          background: transparent;
        }
        .modern-tab:hover {
          color: var(--color-text-primary);
          background: rgba(0,0,0,0.03);
        }
        .modern-tab.active {
          background: var(--color-bg-primary);
          color: var(--color-primary);
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          transform: translateY(-1px);
        }

        .premium-card {
          background: var(--color-bg-primary);
          border-radius: var(--radius-xl);
          padding: 2.5rem;
          box-shadow: 0 8px 24px rgba(0,0,0,0.04);
          border: 1px solid var(--color-border);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .premium-card:hover {
          box-shadow: 0 12px 32px rgba(0,0,0,0.08);
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }
        .full-width { grid-column: 1 / -1; }
        
        .sleek-input {
          width: 100%;
          padding: 1rem 1.25rem;
          border-radius: 12px;
          border: 1px solid var(--color-border);
          background: var(--color-bg-secondary);
          font-size: 1rem;
          transition: all 0.2s ease;
          color: var(--color-text-primary);
        }
        .sleek-input:focus {
          outline: none;
          border-color: var(--color-primary);
          background: var(--color-bg-primary);
          box-shadow: 0 0 0 4px rgba(var(--color-primary-rgb), 0.1);
        }
        
        .sleek-label {
          display: block;
          font-weight: 600;
          margin-bottom: 0.5rem;
          color: var(--color-text-primary);
          font-size: 0.95rem;
        }

        .btn-gradient {
          background: linear-gradient(135deg, var(--color-primary), var(--color-accent-primary));
          color: white;
          border: none;
          padding: 1rem 2rem;
          border-radius: 12px;
          font-weight: 700;
          font-size: 1.05rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(var(--color-primary-rgb), 0.3);
        }
        .btn-gradient:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(var(--color-primary-rgb), 0.4);
        }
        .btn-gradient:active {
          transform: translateY(0);
        }

        .template-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 1.5rem;
        }
        .template-card {
          background: var(--color-bg-primary);
          border: 1px solid var(--color-border);
          border-radius: 16px;
          padding: 1.5rem;
          position: relative;
          transition: all 0.3s ease;
          display: flex;
          flex-direction: column;
        }
        .template-card:hover {
          border-color: var(--color-primary);
          box-shadow: 0 8px 24px rgba(0,0,0,0.06);
          transform: translateY(-4px);
        }
        .template-type-badge {
          position: absolute;
          top: 1.5rem;
          right: 1.5rem;
          display: flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.35rem 0.75rem;
          background: var(--color-bg-secondary);
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--color-text-secondary);
          text-transform: uppercase;
        }

        .gateway-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .gateway-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.5rem;
          background: var(--color-bg-primary);
          border: 1px solid var(--color-border);
          border-radius: 16px;
          transition: all 0.2s ease;
        }
        .gateway-row:hover {
          background: var(--color-bg-secondary);
        }
        .gateway-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: linear-gradient(135deg, var(--color-primary), var(--color-accent-primary));
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          font-weight: bold;
        }
        
        .glass-modal {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(20px);
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.5);
          box-shadow: 0 24px 48px rgba(0,0,0,0.1);
        }
      `}} />

      <div className="premium-header">
        <h1>Marketing & Comms</h1>
        <p>Engage your customers with beautifully crafted, targeted campaigns via Email and SMS directly from your dashboard.</p>
      </div>

      <div className="modern-tabs">
        <button className={`modern-tab ${activeTab === 'campaign' ? 'active' : ''}`} onClick={() => setActiveTab('campaign')}>
          {Icons.rocket} Send Campaign
        </button>
        <button className={`modern-tab ${activeTab === 'templates' ? 'active' : ''}`} onClick={() => setActiveTab('templates')}>
          {Icons.template} Templates
        </button>
        <button className={`modern-tab ${activeTab === 'gateways' ? 'active' : ''}`} onClick={() => setActiveTab('gateways')}>
          {Icons.settings} Gateways
        </button>
      </div>

      {/* --- CAMPAIGN TAB --- */}
      {activeTab === 'campaign' && (
        <div className="premium-card">
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '2rem' }}>Craft Your Message</h2>
          <form onSubmit={handleSendCampaign} className="form-grid">
            
            <div className="full-width" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div>
                <label className="sleek-label">Target Audience</label>
                <select name="targetAudience" value={campaignForm.targetAudience} onChange={handleCampaignChange} className="sleek-input" required>
                  <option value="all_customers">All Customers</option>
                  <option value="recent_buyers">Recent Buyers (Last 30 Days)</option>
                  <option value="specific_customer">Specific Customer</option>
                </select>
              </div>

              {campaignForm.targetAudience === 'specific_customer' ? (
                <div>
                  <label className="sleek-label">Select Customer</label>
                  <select name="customerId" value={campaignForm.customerId} onChange={handleCampaignChange} className="sleek-input" required>
                    <option value="">-- Choose Customer --</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone || c.email})</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="sleek-label">Channel</label>
                  <select name="type" value={campaignForm.type} onChange={handleCampaignChange} className="sleek-input" required>
                    <option value="both">Both (Email & SMS)</option>
                    <option value="email">Email Only</option>
                    <option value="sms">SMS Only</option>
                  </select>
                </div>
              )}
            </div>

            {campaignForm.targetAudience === 'specific_customer' && (
              <div className="full-width">
                <label className="sleek-label">Channel</label>
                <select name="type" value={campaignForm.type} onChange={handleCampaignChange} className="sleek-input" required>
                  <option value="both">Both (Email & SMS)</option>
                  <option value="email">Email Only</option>
                  <option value="sms">SMS Only</option>
                </select>
              </div>
            )}

            <div className="full-width" style={{ padding: '1.5rem', background: 'var(--color-bg-secondary)', borderRadius: '16px' }}>
              <label className="sleek-label">Use a Template (Optional)</label>
              <select 
                name="templateId"
                value={campaignForm.templateId}
                onChange={(e) => {
                  const tmpl = templates.find(t => t.id === e.target.value);
                  if (tmpl) setCampaignForm(prev => ({ ...prev, templateId: tmpl.id, subject: tmpl.subject || '', message: tmpl.content }));
                  else setCampaignForm(prev => ({ ...prev, templateId: '' }));
                }}
                className="sleek-input"
                style={{ background: 'var(--color-bg-primary)' }}
              >
                <option value="">-- Start Blank --</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.type.toUpperCase()})</option>)}
              </select>
            </div>

            {(campaignForm.type === 'email' || campaignForm.type === 'both') && (
              <div className="full-width">
                <label className="sleek-label">Email Subject</label>
                <input type="text" name="subject" value={campaignForm.subject} onChange={handleCampaignChange} className="sleek-input" required={campaignForm.type === 'email' || campaignForm.type === 'both'} placeholder="Exciting news from our store!" />
              </div>
            )}

            <div className="full-width">
              <label className="sleek-label">Message Content</label>
              <textarea 
                name="message"
                value={campaignForm.message}
                onChange={handleCampaignChange}
                className="sleek-input"
                style={{ minHeight: '180px', resize: 'vertical', lineHeight: '1.6' }}
                required
                placeholder="Type your message here..."
              />
              {(campaignForm.type === 'sms' || campaignForm.type === 'both') && (
                <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {Icons.sms} SMS Length: <strong style={{ color: 'var(--color-text-primary)' }}>{campaignForm.message.length}</strong> chars 
                  ({Math.ceil(campaignForm.message.length / 160) || 1} standard message(s))
                </div>
              )}
            </div>

            <div className="full-width" style={{ marginTop: '1rem' }}>
              <button type="submit" className="btn-gradient" style={{ width: '100%' }}>
                {Icons.send} Dispatch Campaign
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --- TEMPLATES TAB --- */}
      {activeTab === 'templates' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Saved Templates</h2>
            <button className="btn-gradient" style={{ padding: '0.75rem 1.5rem', borderRadius: '100px' }} onClick={() => openTemplateModal()}>
              {Icons.plus} New Template
            </button>
          </div>

          {templates.length === 0 ? (
            <div className="premium-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <div style={{ color: 'var(--color-text-tertiary)', marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>No Templates Yet</h3>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem', maxWidth: '400px', margin: '0 auto 2rem' }}>
                Create reusable templates for your most common messages to save time and maintain consistency.
              </p>
              <button className="btn-gradient" style={{ margin: '0 auto' }} onClick={() => openTemplateModal()}>
                Create First Template
              </button>
            </div>
          ) : (
            <div className="template-grid">
              {templates.map(t => (
                <div key={t.id} className="template-card">
                  <div className="template-type-badge">
                    {t.type === 'email' ? Icons.email : Icons.sms} {t.type}
                  </div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', paddingRight: '4rem' }}>{t.name}</h3>
                  {t.subject && (
                    <div style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '1rem', fontWeight: 500 }}>
                      Subject: {t.subject}
                    </div>
                  )}
                  <p style={{ fontSize: '0.95rem', color: 'var(--color-text-secondary)', lineHeight: '1.6', flex: 1, marginBottom: '2rem', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {t.content}
                  </p>
                  <div style={{ display: 'flex', gap: '0.75rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.5rem' }}>
                    <button onClick={() => openTemplateModal(t)} className="btn btn-outline" style={{ flex: 1, borderRadius: '8px' }}>
                      {Icons.edit} Edit
                    </button>
                    <button onClick={() => handleDeleteTemplate(t.id, t.name)} className="btn btn-outline" style={{ flex: 1, borderRadius: '8px', color: 'var(--color-error)', borderColor: 'rgba(var(--color-error-rgb), 0.2)' }}>
                      {Icons.trash} Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- GATEWAYS TAB --- */}
      {activeTab === 'gateways' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>Custom Gateways</h2>
              <p style={{ color: 'var(--color-text-secondary)' }}>Configure your own providers. If none are active, we'll use the platform defaults.</p>
            </div>
            <button className="btn-gradient" style={{ padding: '0.75rem 1.5rem', borderRadius: '100px' }} onClick={() => openGatewayModal()}>
              {Icons.plus} Add Provider
            </button>
          </div>

          <div className="gateway-list">
            {gateways.length === 0 ? (
              <div className="premium-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.1rem' }}>You are currently using the beautifully tuned platform default gateways.</p>
              </div>
            ) : (
              gateways.map(gw => (
                <div key={gw.id} className="gateway-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div className="gateway-icon">
                      {gw.provider.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>{gw.display_name}</h3>
                        {gw.is_default && <span style={{ background: 'var(--color-success)', color: 'white', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>DEFAULT {gw.type.toUpperCase()}</span>}
                        <span style={{ fontSize: '0.8rem', color: gw.is_active ? 'var(--color-success)' : 'var(--color-text-tertiary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'currentColor' }} /> {gw.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                        Provider: <strong>{gw.provider.toUpperCase()}</strong> &nbsp;|&nbsp; 
                        Type: <strong>{gw.type.toUpperCase()}</strong>
                        {gw.sender_id && <>&nbsp;|&nbsp; Sender ID: <strong>{gw.sender_id}</strong></>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-outline" style={{ borderRadius: '8px', width: '40px', height: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => openGatewayModal(gw)}>
                      {Icons.edit}
                    </button>
                    <button className="btn btn-outline" style={{ borderRadius: '8px', width: '40px', height: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-error)', borderColor: 'rgba(var(--color-error-rgb), 0.2)' }} onClick={() => handleDeleteGateway(gw.id)}>
                      {Icons.trash}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* --- MODALS --- */}
      <Modal isOpen={isGatewayModalOpen} onClose={() => setIsGatewayModalOpen(false)} title={editingGateway ? 'Edit Gateway' : 'Add Gateway'} className="glass-modal">
        <form onSubmit={handleSaveGateway} className="form-grid" style={{ padding: '1rem 0' }}>
          <div>
            <label className="sleek-label">Provider</label>
            <select name="provider" value={gatewayForm.provider} onChange={(e) => setGatewayForm(p => ({ ...p, provider: e.target.value }))} className="sleek-input" required>
              <option value="arkesel">Arkesel</option>
              <option value="twilio">Twilio</option>
              <option value="sendgrid">SendGrid</option>
              <option value="smtp">Custom SMTP</option>
              <option value="mnotify">mNotify</option>
              <option value="hubtel">Hubtel</option>
            </select>
          </div>
          <div>
            <label className="sleek-label">Type</label>
            <select name="type" value={gatewayForm.type} onChange={(e) => setGatewayForm(p => ({ ...p, type: e.target.value }))} className="sleek-input" required>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div className="full-width">
            <label className="sleek-label">Display Name</label>
            <input type="text" value={gatewayForm.display_name} onChange={(e) => setGatewayForm(p => ({ ...p, display_name: e.target.value }))} className="sleek-input" required placeholder="e.g. My Arkesel SMS" />
          </div>
          <div className="full-width">
            <label className="sleek-label">Sender ID / From Email</label>
            <input type="text" value={gatewayForm.sender_id} onChange={(e) => setGatewayForm(p => ({ ...p, sender_id: e.target.value }))} className="sleek-input" placeholder="e.g. MYSTORE" />
          </div>
          <div className="full-width">
            <label className="sleek-label">API Key</label>
            <input type="password" value={gatewayForm.api_key} onChange={(e) => setGatewayForm(p => ({ ...p, api_key: e.target.value }))} className="sleek-input" placeholder={editingGateway && gatewayForm.api_key?.includes('••') ? '••••••••' : 'Enter API Key'} />
          </div>
          <div className="full-width">
            <label className="sleek-label">Secret Key (Optional)</label>
            <input type="password" value={gatewayForm.secret_key} onChange={(e) => setGatewayForm(p => ({ ...p, secret_key: e.target.value }))} className="sleek-input" placeholder={editingGateway && gatewayForm.secret_key?.includes('••') ? '••••••••' : 'Enter Secret Key if needed'} />
          </div>
          
          <div className="full-width" style={{ display: 'flex', gap: '2rem', padding: '1rem', background: 'var(--color-bg-secondary)', borderRadius: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
              <input type="checkbox" checked={gatewayForm.is_active} onChange={(e) => setGatewayForm(p => ({ ...p, is_active: e.target.checked }))} style={{ width: '20px', height: '20px' }} />
              Is Active
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
              <input type="checkbox" checked={gatewayForm.is_default} onChange={(e) => setGatewayForm(p => ({ ...p, is_default: e.target.checked }))} style={{ width: '20px', height: '20px' }} />
              Set as Default
            </label>
          </div>

          <div className="full-width" style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" className="btn btn-outline" style={{ borderRadius: '12px', padding: '0.75rem 1.5rem' }} onClick={() => setIsGatewayModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-gradient" style={{ borderRadius: '12px', padding: '0.75rem 1.5rem' }}>Save Gateway</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isTemplateModalOpen} onClose={() => setIsTemplateModalOpen(false)} title={editingTemplate ? 'Edit Template' : 'New Template'} className="glass-modal">
        <form onSubmit={handleSaveTemplate} className="form-grid" style={{ padding: '1rem 0' }}>
          <div className="full-width">
            <label className="sleek-label">Template Name</label>
            <input type="text" value={templateForm.name} onChange={(e) => setTemplateForm(p => ({ ...p, name: e.target.value }))} className="sleek-input" required placeholder="e.g. Welcome Message" />
          </div>
          <div className="full-width">
            <label className="sleek-label">Type</label>
            <select value={templateForm.type} onChange={(e) => setTemplateForm(p => ({ ...p, type: e.target.value }))} className="sleek-input" required>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="both">Both</option>
            </select>
          </div>
          {(templateForm.type === 'email' || templateForm.type === 'both') && (
            <div className="full-width">
              <label className="sleek-label">Subject</label>
              <input type="text" value={templateForm.subject} onChange={(e) => setTemplateForm(p => ({ ...p, subject: e.target.value }))} className="sleek-input" required placeholder="Email Subject" />
            </div>
          )}
          <div className="full-width">
            <label className="sleek-label">Content</label>
            <textarea value={templateForm.content} onChange={(e) => setTemplateForm(p => ({ ...p, content: e.target.value }))} className="sleek-input" required rows={6} placeholder="Type your template body here..." style={{ resize: 'vertical' }} />
          </div>
          <div className="full-width" style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" className="btn btn-outline" style={{ borderRadius: '12px', padding: '0.75rem 1.5rem' }} onClick={() => setIsTemplateModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-gradient" style={{ borderRadius: '12px', padding: '0.75rem 1.5rem' }}>Save Template</button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
