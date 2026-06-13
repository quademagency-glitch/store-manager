import { usePlatformAdmin } from '../PlatformAdminContext';
import { Icons } from '../Icons';

export default function CommunicationsTab() {
  const { 
    templates, openTemplateModal, handleDeleteTemplate,
    campaignForm, setCampaignForm, handleSendCampaign,
    activeBusinesses
  } = usePlatformAdmin();

  const handleCampaignChange = (e) => {
    const { name, value } = e.target;
    setCampaignForm(prev => ({ ...prev, [name]: value }));
  };

  return (
    <>
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Marketing & Communications</h1>
          <p className="dashboard-subtitle">Manage templates and send direct messages to businesses.</p>
        </div>
      </header>

      <div className="comms-dashboard-grid">
        
        {/* Left Column: Campaigns */}
        <div className="premium-card interactive">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', fontWeight: 600 }}>Send Campaign</h2>
          <form onSubmit={handleSendCampaign} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>Target Audience</label>
              <select 
                name="targetAudience"
                value={campaignForm.targetAudience}
                onChange={handleCampaignChange}
                className="form-input"
                style={{ width: '100%' }}
                required
              >
                <option value="specific_business">Specific Business</option>
                <option value="all_businesses">All Active Businesses</option>
              </select>
            </div>

            {campaignForm.targetAudience === 'specific_business' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>Select Business</label>
                <select 
                  name="businessId"
                  value={campaignForm.businessId}
                  onChange={handleCampaignChange}
                  className="form-input"
                  style={{ width: '100%' }}
                  required={campaignForm.targetAudience === 'specific_business'}
                >
                  <option value="">-- Choose Business --</option>
                  {activeBusinesses.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>Channel</label>
              <select 
                name="type"
                value={campaignForm.type}
                onChange={handleCampaignChange}
                className="form-input"
                style={{ width: '100%' }}
                required
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="both">Both (Email & SMS)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>Template (Optional)</label>
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
                className="form-input"
                style={{ width: '100%' }}
              >
                <option value="">-- Start Blank --</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                ))}
              </select>
            </div>

            {(campaignForm.type === 'email' || campaignForm.type === 'both') && (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>Subject</label>
                <input 
                  type="text"
                  name="subject"
                  value={campaignForm.subject}
                  onChange={handleCampaignChange}
                  className="form-input"
                  style={{ width: '100%' }}
                  required={campaignForm.type === 'email' || campaignForm.type === 'both'}
                  placeholder="Email Subject"
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>Message Content</label>
              <textarea 
                name="message"
                value={campaignForm.message}
                onChange={handleCampaignChange}
                className="form-input"
                style={{ width: '100%', minHeight: '150px' }}
                required
                placeholder={campaignForm.type === 'email' ? 'HTML or text content...' : 'Text message...'}
              />
              {(campaignForm.type === 'sms' || campaignForm.type === 'both') && (
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>
                  SMS Length: {campaignForm.message.length} characters ({(Math.ceil(campaignForm.message.length / 160)) || 1} message(s) per recipient).
                </p>
            <button type="submit" className="premium-gradient-btn" style={{ marginTop: '0.5rem' }}>
              {Icons.send} Review & Send Campaign
            </button>
          </form>
        </div>

        {/* Right Column: Templates */}
        <div className="premium-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Saved Templates</h2>
            <button className="btn btn-secondary btn-sm" onClick={() => openTemplateModal()}>+ New Template</button>
          </div>

          {templates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-border)' }}>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>No templates saved yet.</p>
              <button className="btn btn-primary btn-sm" onClick={() => openTemplateModal()}>Create your first template</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {templates.map(t => (
                <div key={t.id} className="template-item-card">
                  <div style={{ flex: 1, marginRight: '1rem' }}>
                    <h3 className="template-title">{t.name}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <span className={`template-badge ${t.type}`}>
                        {t.type === 'email' ? Icons.email : Icons.sms} {t.type}
                      </span>
                      {t.subject && <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>{t.subject}</span>}
                    </div>
                    <p className="template-excerpt">
                      {t.content}
                    </p>
                  </div>
                  <div className="template-actions">
                    <button onClick={() => openTemplateModal(t)} className="btn-icon-small edit" title="Edit Template">
                      {Icons.edit} Edit
                    </button>
                    <button onClick={() => handleDeleteTemplate(t.id, t.name)} className="btn-icon-small delete" title="Delete Template">
                      {Icons.trash} Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </>
  );
}
