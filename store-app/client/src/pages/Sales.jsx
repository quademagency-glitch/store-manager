import { useState, useMemo, useEffect } from 'react';
import { useAuthContext } from '../lib/AuthContext';
import { useProducts } from '../hooks/useProducts';
import { useCustomers } from '../hooks/useCustomers';
import { useLoyalty } from '../hooks/useLoyalty';
import Modal from '../components/Modal';
import SalesHistory from '../components/SalesHistory';
import { api } from '../lib/api';
import QrScanner from '../components/QrScanner';

import NewCustomerModal from '../features/sales/components/NewCustomerModal';
import VerifyModal from '../features/sales/components/VerifyModal';
import PaymentModal from '../features/sales/components/PaymentModal';
import ReceiptModal from '../features/sales/components/ReceiptModal';
import { addToOfflineQueue } from '../lib/idb';
import { useToast } from '../hooks/useToast';
import { usePrintDocument } from '../hooks/usePrintDocument';
import { useCurrency } from '../hooks/useCurrency';
import { PageHeader } from '../components/ui';

// Human-readable labels for each scannable tracking code, shown in the scanner modal.
const SCAN_FIELD_LABELS = {
  pack_code: 'Pack Code',
  serial_number: 'Serial Number',
  item_code: 'Item Code',
  product_code: 'Product Code',
};

