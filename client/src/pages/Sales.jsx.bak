import { useState, useMemo, useEffect } from 'react';
import { useAuthContext } from '../lib/AuthContext';
import { useProducts } from '../hooks/useProducts';
import { useCustomers } from '../hooks/useCustomers';
import Modal from '../components/Modal';
import SalesHistory from '../components/SalesHistory';
import QrScanner from '../components/QrScanner';
import { api } from '../lib/api';

import NewCustomerModal from '../features/sales/components/NewCustomerModal';
import VerifyModal from '../features/sales/components/VerifyModal';
import PaymentModal from '../features/sales/components/PaymentModal';
import ReceiptModal from '../features/sales/components/ReceiptModal';
import { addToOfflineQueue } from '../lib/idb';
import { useToast } from '../hooks/useToast';
import { usePrintDocument } from '../hooks/usePrintDocument';
import { useCurrency } from '../hooks/useCurrency';

export default function Sales() {
  const { user } = useAuthContext();
  const toast = useToast();
  const { business } = usePrintDocument();
  const { fmt } = useCurrency(business);
  const { products, loading: productsLoading } = useProducts();
  const { searchCustomers, createCustomer, sendVerificationCode, verifyCustomerCode, loading: customerLoading } = useCustomers();

  // Wizard state
  const [saleType, setSaleType] = useState(null); // 'new', 'batch', 'history'
  const [step, setStep] = useState(1); // 1 = Customer, 2 = Items/Checkout
  
  // Customer state
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({ name: '', phone: '' });

  // Verification state
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [customerToVerify, setCustomerToVerify] = useState(null);

  // Items State for the wizard
  // For 'new': array of 1 item. For 'batch': array of multiple items.
  // Each item: { id: uniqueId, product: {}, quantity: N, scanned_units: [unitId1, unitId2, ...], scanned_codes: [code1, code2, ...] }
  const [wizardItems, setWizardItems] = useState([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  
  // Batch quantity prompt
  const [showQuantityPrompt, setShowQuantityPrompt] = useState(false);
  const [selectedProductForBatch, setSelectedProductForBatch] = useState(null);
  const [batchQuantityInput, setBatchQuantityInput] = useState('1');

  // Scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [activeScanTarget, setActiveScanTarget] = useState(null); // { itemId, unitIndex }

  // Checkout state
  const [isProcessing, setIsProcessing] = useState(false);
  const [saleError, setSaleError] = useState('');
  
  // Two-Stage Checkout State
  const [pendingSale, setPendingSale] = useState(null); // Holds the sale object from Stage 1
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');

  // Receipt state
  const [receiptData, setReceiptData] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);

  // Debounce customer search
  useEffect(() => {
    if (customerSearchTerm.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const delay = setTimeout(async () => {
      setIsSearching(true);
      const results = await searchCustomers(customerSearchTerm);
      setSearchResults(results || []);
      setIsSearching(false);
    }, 400);
    return () => clearTimeout(delay);
  }, [customerSearchTerm, searchCustomers]);

  // Filter products by search
  const filteredProducts = useMemo(() => {
    if (!productSearchTerm) return products;
    const lower = productSearchTerm.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(lower) ||
      p.sku.toLowerCase().includes(lower) ||
      p.category.toLowerCase().includes(lower)
    );
  }, [products, productSearchTerm]);

  // Currency formatting handled by useCurrency hook above

  const totalAmount = wizardItems.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  // ─── Flow Navigation ───
  const startFlow = (type) => {
    setSaleType(type);
    if (type === 'history') return;
    setStep(1);
    setSelectedCustomer(null);
    setWizardItems([]);
    setAmountPaid('');
    setSaleError('');
  };

  const confirmCustomer = () => {
    if (!selectedCustomer) return;
    setStep(2);
  };

  const cancelFlow = () => {
    setSaleType(null);
    setStep(1);
    setWizardItems([]);
  };

  // ─── Customer Handling ───
  const handleCreateCustomer = async (data) => {
    const res = await createCustomer(data);
    if (res.success) {
      setSelectedCustomer(res.customer);
      setShowNewCustomerModal(false);
    } else {
      toast.error(res.error || 'Failed to create customer');
    }
  };

  const handleSendVerification = async (customer) => {
    const res = await sendVerificationCode(customer.id);
    if (res.success) {
      setCustomerToVerify(customer);
      setShowVerifyModal(true);
    } else {
      toast.error(res.error || 'Failed to send SMS');
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    const res = await verifyCustomerCode(customerToVerify.id, verifyCode);
    if (res.success) {
      setShowVerifyModal(false);
      setVerifyCode('');
      setCustomerToVerify(null);
      if (selectedCustomer?.id === customerToVerify.id) {
        setSelectedCustomer({ ...selectedCustomer, is_verified: true });
      }
    } else {
      toast.error(res.error || 'Invalid code');
    }
  };

  // ─── Item Selection ───
  const handleProductSelect = (product) => {
    const userLocationId = user?.user_metadata?.location_id;
    const localStock = userLocationId 
      ? (product.product_inventory?.find(inv => inv.location_id === userLocationId)?.quantity || 0)
      : (product.product_inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0);

    if (localStock <= 0) {
      toast.error('This product is out of stock.');
      return;
    }

    const isDoubleMode = business?.qr_tracking_mode === 'double';

    if (saleType === 'new') {
      if (wizardItems.length > 0) {
        toast.warning('New Sale only supports a single item. Use Batch Sale for multiple items.');
        return;
      }
      setWizardItems([{
        id: Date.now().toString(),
        product,
        quantity: 1,
        scans: isDoubleMode ? [{ pack_code: '', serial_number: '', item_code: '' }] : [{ item_code: '', unit_id: null }],
        stock: localStock
      }]);
      setShowProductModal(false);
    } else if (saleType === 'batch') {
      setSelectedProductForBatch({ product, stock: localStock });
      setBatchQuantityInput('1');
      setShowQuantityPrompt(true);
      setShowProductModal(false);
    }
  };

  const confirmBatchQuantity = () => {
    const qty = parseInt(batchQuantityInput, 10);
    if (isNaN(qty) || qty <= 0) {
      toast.warning('Please enter a valid quantity.');
      return;
    }
    if (qty > selectedProductForBatch.stock) {
      toast.warning(`Only ${selectedProductForBatch.stock} available in stock.`);
      return;
    }

    const isDoubleMode = business?.qr_tracking_mode === 'double';

    setWizardItems(prev => [...prev, {
      id: Date.now().toString(),
      product: selectedProductForBatch.product,
      quantity: qty,
      scans: isDoubleMode 
        ? Array.from({ length: qty }, () => ({ pack_code: '', serial_number: '', item_code: '' }))
        : Array.from({ length: qty }, () => ({ item_code: '', unit_id: null })),
      stock: selectedProductForBatch.stock
    }]);
    
    setShowQuantityPrompt(false);
    setSelectedProductForBatch(null);
  };

  // ─── Scanning Logic ───
  const openScanner = (itemId, unitIndex = 0) => {
    setActiveScanTarget({ itemId, unitIndex });
    setShowScanner(true);
  };

  const onScanComplete = async (decodedText) => {
    setShowScanner(false);
    if (!activeScanTarget) return;

    try {
      // Look up unit (Single mode UX enhancement)
      const unitRes = await api.get(`/units/lookup?qr=${encodeURIComponent(decodedText)}`);
      
      if (!unitRes || !unitRes.unit) {
        toast.error('QR code exists but is not assigned to any item.');
        return;
      }

      const unit = unitRes.unit;
      const { itemId, unitIndex } = activeScanTarget;
      
      setWizardItems(prev => prev.map(item => {
        if (item.id === itemId) {
          if (unit.product_id !== item.product.id) {
            toast.error(`Mismatched product! Scanned unit is ${unit.product.name}, but expected ${item.product.name}.`);
            return item;
          }
          
          // Check for duplicate scan within same item
          if (item.scans.some(s => s.unit_id === unit.id)) {
            toast.warning('This exact unit was already scanned for this item.');
            return item;
          }

          const newScans = [...item.scans];
          newScans[unitIndex] = { ...newScans[unitIndex], item_code: decodedText, unit_id: unit.id };

          return { ...item, scans: newScans };
        }
        return item;
      }));
    } catch (err) {
      toast.error(`Could not verify physical unit for QR: ${decodedText}. Make sure you scan a tracked inventory sticker.`);
    }
  };

  const removeWizardItem = (itemId) => {
    setWizardItems(prev => prev.filter(i => i.id !== itemId));
  };

  // ─── Checkout ───
  const isDoubleMode = business?.qr_tracking_mode === 'double';

  const isCheckoutReady = () => {
    if (wizardItems.length === 0) return false;
    
    // Ensure all required QR boxes are filled
    for (const item of wizardItems) {
      if (item.scans.length !== item.quantity) return false;
      if (isDoubleMode) {
        if (item.scans.some(s => !s.pack_code || !s.serial_number || !s.item_code)) return false;
      } else {
        if (item.scans.some(s => !s.item_code)) return false;
      }
    }
    return true;
  };

  const handleManualScanInput = (itemId, unitIndex, field, value) => {
    setWizardItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const newScans = [...item.scans];
        newScans[unitIndex] = { ...newScans[unitIndex], [field]: value };
        return { ...item, scans: newScans };
      }
      return item;
    }));
  };

  const handleHoldSale = async () => {
    if (!isCheckoutReady()) return;
    setSaleError('');
    setIsProcessing(true);

    try {
      const payload = {
        items: wizardItems.map(item => ({
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.product.price,
          scans: item.scans,
        })),
        payment_method: paymentMethod || 'cash', // Default fallback for stage 1
        total_amount: totalAmount,
        subtotal: totalAmount,
        tax: 0,
        discount: 0,
        customer_id: selectedCustomer.id,
      };

      const response = await api.post('/sales', payload);
      const saleData = response.sale || response;

      setPendingSale(saleData);
      setShowPaymentModal(true);
    } catch (err) {
      if (err.message === 'Failed to fetch' || !navigator.onLine) {
        // Offline: hold the sale locally and proceed to payment
        toast.warning('You are offline. Proceeding to payment locally. The transaction will be synced later.');
        setPendingSale({
          id: `offline-${Date.now()}`,
          total_amount: totalAmount,
          status: 'pending',
          _isOffline: true,
          _payload: payload
        });
        setShowPaymentModal(true);
      } else {
        setSaleError(err.message || 'Failed to hold sale');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelSale = async () => {
    if (!pendingSale) return;
    setIsProcessing(true);
    try {
      await api.post(`/sales/${pendingSale.id}/cancel`, {});
      setShowPaymentModal(false);
      setPendingSale(null);
      setSaleError('Transaction was cancelled. Items have been removed from your batch.');
      setWizardItems([]);
    } catch (err) {
      setSaleError(err.message || 'Failed to cancel sale');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinalizeSale = async () => {
    if (!amountPaid || isNaN(parseFloat(amountPaid))) {
       setSaleError('Please enter a valid amount paid.');
       return;
    }
    if (!pendingSale) return;
    setIsProcessing(true);
    try {
      const payload = { amount_paid: parseFloat(amountPaid) };
      
      let fullReceipt = null;

      if (pendingSale._isOffline) {
        // Offline transaction
        const offlineData = {
          stage1: pendingSale._payload,
          stage2: payload,
          paymentMethod
        };
        await addToOfflineQueue('/sales/offline-sync', 'POST', offlineData);
        
        fullReceipt = {
          ...pendingSale,
          payment_method: paymentMethod,
          total_amount: totalAmount,
          amount_paid: parseFloat(amountPaid),
          receipt_number: `OFFLINE-${pendingSale.id.split('-')[1]}`,
          sale_items: wizardItems.map(item => ({
            id: item.product.id,
            quantity: item.quantity,
            unit_price: item.product.price,
            product: { name: item.product.name, sku: item.product.sku },
          })),
        };
      } else {
        // Online transaction
        await api.post(`/sales/${pendingSale.id}/finalize`, payload);
        fullReceipt = {
          ...pendingSale,
          payment_method: paymentMethod,
          total_amount: totalAmount,
          amount_paid: parseFloat(amountPaid),
          sale_items: wizardItems.map(item => ({
            id: item.product.id,
            quantity: item.quantity,
            unit_price: item.product.price,
            product: { name: item.product.name, sku: item.product.sku },
          })),
        };
      }

      setReceiptData(fullReceipt);
      setShowPaymentModal(false);
      setShowReceipt(true);
      // Reset wizard
      setWizardItems([]);
      setAmountPaid('');
      setPendingSale(null);
    } catch (err) {
      setSaleError(err.message || 'Failed to finalize sale');
    } finally {
      setIsProcessing(false);
    }
  };

  const closeReceipt = () => {
    setShowReceipt(false);
    setReceiptData(null);
    setSaleType(null); // Return to landing
  };

  // ─── Render Landing ───
  if (saleType === null) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', paddingTop: '2rem' }}>
        <h1 className="dashboard-title" style={{ textAlign: 'center', marginBottom: '2rem' }}>Point of Sale</h1>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          
          <button 
            className="glass-panel" 
            style={{ padding: '3rem 2rem', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', border: '1px solid var(--color-border)' }}
            onClick={() => startFlow('new')}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
          >
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>New Sale</h2>
            <p style={{ color: 'var(--color-text-secondary)' }}>Quick transaction for a single item.</p>
          </button>

          <button 
            className="glass-panel" 
            style={{ padding: '3rem 2rem', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', border: '1px solid var(--color-border)' }}
            onClick={() => startFlow('batch')}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
          >
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>Batch Sale</h2>
            <p style={{ color: 'var(--color-text-secondary)' }}>Process multiple items and quantities.</p>
          </button>

        </div>
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <button className="btn btn-outline" onClick={() => startFlow('history')}>
            View Sales History
          </button>
        </div>
      </div>
    );
  }

  if (saleType === 'history') {
    return (
      <div>
        <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 className="dashboard-title">Sales History</h1>
            <p className="dashboard-subtitle">Review past transactions.</p>
          </div>
          <button className="btn btn-outline" onClick={() => setSaleType(null)}>Back to POS</button>
        </header>
        <SalesHistory />
      </div>
    );
  }

  // ─── Render Wizard ───
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '4rem' }}>
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="dashboard-title">{saleType === 'new' ? 'New Sale' : 'Batch Sale'}</h1>
          <p className="dashboard-subtitle">Step {step} of 2</p>
        </div>
        <button className="btn btn-outline text-error" onClick={cancelFlow}>Cancel Sale</button>
      </header>

      {/* ─── STEP 1: Customer Selection ─── */}
      {step === 1 && (
        <div className="glass-panel" style={{ padding: '32px', maxWidth: '600px', margin: '0 auto', borderTop: '4px solid var(--color-primary)' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Customer Identification</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: '8px' }}>Please search for an existing customer or create a new profile.</p>
          </div>
          
          <div style={{ position: 'relative', marginBottom: '24px' }}>
            <div style={{ position: 'absolute', top: '50%', left: '16px', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            <input
              type="text"
              className="input"
              placeholder={(user?.user_metadata?.role === 'Business Admin' || user?.user_metadata?.role === 'Platform Admin') ? "Search by name, phone, or ID..." : "Search by phone number..."}
              value={customerSearchTerm}
              onChange={(e) => setCustomerSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '16px 16px 16px 48px', fontSize: '1.1rem', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid var(--color-border)', transition: 'all 0.3s' }}
              onFocus={e => e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.2)'}
              onBlur={e => e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)'}
            />
          </div>
          
          <div style={{ minHeight: '150px' }}>
            {isSearching && (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-primary)' }}>
                <div className="loading-spinner" style={{ width: '24px', height: '24px', display: 'inline-block', marginBottom: '8px' }}></div>
                <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>Searching database...</div>
              </div>
            )}
            
            {!isSearching && searchResults.length > 0 && (
              <div style={{ 
                display: 'flex', flexDirection: 'column', gap: '8px',
                maxHeight: '300px', overflowY: 'auto', paddingRight: '4px'
              }}>
                {searchResults.map(c => (
                  <div 
                    key={c.id} 
                    className="glass-panel"
                    style={{ 
                      padding: '16px', 
                      cursor: 'pointer', 
                      border: '1px solid var(--color-border)',
                      borderRadius: '12px',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--color-primary)';
                      e.currentTarget.style.background = 'rgba(99, 102, 241, 0.05)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                      e.currentTarget.style.background = 'var(--color-bg-secondary)';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                    onClick={() => { setSelectedCustomer(c); setSearchResults([]); setCustomerSearchTerm(''); }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--color-bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)', fontWeight: 'bold' }}>
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--color-text-primary)' }}>{c.name}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{c.phone}</div>
                      </div>
                    </div>
                    {c.is_verified ? (
                       <span className="badge badge-success" style={{ padding: '4px 8px', fontSize: '0.75rem', borderRadius: '20px' }}>✓ Verified</span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            
            {!isSearching && customerSearchTerm.length >= 2 && searchResults.length === 0 && (
               <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: '12px', background: 'rgba(0,0,0,0.02)' }}>
                 <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ margin: '0 auto 16px auto', opacity: 0.5 }}>
                   <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                   <circle cx="9" cy="7" r="4"></circle>
                   <line x1="17" y1="8" x2="23" y2="14"></line>
                   <line x1="23" y1="8" x2="17" y2="14"></line>
                 </svg>
                 <p style={{ marginBottom: '16px', fontSize: '1.05rem' }}>No customer found matching your search.</p>
                 <button 
                   className="btn btn-primary" 
                   onClick={() => setShowNewCustomerModal(true)}
                 >
                   Create New Customer
                 </button>
               </div>
            )}

            {!isSearching && customerSearchTerm.length < 2 && !selectedCustomer && (
              <div style={{ textAlign: 'center', marginTop: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', margin: '24px 0' }}>
                  <div style={{ height: '1px', background: 'var(--color-border)', flex: 1 }}></div>
                  <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>OR</span>
                  <div style={{ height: '1px', background: 'var(--color-border)', flex: 1 }}></div>
                </div>
                <button 
                  className="btn btn-outline" 
                  style={{ width: '100%', padding: '16px', fontSize: '1.05rem', borderStyle: 'dashed', borderRadius: '12px' }}
                  onClick={() => setShowNewCustomerModal(true)}
                >
                  + Add New Customer Manually
                </button>
              </div>
            )}
          </div>

          {/* Selected Customer Preview */}
          {selectedCustomer && (
            <div style={{ 
              marginTop: '32px', 
              padding: '24px', 
              background: 'linear-gradient(145deg, rgba(99,102,241,0.05) 0%, rgba(139,92,246,0.05) 100%)', 
              border: '1px solid rgba(99,102,241,0.2)', 
              borderRadius: '16px', 
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{ position: 'absolute', top: '-20px', right: '-20px', opacity: 0.05, transform: 'scale(2)' }}>
                <svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '1.2rem', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
                    {selectedCustomer.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-primary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '2px' }}>Selected Customer</div>
                    <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--color-text-primary)' }}>{selectedCustomer.name}</div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>📞 {selectedCustomer.phone}</span>
                      <span style={{ color: 'var(--color-border)' }}>|</span>
                      <span>ID: {selectedCustomer.customer_code || 'N/A'}</span>
                    </div>
                  </div>
                </div>
                <button className="btn btn-primary" onClick={confirmCustomer} style={{ padding: '12px 24px', borderRadius: '30px', boxShadow: '0 4px 12px rgba(99,102,241,0.2)' }}>
                  Continue to Sale →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── STEP 2: Sale Workflow ─── */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Read-only Customer Header */}
          <div className="glass-panel" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginRight: '8px' }}>Customer:</span>
              <span style={{ fontWeight: 600 }}>{selectedCustomer.name}</span>
              <span style={{ color: 'var(--color-text-secondary)', marginLeft: '8px' }}>({selectedCustomer.phone})</span>
            </div>
            <button className="btn-icon text-muted" onClick={() => setStep(1)} title="Change Customer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5l13.732-13.732z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>

          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>2. Order Items</h2>
              <button className="btn btn-secondary" onClick={() => setShowProductModal(true)}>
                + Add Item{saleType === 'batch' ? 's' : ''}
              </button>
            </div>

            {wizardItems.length === 0 ? (
              <div className="empty-state" style={{ padding: '3rem 1rem' }}>
                <p className="text-muted">No items added yet.<br/>Click "Add Item" to begin.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {wizardItems.map((item) => (
                  <div key={item.id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '16px', background: 'var(--color-bg-secondary)' }}>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px dashed var(--color-border)' }}>
                      <div>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{item.product.name}</h3>
                        <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>SKU: {item.product.sku} | Qty: {item.quantity}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-primary)' }}>{fmt(item.product.price * item.quantity)}</div>
                        <button className="btn-icon text-error" style={{ marginTop: '8px' }} onClick={() => removeWizardItem(item.id)}>Remove</button>
                      </div>
                    </div>

                    {/* QR Code Scanners per quantity */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Scan Physical Units</h4>
                      {Array.from({ length: item.quantity }).map((_, idx) => {
                        const scan = item.scans[idx] || {};
                        const isComplete = isDoubleMode 
                          ? (scan.pack_code && scan.serial_number && scan.item_code)
                          : !!scan.item_code;
                        
                        return (
                          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: isComplete ? 'rgba(16, 185, 129, 0.05)' : 'rgba(0,0,0,0.02)', border: `1px solid ${isComplete ? '#10b981' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Unit {idx + 1} of {item.quantity}</div>
                            
                            {isDoubleMode ? (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                                <input 
                                  type="text" 
                                  className="form-input" 
                                  placeholder="Pack Code *" 
                                  value={scan.pack_code || ''}
                                  onChange={(e) => handleManualScanInput(item.id, idx, 'pack_code', e.target.value)}
                                />
                                <input 
                                  type="text" 
                                  className="form-input" 
                                  placeholder="Serial Number *" 
                                  value={scan.serial_number || ''}
                                  onChange={(e) => handleManualScanInput(item.id, idx, 'serial_number', e.target.value)}
                                />
                                <input 
                                  type="text" 
                                  className="form-input" 
                                  placeholder="Item QR Code *" 
                                  value={scan.item_code || ''}
                                  onChange={(e) => handleManualScanInput(item.id, idx, 'item_code', e.target.value)}
                                />
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ flex: 1 }}>
                                  {scan.item_code ? (
                                    <code style={{ fontSize: '0.9rem', color: '#10b981', background: 'transparent', padding: 0 }}>QR: {scan.item_code}</code>
                                  ) : (
                                    <span style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Waiting for scan...</span>
                                  )}
                                </div>
                                <button 
                                  className={`btn ${scan.item_code ? 'btn-outline' : 'btn-secondary'}`} 
                                  style={{ padding: '0.5rem 1rem' }}
                                  onClick={() => openScanner(item.id, idx)}
                                >
                                  {scan.item_code ? 'Rescan' : '📷 Scan QR'}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Checkout Block */}
          {wizardItems.length > 0 && (
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '24px' }}>3. Checkout</h2>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px dashed var(--color-border)' }}>
                <span style={{ fontSize: '1.1rem', color: 'var(--color-text-secondary)' }}>Total Amount Due:</span>
                <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-primary)' }}>{fmt(totalAmount)}</span>
              </div>

              {saleError && <div className="alert alert-error mb-xl"><p>{saleError}</p></div>}

              <button 
                className="btn btn-primary" 
                style={{ width: '100%', padding: '16px', fontSize: '1.2rem', fontWeight: 700 }}
                disabled={!isCheckoutReady() || isProcessing}
                onClick={handleHoldSale}
              >
                {isProcessing ? 'Processing...' : `Hold & Continue to Payment — ${fmt(totalAmount)}`}
              </button>
              {!isCheckoutReady() && (
                <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '12px' }}>
                  Please ensure all items have been scanned.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Modals ─── */}

      {/* Product Search Modal */}
      <Modal isOpen={showProductModal} onClose={() => setShowProductModal(false)} title="Search Catalog">
        <input
          type="text"
          className="input"
          placeholder="Search by name, SKU, category..."
          value={productSearchTerm}
          onChange={(e) => setProductSearchTerm(e.target.value)}
          style={{ width: '100%', marginBottom: '16px' }}
          autoFocus
        />
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {filteredProducts.map(p => (
            <div key={p.id} style={{ padding: '12px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>SKU: {p.sku} | Price: {fmt(p.price)}</div>
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => handleProductSelect(p)}>Select</button>
            </div>
          ))}
          {filteredProducts.length === 0 && <p className="text-muted text-center" style={{ padding: '2rem 0' }}>No products found.</p>}
        </div>
      </Modal>

      {/* Quantity Prompt for Batch */}
      <Modal isOpen={showQuantityPrompt} onClose={() => setShowQuantityPrompt(false)} title="Quantity">
        <form onSubmit={(e) => { e.preventDefault(); confirmBatchQuantity(); }}>
          <p style={{ marginBottom: '16px' }}>How many <strong>{selectedProductForBatch?.product?.name}</strong> items do you want to add to this batch?</p>
          <div className="form-group">
            <input 
              type="number" 
              className="input" 
              min="1" 
              max={selectedProductForBatch?.stock || 999} 
              value={batchQuantityInput}
              onChange={(e) => setBatchQuantityInput(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="modal-actions mt-xl" style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setShowQuantityPrompt(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Confirm Quantity</button>
          </div>
        </form>
      </Modal>

      {/* Extracted Modals */}
      <NewCustomerModal
        isOpen={showNewCustomerModal}
        onClose={() => setShowNewCustomerModal(false)}
        onSubmit={handleCreateCustomer}
      />

      {customerToVerify && (
        <VerifyModal
          isOpen={showVerifyModal}
          onClose={() => setShowVerifyModal(false)}
          customerToVerify={customerToVerify}
          verifyCode={verifyCode}
          setVerifyCode={setVerifyCode}
          handleVerifyCode={handleVerifyCode}
        />
      )}

      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        pendingSale={pendingSale}
        fmt={fmt}
        amountPaid={amountPaid}
        setAmountPaid={setAmountPaid}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        handleFinalizePayment={handleFinalizeSale}
        isProcessing={isProcessing}
        saleError={saleError}
      />

      <ReceiptModal
        isOpen={showReceipt}
        onClose={closeReceipt}
        receiptData={receiptData}
        fmt={fmt}
        business={business}
      />

    </div>
  );
}
