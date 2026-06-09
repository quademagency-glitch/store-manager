import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthContext } from '../lib/AuthContext';

export default function InvoiceView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, role, businessId } = useAuthContext();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        // We'll get all invoices for the business and find the one that matches
        // Wait, we can't easily fetch a single invoice unless we add a route for it.
        // Let's just fetch all invoices for the user's business and find it.
        if (!user) {
          setLoading(false);
          return;
        }
        
        let invoicesUrl = role === 'Platform Admin'
          ? '/billing/invoices?limit=1000' 
          : `/billing/invoices/${businessId}`;
          
        const res = await api.get(invoicesUrl);
        const found = res.find(inv => inv.id === id);
        
        if (found) {
          try {
            // Fetch subscription for business details
            let subRes;
            try {
               subRes = await api.get(`/subscriptions/business/${found.business_id}`);
               setInvoice({
                 ...found,
                 business: subRes?.businesses || found.businesses || { name: 'Business Account', contact_email: user.email }
               });
            } catch (e) {
               setInvoice({
                 ...found,
                 business: found.businesses || { name: 'Business Account', contact_email: user.email }
               });
            }
          } catch (e) {
            setInvoice({
              ...found,
              business: found.businesses || { name: 'Business Account', contact_email: user.email }
            });
          }
        }
      } catch (err) {
        console.error("Failed to load invoice", err);
      } finally {
        setLoading(false);
      }
    };
    if (id && user?.id) {
      fetchInvoice();
    }
  }, [id, user?.id, role, businessId]);

  const formatCurrency = (amount, currency = 'GHS') => {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency }).format(amount || 0);
  };

  if (loading) {
    return <div className="p-xl text-center"><div className="spinner" style={{ margin: '2rem auto' }}></div>Loading invoice...</div>;
  }

  if (!invoice) {
    return (
      <div className="p-xl text-center">
        <h2>Invoice Not Found</h2>
        <button className="btn btn-primary" onClick={() => navigate('/business-admin/billing')}>Back to Billing</button>
      </div>
    );
  }

  return (
    <div className="invoice-generator-page" style={{ padding: '0 1rem 2rem' }}>
      <header className="page-header no-print" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="dashboard-title">Invoice Receipt</h1>
          <p className="dashboard-subtitle">Platform Subscription Billing</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/business-admin/billing')}>
            Back to Billing
          </button>
          <button className="btn btn-primary" onClick={() => window.print()}>
            Print / Save PDF
          </button>
        </div>
      </header>

      <div className="invoice-layout" style={{ display: 'flex', justifyContent: 'center' }}>
        
        {/* Invoice Preview */}
        <div className="invoice-preview" style={{ 
          background: 'var(--color-bg-secondary)', 
          border: '1px solid var(--color-border)', 
          borderRadius: '16px', 
          padding: '4rem',
          color: 'var(--color-text-primary)',
          maxWidth: '850px',
          width: '100%',
          boxShadow: 'var(--shadow-lg)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '2rem', marginBottom: '2rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <h1 className="page-title">
                {invoice.business?.name || 'Store Manager'}
              </h1>
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', marginTop: '4px' }}>Platform Subscription Receipt</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--color-text-muted)', letterSpacing: '2px' }}>INVOICE</h2>
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Invoice No:</span>
                  <span style={{ fontWeight: 600, minWidth: '100px', fontFamily: 'monospace' }}>{invoice.invoice_number}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Date:</span>
                  <span style={{ fontWeight: 600, minWidth: '100px' }}>{new Date(invoice.created_at).toLocaleDateString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Status:</span>
                  <span style={{ fontWeight: 600, minWidth: '100px', color: invoice.status === 'paid' ? '#10b981' : '#f59e0b', textTransform: 'uppercase' }}>
                    {invoice.status}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3rem' }}>
            <div>
              <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: '0.5rem', letterSpacing: '1px' }}>Billed To:</h3>
              <p style={{ margin: '0 0 0.25rem 0', fontWeight: 700, fontSize: '1.2rem' }}>{invoice.business?.name || 'Business Account'}</p>
              <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>{invoice.business?.contact_email || 'No email provided'}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: '0.5rem', letterSpacing: '1px' }}>From:</h3>
              <p style={{ margin: '0 0 0.25rem 0', fontWeight: 700, fontSize: '1.2rem' }}>Quadem Digital Enterprise</p>
              <p style={{ margin: '0 0 0.25rem 0', color: 'var(--color-text-secondary)' }}>billing@quadem.com</p>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '3rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                <th style={{ padding: '1rem 0', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '1px' }}>Description</th>
                <th style={{ padding: '1rem 0', textAlign: 'right', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '1px' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '2rem 0', fontWeight: 500, fontSize: '1.1rem' }}>
                  {invoice.description || 'Platform Subscription Payment'}
                  {invoice.payment_method && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '8px', fontWeight: 400 }}>
                      Paid via {invoice.payment_method.toUpperCase()}
                    </div>
                  )}
                </td>
                <td style={{ padding: '2rem 0', textAlign: 'right', fontWeight: 600, fontSize: '1.1rem' }}>
                  {formatCurrency(invoice.amount, invoice.currency)}
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '3rem' }}>
            <div style={{ width: '300px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5rem 0', fontSize: '1.25rem' }}>
                <span style={{ fontWeight: 700 }}>Total Paid</span>
                <span style={{ fontWeight: 800, color: 'var(--color-primary)' }}>{formatCurrency(invoice.amount, invoice.currency)}</span>
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center', borderTop: '1px solid var(--color-border)', paddingTop: '2rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            <p>Thank you for subscribing to Quadem ERP. We appreciate your business!</p>
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
            box-shadow: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}} />
    </div>
  );
}
