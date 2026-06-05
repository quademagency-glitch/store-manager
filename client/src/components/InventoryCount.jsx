import { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import QrScanner from '../components/QrScanner';

/**
 * InventoryCount — Full inventory count flow:
 * Step 1: Select branch → Start session
 * Step 2: View all products grouped by category/model
 * Step 3: Click a model → open count form (qty, QR scans for in-stock/returns/damaged)
 * Step 4: Save model → green (match) or red (discrepancy)
 */
export default function InventoryCount({ locations, products }) {
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
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Load sessions on mount
  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    setSessionsLoading(true);
    try {
      const data = await api.get('/stocktake');
      setSessions(Array.isArray(data) ? data : []);
    } catch { setSessions([]); }
    setSessionsLoading(false);
  };

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
      alert(err.message || 'Failed to start inventory count');
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
      setScanFeedback({ type: 'warning', message: `⚠️ Already scanned: ${qrCode}` });
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

    setScanFeedback({ type: 'success', message: `✅ Scanned: ${qrCode}` });

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

  // Complete the entire inventory count
  const completeCount = async () => {
    if (!session) return;
    if (!confirm('Complete this inventory count? All uncounted items will be flagged.')) return;
    setCompleting(true);
    try {
      const result = await api.put(`/stocktake/${session.id}/complete`);
      alert(`Inventory count completed. ${result.summary?.missing || 0} discrepancies flagged.`);
      setStep('select');
      setSession(null);
      setActiveProduct(null);
      setProductCounts({});
      await fetchSessions();
    } catch (err) {
      alert(err.message || 'Failed to complete count');
    }
    setCompleting(false);
  };

  // Cancel session
  const cancelCount = async () => {
    if (!session) return;
    if (!confirm('Cancel this inventory count?')) return;
    try {
      await api.put(`/stocktake/${session.id}/cancel`);
      setStep('select');
      setSession(null);
      setActiveProduct(null);
      setProductCounts({});
      await fetchSessions();
    } catch (err) {
      alert(err.message || 'Failed to cancel');
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
          <h3 style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '1.2rem' }}>📋 New Inventory Count</h3>
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
              </tr>
            </thead>
            <tbody>
              {sessionsLoading ? (
                <tr><td colSpan="7" className="text-center py-xl text-muted"><div className="spinner mx-auto mb-sm" /><p>Loading...</p></td></tr>
              ) : sessions.length === 0 ? (
                <tr><td colSpan="7" style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>No inventory counts yet.</td></tr>
              ) : sessions.map(s => (
                <tr key={s.id}>
                  <td className="text-muted">{new Date(s.created_at).toLocaleDateString()}</td>
                  <td>{s.location?.name || 'Unknown'}</td>
                  <td>
                    <span className={`badge ${s.status === 'completed' ? 'badge-success' : s.status === 'cancelled' ? 'badge-secondary' : 'badge-warning'}`}>
                      {s.status}
                    </span>
                  </td>
                  <td>{s.expected_count}</td>
                  <td>{s.scanned_count}</td>
                  <td style={{ color: s.missing_count > 0 ? '#ef4444' : '#22c55e', fontWeight: 600 }}>{s.missing_count}</td>
                  <td>{s.starter?.name || 'Unknown'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Step 2 & 3: Counting — product list with active product form
  return (
    <div>
      {/* Header Bar */}
      <div className="glass-panel" style={{ padding: '1rem 1.5rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 style={{ fontWeight: 600, margin: 0, fontSize: '1.1rem' }}>
            📋 Inventory Count — {locations.find(l => l.id === selectedLocationId)?.name || 'Unknown'}
          </h3>
          <div style={{ fontSize: '0.85rem', opacity: 0.6, marginTop: '4px' }}>
            {countedCount} / {totalProducts} products counted
            {matchCount > 0 && <span style={{ color: '#22c55e', marginLeft: '8px' }}>✅ {matchCount} match</span>}
            {discrepancyCount > 0 && <span style={{ color: '#ef4444', marginLeft: '8px' }}>❌ {discrepancyCount} discrepancies</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-sm btn-secondary" onClick={cancelCount}>Cancel</button>
          <button 
            className="btn btn-sm" 
            style={{ background: '#22c55e', color: 'white' }} 
            onClick={completeCount}
            disabled={completing}
          >
            {completing ? 'Completing...' : '✅ Complete Count'}
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
                      {status === 'match' && <span style={{ color: '#22c55e', fontWeight: 700, fontSize: '1.1rem' }}>✅</span>}
                      {status === 'discrepancy' && <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '1.1rem' }}>❌</span>}
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
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              {/* Product Header */}
              <div style={{ 
                padding: '12px 16px', marginBottom: '1.5rem', borderRadius: '8px',
                background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)'
              }}>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{activeProduct.name}</div>
                <div style={{ fontSize: '0.85rem', opacity: 0.6, marginTop: '2px' }}>
                  SKU: {activeProduct.sku || '—'} · Category: {activeProduct.category || 'None'} · System: <strong>{activeProduct.systemQty}</strong>
                </div>
              </div>

              {/* Physical Count */}
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>📝 Physical Count</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="Enter number counted..."
                  min="0"
                  value={productCounts[activeProduct.id]?.counted || ''}
                  onChange={e => setProductCounts(prev => ({
                    ...prev,
                    [activeProduct.id]: { ...prev[activeProduct.id], counted: e.target.value }
                  }))}
                  style={{ fontSize: '1.2rem', fontWeight: 600, textAlign: 'center' }}
                />
              </div>

              {/* Scan Target Selector */}
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
                {[
                  { id: 'instock', label: '📦 In Stock', color: '#3b82f6' },
                  { id: 'returns', label: '🔄 Returns', color: '#f59e0b' },
                  { id: 'damaged', label: '💥 Damaged', color: '#ef4444' },
                ].map(t => (
                  <button
                    key={t.id}
                    className={`btn btn-sm ${scanTarget === t.id ? '' : 'btn-outline'}`}
                    style={scanTarget === t.id ? { background: t.color, color: 'white', flex: 1 } : { flex: 1 }}
                    onClick={() => setScanTarget(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Scanner Toggle */}
              <button
                className="btn btn-primary btn-sm"
                style={{ width: '100%', marginBottom: '0.75rem' }}
                onClick={() => setShowScanner(!showScanner)}
              >
                {showScanner ? '⏹ Close Scanner' : '📷 Open QR Scanner'}
              </button>

              {showScanner && (
                <div style={{ marginBottom: '1rem', borderRadius: '8px', overflow: 'hidden' }}>
                  <QrScanner onScan={handleScan} continuous={true} />
                </div>
              )}

              {/* Scan Feedback */}
              {scanFeedback && (
                <div style={{
                  padding: '8px 12px', borderRadius: '6px', marginBottom: '0.75rem', fontSize: '0.85rem', fontWeight: 500,
                  background: scanFeedback.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.15)',
                  color: scanFeedback.type === 'success' ? '#22c55e' : '#f59e0b'
                }}>
                  {scanFeedback.message}
                </div>
              )}

              {/* QR Code Lists */}
              {[
                { key: 'scannedQrs', label: '📦 In-Stock Scanned', color: '#3b82f6' },
                { key: 'returnQrs', label: '🔄 Returns Scanned', color: '#f59e0b' },
                { key: 'damagedQrs', label: '💥 Damaged Scanned', color: '#ef4444' },
              ].map(({ key, label, color }) => {
                const qrs = productCounts[activeProduct.id]?.[key] || [];
                return (
                  <div key={key} style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px', color }}>
                      {label} ({qrs.length})
                    </div>
                    <div style={{ 
                      minHeight: '40px', padding: '8px', borderRadius: '6px',
                      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)'
                    }}>
                      {qrs.length === 0 ? (
                        <span style={{ fontSize: '0.8rem', opacity: 0.3 }}>No codes scanned</span>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {qrs.map(qr => (
                            <span key={qr} style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem',
                              background: `${color}22`, color, fontFamily: 'monospace'
                            }}>
                              {qr}
                              <button
                                onClick={() => removeQr(key, qr)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color, fontSize: '0.8rem', padding: 0 }}
                              >×</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Summary */}
              {(() => {
                const pc = productCounts[activeProduct.id];
                const physCount = parseInt(pc?.counted, 10) || 0;
                const totalScanned = (pc?.scannedQrs?.length || 0) + (pc?.returnQrs?.length || 0) + (pc?.damagedQrs?.length || 0);
                const isMatch = physCount === activeProduct.systemQty && totalScanned === physCount;
                return (
                  <div style={{
                    padding: '10px 14px', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem',
                    background: !pc?.counted ? 'rgba(255,255,255,0.03)' : isMatch ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${!pc?.counted ? 'rgba(255,255,255,0.05)' : isMatch ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>System Qty:</span><strong>{activeProduct.systemQty}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Physical Count:</span><strong>{physCount}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Total QR Scanned:</span><strong>{totalScanned}</strong>
                    </div>
                    {pc?.counted && (
                      <div style={{ marginTop: '6px', fontWeight: 600, color: isMatch ? '#22c55e' : '#ef4444' }}>
                        {isMatch ? '✅ All matched' : `⚠️ Discrepancy: ${physCount - activeProduct.systemQty > 0 ? '+' : ''}${physCount - activeProduct.systemQty} units`}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Save Button */}
              <button
                className="btn btn-primary"
                style={{ width: '100%', fontSize: '1rem' }}
                onClick={saveProductCount}
                disabled={!productCounts[activeProduct.id]?.counted}
              >
                Save & Return to List
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
