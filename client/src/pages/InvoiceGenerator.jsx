import { useState, useRef } from 'react';
import { useAuthContext } from '../lib/AuthContext';

export default function InvoiceGenerator() {
  const { user } = useAuthContext();
  
  // Default agency details from the business context
  const agencyName = user?.user_metadata?.business_name || 'Quadem Digital Enterprise';
  
  const [invoiceId, setInvoiceId] = useState(`INV-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  
  const [clientName, setClientName] = useState('Acme Corporation');
  const [clientEmail, setClientEmail] = useState('client@example.com');
  const [clientAddress, setClientAddress] = useState('123 Client St\nCity, Country');
  
  const [items, setItems] = useState([
    { id: 1, description: 'Service / Product Description', rate: 100, quantity: 1 }
  ]);
  
  const [taxRate, setTaxRate] = useState(5);

  const addItem = () => {
    setItems([...items, { id: Date.now(), description: '', rate: 0, quantity: 1 }]);
  };

  const updateItem = (id, field, value) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const removeItem = (id) => {
    setItems(items.filter(item => item.id !== id));
  };

  const subtotal = items.reduce((sum, item) => sum + (item.rate * item.quantity), 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(amount || 0);
  };

  return (
    <div className="invoice-generator-page" style={{ padding: '0 1rem 2rem' }}>
      <header className="page-header no-print" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="dashboard-title">Invoice Generator</h1>
          <p className="dashboard-subtitle">Create and print beautiful invoices for your clients.</p>
        </div>
        <div>
          <button className="btn btn-primary" onClick={() => window.print()}>
            Print / Save PDF
          </button>
        </div>
      </header>

      <div className="invoice-layout" style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '2rem' }}>
        
        {/* Editor Sidebar (Hidden when printing) */}
        <div className="glass-panel no-print" style={{ padding: '1.5rem', height: 'fit-content' }}>
          <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>Invoice Details</h3>
          
          <div className="form-group">
            <label>Invoice Number</label>
            <input type="text" value={invoiceId} onChange={e => setInvoiceId(e.target.value)} />
          </div>
          <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label>Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>

          <h3 style={{ margin: '1.5rem 0 1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>Client Details</h3>
          <div className="form-group">
            <label>Client Name</label>
            <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Client Email</label>
            <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Address</label>
            <textarea rows="2" value={clientAddress} onChange={e => setClientAddress(e.target.value)} />
          </div>

          <h3 style={{ margin: '1.5rem 0 1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>Line Items</h3>
          {items.map((item, index) => (
            <div key={item.id} style={{ background: 'var(--color-bg-tertiary)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', position: 'relative' }}>
              <button 
                className="btn-icon text-error" 
                style={{ position: 'absolute', top: '8px', right: '8px', width: '24px', height: '24px' }}
                onClick={() => removeItem(item.id)}
              >
                &times;
              </button>
              <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                <input type="text" placeholder="Description" value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                  <input type="number" placeholder="Rate" value={item.rate} onChange={e => updateItem(item.id, 'rate', Number(e.target.value))} />
                </div>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <input type="number" placeholder="Qty" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', Number(e.target.value))} />
                </div>
              </div>
            </div>
          ))}
          <button className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={addItem}>+ Add Item</button>

          <h3 style={{ margin: '1.5rem 0 1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>Settings</h3>
          <div className="form-group">
            <label>Tax Rate (%)</label>
            <input type="number" value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} />
          </div>
        </div>

        {/* Invoice Preview */}
        <div className="invoice-preview" style={{ 
          background: 'var(--color-bg-secondary)', 
          border: '1px solid var(--color-border)', 
          borderRadius: '16px', 
          padding: '3rem',
          color: 'var(--color-text-primary)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '2rem', marginBottom: '2rem' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '2rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                {agencyName.toUpperCase()}
              </h1>
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', marginTop: '4px' }}>Invoice Receipt</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--color-text-muted)' }}>INVOICE</h2>
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Invoice No:</span>
                  <span style={{ fontWeight: 600, minWidth: '100px' }}>{invoiceId}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Date:</span>
                  <span style={{ fontWeight: 600, minWidth: '100px' }}>{date}</span>
                </div>
                {dueDate && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Due Date:</span>
                    <span style={{ fontWeight: 600, minWidth: '100px' }}>{dueDate}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3rem' }}>
            <div>
              <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>Billed To:</h3>
              <p style={{ margin: '0 0 0.25rem 0', fontWeight: 700, fontSize: '1.1rem' }}>{clientName}</p>
              <p style={{ margin: '0 0 0.25rem 0', color: 'var(--color-text-secondary)', whiteSpace: 'pre-line' }}>{clientAddress}</p>
              <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>{clientEmail}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>From:</h3>
              <p style={{ margin: '0 0 0.25rem 0', fontWeight: 700, fontSize: '1.1rem' }}>{agencyName}</p>
              <p style={{ margin: '0 0 0.25rem 0', color: 'var(--color-text-secondary)' }}>{user?.email}</p>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '3rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                <th style={{ padding: '1rem 0', color: 'var(--color-text-secondary)' }}>Description</th>
                <th style={{ padding: '1rem 0', textAlign: 'right', color: 'var(--color-text-secondary)' }}>Rate</th>
                <th style={{ padding: '1rem 0', textAlign: 'right', color: 'var(--color-text-secondary)' }}>Qty</th>
                <th style={{ padding: '1rem 0', textAlign: 'right', color: 'var(--color-text-secondary)' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '1.5rem 0', fontWeight: 500 }}>{item.description || '-'}</td>
                  <td style={{ padding: '1.5rem 0', textAlign: 'right', color: 'var(--color-text-secondary)' }}>{formatCurrency(item.rate)}</td>
                  <td style={{ padding: '1.5rem 0', textAlign: 'right', color: 'var(--color-text-secondary)' }}>{item.quantity}</td>
                  <td style={{ padding: '1.5rem 0', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(item.rate * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '3rem' }}>
            <div style={{ width: '300px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Subtotal</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Tax ({taxRate}%)</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(taxAmount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5rem 0', fontSize: '1.25rem' }}>
                <span style={{ fontWeight: 700 }}>Total</span>
                <span style={{ fontWeight: 800, color: 'var(--color-primary)' }}>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center', borderTop: '1px solid var(--color-border)', paddingTop: '2rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            <p>Thank you for your business!</p>
          </div>
        </div>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * {
            visibility: hidden;
          }
          .invoice-preview, .invoice-preview * {
            visibility: visible;
          }
          .invoice-preview {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            border: none !important;
            padding: 0 !important;
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
          .invoice-layout {
            display: block !important;
          }
        }
        @media (max-width: 1024px) {
          .invoice-layout {
            grid-template-columns: 1fr !important;
          }
        }
      `}} />
    </div>
  );
}
