import { useState, useEffect, useMemo } from 'react';
import { api, API_BASE } from '../lib/api';
import { supabase } from '../lib/supabase';
import QrScanner from '../components/QrScanner';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import { Icons } from './icons/Icons';

/**
 * InventoryCount — Full inventory count flow:
 * Step 1: Select branch → Start session
 * Step 2: View all products grouped by category/model
 * Step 3: Click a model → open count form (qty, QR scans for in-stock/returns/damaged)
 * Step 4: Save model → green (match) or red (discrepancy)
 */
export default function InventoryCount({ locations, products }) {
  const toast = useToast();
  const confirm = useConfirm();
  // Flow state: 'select' | 'counting' | 'review'
  const [step, setStep] = useState('select');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [session, setSession] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Product counting state
  const [activeProduct, setActiveProduct] = useState(null);
  const [productCounts, setProductCounts] = useState({}); // { [productId]: { counted, scannedQrs, returnQrs, damagedQrs, status } }
  const [showScanner, setShowScanner] = useState(false);
  const [scanTarget, setScanTarget] = useState('instock'); // 'instock' | 'returns' | 'damaged'
  const [scanFeedback, setScanFeedback] = useState(null);
  const [completing, setCompleting] = useState(false);

  // View state
  const [viewSession, setViewSession] = useState(null);
  const [viewSessionLoading, setViewSessionLoading] = useState(false);

  const fetchSessions = async () => {
    setSessionsLoading(true);
    try {
      const data = await api.get('/stocktake');
      setSessions(Array.isArray(data) ? data : []);
    } catch { setSessions([]); }
    setSessionsLoading(false);
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  // View or Resume session
  const handleViewSession = async (id) => {
    setViewSessionLoading(true);
    setStep('view');
    try {
      const data = await api.get(`/stocktake/${id}`);

      if (data.session.status === 'in_progress') {
        setSession(data.session);
        setSelectedLocationId(data.session.location_id);

        const counts = {};
        for (const scan of data.scans) {
          if (scan.scan_result === 'found' && scan.unit?.product?.id) {
            const pid = scan.unit.product.id;
            if (!counts[pid]) {
              counts[pid] = { counted: '', scannedQrs: [], returnQrs: [], damagedQrs: [], status: 'pending' };
            }
            if (!counts[pid].scannedQrs.includes(scan.qr_code)) {
              counts[pid].scannedQrs.push(scan.qr_code);
            }
          }
        }

        for (const pid of Object.keys(counts)) {
          counts[pid].counted = counts[pid].scannedQrs.length.toString();
        }

        setProductCounts(counts);
        setStep('counting');
      } else {
        setViewSession(data);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to fetch session details');
      setStep('select');
    }
    setViewSessionLoading(false);
  };

  // Global SSE Listener for batch scans
  useEffect(() => {
    if (step !== 'counting' || !session) return;

    let eventSource;

    supabase.auth.getSession().then(({ data: { session: authSession } }) => {
      const token = authSession?.access_token;
      if (!token) return;

      eventSource = new EventSource(`${API_BASE}/scanner/events?token=${token}`);

      eventSource.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.scanned && data.payload && data.payload.command === 'batch_stock_take') {
            const qrCodes = data.payload.pack_codes || data.payload.qr_codes;
            if (qrCodes && qrCodes.length > 0) {
              try {
                const result = await api.post(`/stocktake/${session.id}/batch-scan`, { qr_codes: qrCodes });
                toast.success(result.message);
                // Reload session to hydrate the counts
                handleViewSession(session.id);
              } catch (err) {
                toast.error(err.message || 'Failed to process batch scan');
              }
            }
          }
        } catch (err) {
          if (import.meta.env.DEV) console.error('Error parsing batch SSE event:', err);
        }
      };
      
      eventSource.onerror = (err) => {
        if (import.meta.env.DEV) console.error('SSE connection error:', err);
      };
    });

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [step, session]);

  // Get products at selected location with stock info
  const locationProducts = useMemo(() => {
    if (!selectedLocationId) return [];
    return products
      .filter(p => {
        const inv = p.product_inventory?.find(i => i.location_id === selectedLocationId);
        return inv && inv.quantity > 0;
      })
      .map(p => {
        const inv = p.product_inventory?.find(i => i.location_id === selectedLocationId);
        return { ...p, systemQty: inv?.quantity || 0 };
      })
      .sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
  }, [products, selectedLocationId]);

  // Group by category
  const groupedProducts = useMemo(() => {
    const groups = {};
    for (const p of locationProducts) {
      const cat = p.category || 'Uncategorized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    }
    return groups;
  }, [locationProducts]);

  // Start a new inventory count session
  const handleStart = async () => {
    if (!selectedLocationId) return;
    try {
      const result = await api.post('/stocktake/start', { location_id: selectedLocationId });
      setSession(result.session);
      setProductCounts({});
      setStep('counting');
    } catch (err) {
      toast.error(err.message || 'Failed to start inventory count');
    }
  };

  // Open count form for a product
  const openProductCount = (product) => {
    const existing = productCounts[product.id];
    setActiveProduct(product);
    if (!existing) {
      setProductCounts(prev => ({
        ...prev,
        [product.id]: {
          counted: '',
          scannedQrs: [],
          returnQrs: [],
          damagedQrs: [],
          status: 'pending' // 'pending' | 'match' | 'discrepancy'
        }
      }));
    }
    setShowScanner(false);
    setScanFeedback(null);
  };

  // Handle QR scan
  const handleScan = async (qrCode) => {
    if (!activeProduct) return;
    const productId = activeProduct.id;
    const current = productCounts[productId];
    if (!current) return;

    // Check for duplicates across all scan lists
    const allScanned = [...current.scannedQrs, ...current.returnQrs, ...current.damagedQrs];
    if (allScanned.includes(qrCode)) {
      setScanFeedback({ type: 'warning', message: `Already scanned: ${qrCode}` });
      return;
    }

    // Also record the scan in the backend session
    try {
      if (session) {
        await api.post(`/stocktake/${session.id}/scan`, { qr_code: qrCode });
      }
    } catch { /* continue even if backend scan fails */ }

    // Add to the appropriate list
    setProductCounts(prev => {
      const updated = { ...prev[productId] };
      if (scanTarget === 'instock') {
        updated.scannedQrs = [...updated.scannedQrs, qrCode];
      } else if (scanTarget === 'returns') {
        updated.returnQrs = [...updated.returnQrs, qrCode];
      } else if (scanTarget === 'damaged') {
        updated.damagedQrs = [...updated.damagedQrs, qrCode];
      }
      return { ...prev, [productId]: updated };
    });

    setScanFeedback({ type: 'success', message: `Scanned: ${qrCode}` });

    // Clear feedback after 2s
    setTimeout(() => setScanFeedback(null), 2000);
  };

  // Save a product count
  const saveProductCount = () => {
    if (!activeProduct) return;
    const productId = activeProduct.id;
    const current = productCounts[productId];
    if (!current) return;

    const physicalCount = parseInt(current.counted, 10) || 0;
    const totalScanned = current.scannedQrs.length + current.returnQrs.length + current.damagedQrs.length;
    const systemQty = activeProduct.systemQty;

    // Determine status: green if counted matches system AND scanned matches counted
    const isMatch = physicalCount === systemQty && totalScanned === physicalCount;

    setProductCounts(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        status: isMatch ? 'match' : 'discrepancy'
      }
    }));

    setActiveProduct(null);
    setShowScanner(false);
    setScanFeedback(null);
  };

  // Remove a QR from a list
  const removeQr = (listKey, qrCode) => {
    if (!activeProduct) return;
    setProductCounts(prev => {
      const updated = { ...prev[activeProduct.id] };
      updated[listKey] = updated[listKey].filter(q => q !== qrCode);
      return { ...prev, [activeProduct.id]: updated };
    });
  };

  const completeCount = async () => {
    if (!session) return;
    const confirmed = await confirm({ title: 'Complete Inventory Count', message: 'Complete this inventory count? All uncounted items will be flagged.', confirmText: 'Complete Count' });
    if (!confirmed) return;
    setCompleting(true);
    try {
      const result = await api.put(`/stocktake/${session.id}/complete`);
      toast.success(`Inventory count completed. ${result.summary?.missing || 0} discrepancies flagged.`);
      setStep('select');
      setSession(null);
      setActiveProduct(null);
      setProductCounts({});
      await fetchSessions();
    } catch (err) {
      toast.error(err.message || 'Failed to complete count');
    }
    setCompleting(false);
  };

  const cancelCount = async () => {
    if (!session) return;
    const confirmed = await confirm({ title: 'Cancel Inventory Count', message: 'Cancel this inventory count?', variant: 'danger', confirmText: 'Cancel Count' });
    if (!confirmed) return;
    try {
      await api.put(`/stocktake/${session.id}/cancel`);
      setStep('select');
      setSession(null);
      setActiveProduct(null);
      setProductCounts({});
      await fetchSessions();
    } catch (err) {
      toast.error(err.message || 'Failed to cancel');
    }
  };

  const handleDeleteSession = async (e, id) => {
    e.stopPropagation(); // prevent row click
    const confirmed = await confirm({ title: 'Delete Session', message: 'Are you sure you want to delete this inventory count? This cannot be undone.', variant: 'danger', confirmText: 'Delete' });
    if (!confirmed) return;
    try {
      await api.delete(`/stocktake/${id}`);
      await fetchSessions();
    } catch (err) {
      toast.error(err.message || 'Failed to delete inventory count');
    }
  };


  // Stats
  const countedCount = Object.values(productCounts).filter(c => c.status !== 'pending').length;
  const totalProducts = locationProducts.length;
  const matchCount = Object.values(productCounts).filter(c => c.status === 'match').length;
  const discrepancyCount = Object.values(productCounts).filter(c => c.status === 'discrepancy').length;

  // ─── RENDER ───

  // Step 1: Select branch
  if (step === 'select') {
    return (
      <div>
        <div className="glass-panel" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, marginBottom: '0.5rem', fontSize: '1.2rem' }}><span aria-hidden="true" style={{ display: 'inline-flex' }}>{Icons.clipboard}</span> New Inventory Count</h3>
          <p style={{ opacity: 0.6, fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Select the branch where you want to perform the inventory count. 
            All items at that branch will be listed by category for counting.
          </p>

          <div className="form-group" style={{ maxWidth: '400px', marginBottom: '1.5rem' }}>
            <label style={{ fontWeight: 500 }}>Branch / Location</label>
            <select 
              className="form-input" 
              value={selectedLocationId} 
              onChange={e => setSelectedLocationId(e.target.value)}
            >
              <option value="">Choose a branch...</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          {selectedLocationId && (
            <div style={{ marginBottom: '1rem', padding: '12px 16px', borderRadius: '8px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
              <strong>{locationProducts.length}</strong> products with stock at this location
            </div>
          )}

          <button 
            className="btn btn-primary" 
            onClick={handleStart} 
            disabled={!selectedLocationId || locationProducts.length === 0}
            style={{ minWidth: '200px' }}
          >
            Start Inventory Count
          </button>
        </div>

        {/* History */}
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <h3 style={{ fontWeight: 600, margin: 0 }}>Past Inventory Counts</h3>
          </div>
          <table className="glass-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Branch</th>
                <th>Status</th>
                <th>Expected</th>
                <th>Scanned</th>
                <th>Missing</th>
                <th>Started By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessionsLoading ? (
                <tr><td colSpan="8" className="text-center py-xl text-muted"><div className="spinner mx-auto mb-sm" /><p>Loading...</p></td></tr>
              ) : sessions.length === 0 ? (
                <tr><td colSpan="8" style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>No inventory counts yet.</td></tr>
              ) : sessions.map(s => (
                <tr key={s.id} onClick={() => handleViewSession(s.id)} style={{ cursor: 'pointer' }} className="hover-bg">
                  <td className="text-muted">{new Date(s.created_at).toLocaleDateString()}</td>
                  <td>{s.location?.name || 'Unknown'}</td>
                  <td>
                    <span className={`badge ${s.status === 'completed' ? 'badge-success' : s.status === 'cancelled' ? 'badge-secondary' : 'badge-warning'}`}>
                      {s.status}
                    </span>
                  </td>
                  <td>{s.expected_count}</td>
                  <td>{s.scanned_count}</td>
                  <td style={{ color: s.missing_count > 0 ? 'var(--color-error)' : 'var(--color-success)', fontWeight: 600 }}>{s.missing_count}</td>
                  <td>{s.starter?.name || 'Unknown'}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-icon text-error"
                      onClick={(e) => handleDeleteSession(e, s.id)}
                      title="Delete Session"
                      aria-label="Delete Session"
                    >
                      {Icons.trash}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Step 2: View Session Details
  if (step === 'view') {
    return (
      <div>
        <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, margin: 0, fontSize: '1.2rem' }}>
              <span aria-hidden="true" style={{ display: 'inline-flex' }}>{Icons.clipboard}</span> Inventory Count Details
            </h3>
            <button className="btn btn-sm btn-outline" onClick={() => { setStep('select'); setViewSession(null); }}>
              ← Back
            </button>
          </div>

          {viewSessionLoading || !viewSession ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <div className="spinner mx-auto mb-sm" /><p>Loading details...</p>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
                <div>
                  <span style={{ opacity: 0.6, fontSize: '0.85rem' }}>Location</span>
                  <div style={{ fontWeight: 600 }}>{viewSession.session.location?.name || 'Unknown'}</div>
                </div>
                <div>
                  <span style={{ opacity: 0.6, fontSize: '0.85rem' }}>Status</span>
                  <div>
                    <span className={`badge ${viewSession.session.status === 'completed' ? 'badge-success' : viewSession.session.status === 'cancelled' ? 'badge-secondary' : 'badge-warning'}`}>
                      {viewSession.session.status}
                    </span>
                  </div>
                </div>
                <div>
                  <span style={{ opacity: 0.6, fontSize: '0.85rem' }}>Date</span>
                  <div style={{ fontWeight: 600 }}>{new Date(viewSession.session.created_at).toLocaleString()}</div>
                </div>
                <div>
                  <span style={{ opacity: 0.6, fontSize: '0.85rem' }}>Started By</span>
                  <div style={{ fontWeight: 600 }}>{viewSession.session.starter?.name || 'Unknown'}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '0.85rem', opacity: 0.6 }}>Expected</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{viewSession.summary.expected}</div>
                </div>
                <div style={{ padding: '1rem', background: 'rgba(59,130,246,0.1)', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.2)' }}>
                  <div style={{ fontSize: '0.85rem', opacity: 0.6 }}>Scanned (Found)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#3b82f6' }}>{viewSession.summary.scanned}</div>
                </div>
                <div style={{ padding: '1rem', background: viewSession.summary.errors > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', borderRadius: '8px', border: `1px solid ${viewSession.summary.errors > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}` }}>
                  <div style={{ fontSize: '0.85rem', opacity: 0.6 }}>Errors / Missing</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: viewSession.summary.errors > 0 ? '#ef4444' : '#22c55e' }}>{viewSession.summary.errors}</div>
                </div>
              </div>

              {viewSession.product_progress && viewSession.product_progress.length > 0 && (
                <div>
                  <h4 style={{ marginBottom: '1rem' }}>Products</h4>
                  <table className="glass-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>SKU</th>
                        <th>Expected</th>
                        <th>Scanned</th>
                        <th>Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewSession.product_progress.map(p => (
                        <tr key={p.product_id}>
                          <td>{p.product_name}</td>
                          <td>{p.product_sku || '—'}</td>
                          <td>{p.expected}</td>
                          <td>{p.scanned}</td>
                          <td style={{ color: p.expected !== p.scanned ? '#ef4444' : '#22c55e', fontWeight: p.expected !== p.scanned ? 700 : 400 }}>
                            {p.scanned - p.expected}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Step 3: Counting — product list with active product form
  return (
    <div>
      {/* Header Bar */}
      <div className="glass-panel" style={{ padding: '1rem 1.5rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, margin: 0, fontSize: '1.1rem' }}>
            <span aria-hidden="true" style={{ display: 'inline-flex' }}>{Icons.clipboard}</span> Inventory Count — {locations.find(l => l.id === selectedLocationId)?.name || 'Unknown'}
          </h3>
          <div style={{ fontSize: '0.85rem', opacity: 0.6, marginTop: '4px' }}>
            {countedCount} / {totalProducts} products counted
            {matchCount > 0 && <span style={{ color: 'var(--color-success)', marginLeft: '8px' }}>{matchCount} match</span>}
            {discrepancyCount > 0 && <span style={{ color: 'var(--color-error)', marginLeft: '8px' }}>{discrepancyCount} discrepancies</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-sm btn-secondary" onClick={cancelCount}>Cancel</button>
          <button
            className="btn btn-sm"
            style={{ background: 'var(--color-success)', color: 'white' }}
            onClick={completeCount}
            disabled={completing}
          >
            {completing ? 'Completing...' : 'Complete Count'}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: '3px', transition: 'width 0.3s ease',
            width: totalProducts > 0 ? `${(countedCount / totalProducts) * 100}%` : '0%',
            background: countedCount === totalProducts && totalProducts > 0 ? '#22c55e' : 'linear-gradient(90deg, #3b82f6, #8b5cf6)'
          }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        {/* Left: Product List by Category */}
        <div style={{ flex: '1 1 400px', minWidth: 0 }}>
          {Object.entries(groupedProducts).map(([category, catProducts]) => (
            <div key={category} className="glass-panel" style={{ padding: 0, marginBottom: '1rem', overflow: 'hidden' }}>
              <div style={{ 
                padding: '10px 16px', 
                background: 'rgba(255,255,255,0.03)', 
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.7
              }}>
                {category}
              </div>
              {catProducts.map(product => {
                const pc = productCounts[product.id];
                const status = pc?.status || 'pending';
                const isActive = activeProduct?.id === product.id;
                return (
                  <div
                    key={product.id}
                    onClick={() => !isActive && openProductCount(product)}
                    style={{
                      padding: '12px 16px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      cursor: isActive ? 'default' : 'pointer',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      background: isActive ? 'rgba(59,130,246,0.1)' : 
                                  status === 'match' ? 'rgba(34,197,94,0.08)' : 
                                  status === 'discrepancy' ? 'rgba(239,68,68,0.08)' : 'transparent',
                      transition: 'background 0.2s',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '0.95rem' }}>{product.name}</div>
                      <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>
                        SKU: {product.sku || '—'} · System Qty: <strong>{product.systemQty}</strong>
                      </div>
                    </div>
                    <div>
                      {status === 'match' && <span style={{ color: 'var(--color-success)', display: 'inline-flex' }} aria-label="Match">{Icons.checkCircle}</span>}
                      {status === 'discrepancy' && <span style={{ color: 'var(--color-error)', display: 'inline-flex' }} aria-label="Discrepancy">{Icons.xCircle}</span>}
                      {status === 'pending' && <span style={{ opacity: 0.3, fontSize: '0.85rem' }}>Tap to count</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Right: Active Product Count Form */}
        {activeProduct && (
          <div style={{ flex: '1 1 450px', minWidth: '350px', position: 'sticky', top: '1rem' }}>
            <div className="glass-panel" style={{ padding: '1rem', borderTop: '4px solid #3b82f6' }}>
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ margin: 0, fontSize: '1.2rem' }}>{activeProduct.name}</h4>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                  SKU: {activeProduct.sku || '—'} | System Qty: <strong>{activeProduct.systemQty}</strong>
                </div>
              </div>

              {/* Physical Count */}
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontSize: '0.9rem', fontWeight: 600 }}>Physical Count</label>
                <input
                  type="number"
                  className="form-input"
                  min="0"
                  value={productCounts[activeProduct.id]?.counted || ''}
                  onChange={e => setProductCounts(prev => ({
                    ...prev,
                    [activeProduct.id]: { ...prev[activeProduct.id], counted: e.target.value }
                  }))}
                  style={{ fontSize: '1.1rem', fontWeight: 600 }}
                />
              </div>

              {/* Scan Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '1rem' }}>
                {[
                  { id: 'instock', label: 'In Stock' },
                  { id: 'returns', label: 'Returns' },
                  { id: 'damaged', label: 'Damaged' },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setScanTarget(t.id)}
                    style={{
                      flex: 1, padding: '8px', background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '0.9rem', fontWeight: scanTarget === t.id ? 600 : 400,
                      color: scanTarget === t.id ? '#3b82f6' : 'var(--color-text-secondary)',
                      borderBottom: scanTarget === t.id ? '2px solid #3b82f6' : '2px solid transparent',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Active Tab Content */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Scanned QR Codes</span>
                  <button
                    className="btn-icon"
                    onClick={() => setShowScanner(!showScanner)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                    title="Scan QR Code"
                    aria-label="Scan QR Code"
                  >
                    {Icons.camera}
                  </button>
                </div>

                <QrScanner 
                  isOpen={showScanner} 
                  onClose={() => setShowScanner(false)} 
                  onScan={handleScan} 
                  continuous={true} 
                />

                {scanFeedback && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px', marginBottom: '8px', fontSize: '0.8rem', borderRadius: '4px', background: scanFeedback.type === 'success' ? 'color-mix(in srgb, var(--color-success) 10%, transparent)' : 'color-mix(in srgb, var(--color-warning) 10%, transparent)', color: scanFeedback.type === 'success' ? 'var(--color-success)' : 'var(--color-warning)' }}>
                    <span aria-hidden="true" style={{ display: 'inline-flex' }}>{scanFeedback.type === 'success' ? Icons.checkCircle : Icons.alertTriangle}</span>
                    {scanFeedback.message}
                  </div>
                )}

                <div style={{ 
                  minHeight: '80px', padding: '8px', borderRadius: '4px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)' 
                }}>
                  {(() => {
                    const listKey = scanTarget === 'instock' ? 'scannedQrs' : scanTarget === 'returns' ? 'returnQrs' : 'damagedQrs';
                    const qrs = productCounts[activeProduct.id]?.[listKey] || [];
                    if (qrs.length === 0) return <div style={{ opacity: 0.5, fontSize: '0.85rem', textAlign: 'center', marginTop: '1rem' }}>No QR codes scanned</div>;
                    return (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {qrs.map(qr => (
                          <span key={qr} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', fontSize: '0.8rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                            {qr}
                            <button onClick={() => removeQr(listKey, qr)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 0 }}>×</button>
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Save */}
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={saveProductCount}
                disabled={!productCounts[activeProduct.id]?.counted}
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