export default function Sales() {
  const { user } = useAuthContext();
  const toast = useToast();
  const { business } = usePrintDocument();
  const { fmt } = useCurrency(business);
  const { products } = useProducts();
  // Customers are created through the POST in handleCreateCustomer, not the
  // hook's createCustomer — it is deliberately not destructured here.
  const { searchCustomers, verifyCustomerCode } = useCustomers();
  const loyalty = useLoyalty();

  // `null` is the POS terminal itself; 'history' swaps in the past-sales view.
  // There were once 'new' and 'batch' modes here too — a wizard that asked
  // whether you were selling one item or several, then prompted for a quantity
  // before creating that many scan slots. The cart below does both at once, so
  // the modes and everything that drove them are gone.
  const [saleType, setSaleType] = useState(null);

  // Customer state
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);

  // Verification state
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [customerToVerify, setCustomerToVerify] = useState(null);

  // The cart. Each entry is
  //   { id, product, quantity, stock, scans: [...] }
  // with exactly one `scans` slot per unit — updateQuantity pushes and pops
  // them alongside the quantity, so every physical item leaving the shop has
  // its own tracking codes and checkout stays blocked until all are filled.
  const [wizardItems, setWizardItems] = useState([]);
  const [productSearchTerm, setProductSearchTerm] = useState('');

  // Scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [activeScanTarget, setActiveScanTarget] = useState(null);

  // Checkout state
  const [isProcessing, setIsProcessing] = useState(false);
  const [saleError, setSaleError] = useState('');
  
  // Two-Stage Checkout State
  const [pendingSale, setPendingSale] = useState(null); // Holds the sale object from Stage 1
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');

  // Customer rewards (store credit / loyalty points) applied at checkout
  const [appliedStoreCredit, setAppliedStoreCredit] = useState('');
  const [appliedPoints, setAppliedPoints] = useState('');

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

  const pointValue = Number(loyalty.rules?.point_value || 0);
  const rewardsApplied = (Number(appliedStoreCredit) || 0) + (Number(appliedPoints) || 0) * pointValue;
  const netAmountDue = Math.max(0, totalAmount - rewardsApplied);

  // Fetch the selected customer's reward balances so they can be redeemed at checkout
  useEffect(() => {
    if (selectedCustomer?.id) {
      loyalty.fetchStoreCredit(selectedCustomer.id);
      loyalty.fetchBalance(selectedCustomer.id);
      loyalty.fetchRules();
    }
    setAppliedStoreCredit('');
    setAppliedPoints('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer?.id]);

  // ─── Customer Handling ───
  const handleCreateCustomer = async (data) => {
    try {
      const res = await api.post('/customers', { ...data, business_id: business?.id });
      setSelectedCustomer(res.customer);
      setCustomerSearchTerm('');
      setShowNewCustomerModal(false);
      toast.success('Customer created.');
    } catch {
      toast.error('Failed to create customer.');
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

  // ─── Scanning Logic ───
  // `field` selects which tracking code the incoming scan fills. Single mode
  // only ever scans 'item_code'; double mode targets pack_code / serial_number
  // / item_code / product_code independently.
  const openScanner = (itemId, unitIndex = 0, field = 'item_code') => {
    setActiveScanTarget({ itemId, unitIndex, field });
    setShowScanner(true);
  };

  const handleScan = (scanValue) => {
    if (!activeScanTarget) return;
    const { itemId, unitIndex, field } = activeScanTarget;

    setWizardItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const newScans = [...item.scans];
        newScans[unitIndex] = {
          ...newScans[unitIndex],
          [field]: scanValue
        };
        return { ...item, scans: newScans };
      }
      return item;
    }));
    setShowScanner(false);
    setActiveScanTarget(null);
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
        const serialRequired = item.product?.requires_serial !== false;
        if (item.scans.some(s => !s.pack_code || !s.item_code || (serialRequired && !s.serial_number))) return false;
      } else {
        if (item.scans.some(s => !s.item_code)) return false;
      }
    }
    return true;
  };

  const handleHoldSale = async () => {
    if (!isCheckoutReady()) return;
    setSaleError('');
    setIsProcessing(true);

    let payload;
    try {
      payload = {
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
          id: `offline-${crypto.randomUUID()}`,
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



  const handleFinalizeSale = async (e) => {
    if (e) e.preventDefault();
    const tendered = parseFloat(amountPaid) || 0;
    if (netAmountDue > 0 && (!amountPaid || isNaN(tendered))) {
       setSaleError('Please enter a valid amount paid.');
       return;
    }
    if (!pendingSale) return;
    setIsProcessing(true);
    try {
      // Redeem any applied customer rewards first — if this fails, the sale
      // stays in 'pending' state so the cashier can retry without double-charging.
      if (!pendingSale._isOffline) {
        const storeCreditToRedeem = Number(appliedStoreCredit) || 0;
        const pointsToRedeem = Number(appliedPoints) || 0;
        try {
          if (storeCreditToRedeem > 0) {
            await loyalty.issueStoreCredit(selectedCustomer.id, storeCreditToRedeem, 'redeem', pendingSale.id, 'Redeemed at checkout');
          }
          if (pointsToRedeem > 0) {
            await loyalty.redeemPoints(selectedCustomer.id, pointsToRedeem, pendingSale.id, 'Redeemed at checkout');
          }
        } catch (rewardErr) {
          setSaleError(rewardErr.message || 'Failed to redeem customer rewards');
          setIsProcessing(false);
          return;
        }
      }

      const payload = { amount_paid: tendered + rewardsApplied };

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
          amount_paid: tendered + rewardsApplied,
          rewards_applied: rewardsApplied,
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
          amount_paid: tendered + rewardsApplied,
          rewards_applied: rewardsApplied,
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
      setAppliedStoreCredit('');
      setAppliedPoints('');
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

  // ─── POS Actions ───
  const handleAddFromCatalog = (product) => {
    const userLocationId = user?.user_metadata?.location_id;
    const localStock = userLocationId 
      ? (product.product_inventory?.find(inv => inv.location_id === userLocationId)?.quantity || 0)
      : (product.product_inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0);

    if (localStock <= 0) {
      toast.error('This product is out of stock.');
      return;
    }

    const isDoubleMode = business?.qr_tracking_mode === 'double';
    
    // Check if already in cart
    const existingIndex = wizardItems.findIndex(i => i.product.id === product.id);
    if (existingIndex >= 0) {
      const item = wizardItems[existingIndex];
      if (item.quantity >= localStock) {
        toast.warning(`Only ${localStock} available in stock.`);
        return;
      }
      const newItems = [...wizardItems];
      newItems[existingIndex] = {
        ...item,
        quantity: item.quantity + 1,
        scans: [...item.scans, isDoubleMode ? { pack_code: '', serial_number: '', item_code: '', product_code: '' } : { item_code: '', unit_id: null }]
      };
      setWizardItems(newItems);
    } else {
      setWizardItems(prev => [...prev, {
        id: crypto.randomUUID(),
        product,
        quantity: 1,
        scans: isDoubleMode ? [{ pack_code: '', serial_number: '', item_code: '', product_code: '' }] : [{ item_code: '', unit_id: null }],
        stock: localStock
      }]);
    }
  };

  const updateQuantity = (itemId, delta) => {
    setWizardItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const newQty = item.quantity + delta;
        if (newQty <= 0) return item;
        if (newQty > item.stock) {
          toast.warning(`Only ${item.stock} available.`);
          return item;
        }
        const newScans = [...item.scans];
        if (delta > 0) {
          newScans.push(isDoubleMode ? { pack_code: '', serial_number: '', item_code: '', product_code: '' } : { item_code: '', unit_id: null });
        } else {
          newScans.pop();
        }
        return { ...item, quantity: newQty, scans: newScans };
      }
      return item;
    }));
  };

  const [showCustomerDrawer, setShowCustomerDrawer] = useState(false);

  // ─── Render POS Grid ───
  if (saleType === 'history') {
    return (
      <div>
        <PageHeader
          title="Sales History"
          subtitle="Review past transactions."
          actions={
              <button className="btn btn-outline" onClick={() => setSaleType(null)}>Back to POS</button>
          }
        />
        <SalesHistory />
      </div>
    );
  }

  return (
    <div className="sales-page">
      {/* ─── Left Panel: Catalog ─── */}
      <div className="sales-catalog">
        <div className="catalog-header">
          <div className="catalog-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            POS Terminal
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => setSaleType('history')}>History</button>
        </div>

        <div className="catalog-search">
          <svg className="catalog-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" strokeWidth="2"/></svg>
          <input 
             className="catalog-search-input" 
             placeholder="Search products by name, SKU..."
             value={productSearchTerm}
             onChange={e => setProductSearchTerm(e.target.value)}
          />
        </div>

        <div className="catalog-grid">
          {filteredProducts.map(p => (
            <div key={p.id} className="product-card" onClick={() => handleAddFromCatalog(p)}>
               <div className="product-card-top">
                 <div className="product-card-avatar">{p.name.charAt(0)}</div>
                 <div className="product-card-meta">
                   <span className="product-card-name">{p.name}</span>
                   <span className="product-card-sku">{p.sku}</span>
                 </div>
               </div>
               <div className="product-card-middle mt-sm">
                 <span className="product-card-price">{fmt(p.price)}</span>
               </div>
            </div>
          ))}
          {filteredProducts.length === 0 && (
            <div className="catalog-empty">
              <p>No products found.</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Right Panel: Cart ─── */}
      <div className="sales-cart">
        <div className="cart-header">
           <div className="cart-title">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
             Current Order
           </div>
           {selectedCustomer ? (
             <button className="btn btn-sm btn-secondary" onClick={() => setSelectedCustomer(null)} title="Remove Customer">
               {selectedCustomer.name.split(' ')[0]} ✕
             </button>
           ) : (
             <button className="btn btn-sm btn-outline" onClick={() => setShowCustomerDrawer(true)}>+ Customer</button>
           )}
        </div>

        <div className="cart-items">
           {wizardItems.length === 0 ? (
             <div className="cart-empty">
               <svg className="cart-empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
               <div className="cart-empty-text">Cart is empty</div>
               <div className="cart-empty-hint">Click products on the left to add</div>
             </div>
           ) : (
             wizardItems.map(item => (
                <div key={item.id} style={{ display: 'flex', flexDirection: 'column', padding: '12px 0', borderBottom: '1px solid var(--color-border)', gap: '8px' }}>
                   <div className="flex justify-between items-center">
                     <div className="flex-1 min-w-0">
                       <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.product.name}</div>
                       <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{fmt(item.product.price)} each</div>
                     </div>
                     <div className="flex items-center gap-sm">
                       <div className="product-card-qty-control">
                         <button className="qty-btn qty-btn-sm" onClick={() => updateQuantity(item.id, -1)}>-</button>
                         <span className="qty-value qty-value-sm">{item.quantity}</span>
                         <button className="qty-btn qty-btn-sm" onClick={() => updateQuantity(item.id, 1)}>+</button>
                       </div>
                       <button className="btn-icon text-error" onClick={() => removeWizardItem(item.id)}>✕</button>
                     </div>
                   </div>
                   
                   {/* QR Scanners */}
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                      {item.scans.map((scan, idx) => {
                         const isComplete = isDoubleMode
                          ? (scan.pack_code && scan.item_code && (!(item.product?.requires_serial !== false) || scan.serial_number))
                          : !!scan.item_code;
                         
                         return (
                           <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: isComplete ? 'rgba(16, 185, 129, 0.05)' : 'rgba(0,0,0,0.02)', border: `1px solid ${isComplete ? '#10b981' : 'var(--color-border)'}`, borderRadius: '6px' }}>
                             <span style={{ fontSize: '0.7rem', color: isComplete ? '#10b981' : 'var(--color-text-muted)' }}>Unit {idx + 1} {isComplete ? '✓' : ''}</span>
                             <button className="btn btn-sm btn-secondary" style={{ padding: '2px 8px', fontSize: '0.7rem' }} onClick={() => openScanner(item.id, idx)}>Scan QR</button>
                           </div>
                         );
                      })}
                   </div>
                </div>
             ))
           )}
        </div>

        <div className="cart-checkout">
           <div className="cart-summary">
             <div className="cart-summary-total">
               <span className="cart-summary-label">Total</span>
               <span className="cart-summary-value">{fmt(totalAmount)}</span>
             </div>
           </div>
           
           {saleError && <div style={{ color: 'var(--color-error)', fontSize: '0.8rem', marginBottom: '8px', textAlign: 'center' }}>{saleError}</div>}

           <button 
             className="complete-sale-btn" 
             disabled={!isCheckoutReady() || isProcessing || !selectedCustomer}
             onClick={handleHoldSale}
           >
             {isProcessing ? 'Processing...' : (!selectedCustomer ? 'Select Customer First' : (!isCheckoutReady() ? 'Scan All Items' : 'Checkout'))}
           </button>
        </div>
      </div>

      {/* ─── Modals ─── */}

      {/* Customer Selection Modal */}
      <Modal isOpen={showCustomerDrawer} onClose={() => setShowCustomerDrawer(false)} title="Select Customer">
          <input
            type="text"
            className="input w-full mb-md"
            placeholder="Search by phone or name..."
            value={customerSearchTerm}
            onChange={(e) => setCustomerSearchTerm(e.target.value)}
          />
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {searchResults.map(c => (
              <div 
                key={c.id} 
                className="glass-panel mb-sm"
                style={{ padding: '12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                onClick={() => { setSelectedCustomer(c); setSearchResults([]); setCustomerSearchTerm(''); setShowCustomerDrawer(false); }}
              >
                <div>
                  <div className="font-bold">{c.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{c.phone}</div>
                </div>
                <button className="btn btn-sm btn-outline">Select</button>
              </div>
            ))}
            {!isSearching && searchResults.length === 0 && customerSearchTerm.length > 2 && (
              <div className="text-center p-md">
                <p>No customer found.</p>
                <button className="btn btn-primary mt-sm" onClick={() => setShowNewCustomerModal(true)}>+ Create New</button>
              </div>
            )}
          </div>
      </Modal>

      {/* Extracted Modals */}
      {/* `business.country` is already resolved server-side against the active
          location, so a Nigeria branch supplies +234 without any change here. */}
      <NewCustomerModal
        isOpen={showNewCustomerModal}
        onClose={() => setShowNewCustomerModal(false)}
        onSubmit={handleCreateCustomer}
        country={business?.country}
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
        rewardsEnabled={!pendingSale?._isOffline}
        storeCreditBalance={loyalty.storeCreditBalance}
        pointsBalance={loyalty.pointsBalance}
        pointValue={pointValue}
        appliedStoreCredit={appliedStoreCredit}
        setAppliedStoreCredit={setAppliedStoreCredit}
        appliedPoints={appliedPoints}
        setAppliedPoints={setAppliedPoints}
        netAmountDue={netAmountDue}
      />

      <ReceiptModal
        isOpen={showReceipt}
        onClose={closeReceipt}
        receiptData={receiptData}
        fmt={fmt}
        business={business}
      />

      <QrScanner
        isOpen={showScanner}
        onClose={() => { setShowScanner(false); setActiveScanTarget(null); }}
        onScan={handleScan}
        label={activeScanTarget ? SCAN_FIELD_LABELS[activeScanTarget.field] : undefined}
      />

    </div>
  );
}
