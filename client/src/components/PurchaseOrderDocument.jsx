import { useRef } from 'react';
import LetterheadRenderer, { LetterheadFooter } from './LetterheadRenderer';

/**
 * PurchaseOrderDocument — Printable Goods Received Note / Purchase Order document.
 * 
 * Future-proofed: accepts both simple stock-in data AND full PO workflow data.
 * When a PO workflow is built later, pass the PO object with supplier, PO number, etc.
 * 
 * Props:
 *   @param {Object} business - Business object with letterhead, logo_url, name
 *   @param {Object} [purchaseOrder] - Full PO object (future: { po_number, supplier, expected_date, ... })
 *   @param {Array} items - Array of { product_name, sku, quantity, unit_cost, notes }
 *   @param {string} [receivedBy] - Name of person who received goods
 *   @param {string} [date] - Date of receipt (ISO string)
 *   @param {string} [referenceNumber] - GRN/Reference number
 *   @param {string} [notes] - General notes
 *   @param {Function} fmt - Currency formatter function
 *   @param {string} [documentType] - 'grn' | 'purchase_order' (default: 'grn')
 */
export default function PurchaseOrderDocument({
  business,
  purchaseOrder,
  items = [],
  receivedBy,
  date,
  referenceNumber,
  notes,
  fmt,
  documentType = 'grn',
}) {
  const docDate = date ? new Date(date) : new Date();
  const isGRN = documentType === 'grn';
  const title = isGRN ? 'GOODS RECEIVED NOTE' : 'PURCHASE ORDER';
  const refLabel = isGRN ? 'GRN No' : 'PO No';
  const poNumber = purchaseOrder?.po_number;
  const fallbackRef = useRef(`GRN-${Date.now().toString(36).toUpperCase()}`);
  const refNumber = referenceNumber || poNumber || fallbackRef.current;

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + ((item.unit_cost || 0) * (item.quantity || 0)), 0);

  // Supplier info from PO (future-proofed)
  const supplier = purchaseOrder?.supplier || null;

  return (
    <div
      id="printable-grn"
      className="printable-area print-format-a4"
      style={{
        padding: '40px',
        background: '#fff',
        color: '#1e293b',
        fontFamily: '"Inter", -apple-system, sans-serif',
        maxWidth: '850px',
        width: '100%',
        margin: '0 auto',
      }}
    >
      {/* ─── Letterhead Header ─── */}
      <LetterheadRenderer
        letterhead={business?.letterhead}
        logoUrl={business?.logo_url}
        businessName={business?.name}
      />

      {/* ─── Document Title ─── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '24px',
        paddingBottom: '16px',
        borderBottom: '2px solid #e2e8f0',
      }}>
        <div>
          <h2 style={{
            margin: 0,
            fontSize: '1.4rem',
            fontWeight: 800,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: '#334155',
          }}>
            {title}
          </h2>
          {purchaseOrder?.status && (
            <div style={{
              marginTop: '4px',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: purchaseOrder.status === 'received' ? '#10b981' : '#f59e0b',
              textTransform: 'uppercase',
            }}>
              Status: {purchaseOrder.status}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', fontSize: '0.85rem', color: '#64748b', lineHeight: 1.7 }}>
          <div><strong>{refLabel}:</strong> <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{refNumber}</span></div>
          <div><strong>Date:</strong> {docDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          {receivedBy && <div><strong>Received By:</strong> {receivedBy}</div>}
        </div>
      </div>

      {/* ─── Supplier Info (future PO workflow) ─── */}
      {supplier && (
        <div style={{
          marginBottom: '24px',
          padding: '16px',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '8px', letterSpacing: '1px' }}>
            Supplier
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>{supplier.name}</div>
          {supplier.contact_person && <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{supplier.contact_person}</div>}
          {supplier.phone && <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Tel: {supplier.phone}</div>}
          {supplier.email && <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{supplier.email}</div>}
          {supplier.address && <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{supplier.address}</div>}
        </div>
      )}

      {/* ─── Items Table ─── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #334155' }}>
            <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b' }}>#</th>
            <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b' }}>Product</th>
            <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b' }}>SKU</th>
            <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b' }}>Qty</th>
            {items.some(i => i.unit_cost) && (
              <>
                <th style={{ textAlign: 'right', padding: '10px 8px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b' }}>Unit Cost</th>
                <th style={{ textAlign: 'right', padding: '10px 8px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b' }}>Total</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '10px 8px', fontSize: '0.85rem', color: '#94a3b8' }}>{idx + 1}</td>
              <td style={{ padding: '10px 8px', fontWeight: 600 }}>{item.product_name || 'Unknown'}</td>
              <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: '0.85rem', color: '#64748b' }}>{item.sku || '—'}</td>
              <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700 }}>{item.quantity}</td>
              {items.some(i => i.unit_cost) && (
                <>
                  <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                    {item.unit_cost ? fmt(item.unit_cost) : '—'}
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                    {item.unit_cost ? fmt(item.unit_cost * item.quantity) : '—'}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {/* ─── Summary ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        {/* Notes */}
        <div style={{ flex: 1, marginRight: '40px' }}>
          {notes && (
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '4px' }}>Notes</div>
              <div style={{ fontSize: '0.85rem', color: '#475569', padding: '8px 12px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                {notes}
              </div>
            </div>
          )}
        </div>

        {/* Totals */}
        <div style={{ minWidth: '200px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '0.85rem', color: '#64748b' }}>
            <span>Total Items:</span>
            <span style={{ fontWeight: 700 }}>{items.reduce((sum, i) => sum + (i.quantity || 0), 0)}</span>
          </div>
          {subtotal > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '0.85rem', color: '#64748b', borderTop: '1px solid #e2e8f0' }}>
                <span>Subtotal:</span>
                <span style={{ fontWeight: 600 }}>{fmt(subtotal)}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '10px 0',
                fontSize: '1.1rem',
                fontWeight: 800,
                borderTop: '2px solid #334155',
                color: '#0f172a',
              }}>
                <span>Total:</span>
                <span>{fmt(subtotal)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Signatures ─── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '48px',
        marginTop: '48px',
        paddingTop: '16px',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: '1.5px solid #334155', paddingTop: '6px', fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center' }}>
            Received By
          </div>
          {receivedBy && (
            <div style={{ textAlign: 'center', fontSize: '0.85rem', fontWeight: 600, marginTop: '4px' }}>{receivedBy}</div>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: '1.5px solid #334155', paddingTop: '6px', fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center' }}>
            Authorized By
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: '1.5px solid #334155', paddingTop: '6px', fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center' }}>
            Date
          </div>
          <div style={{ textAlign: 'center', fontSize: '0.85rem', marginTop: '4px' }}>
            {docDate.toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* ─── Footer ─── */}
      <LetterheadFooter letterhead={business?.letterhead} />
    </div>
  );
}
