/**
 * LetterheadRenderer — Shared component for rendering letterhead header/footer
 * on receipts, invoices, and other printable documents.
 * 
 * Usage:
 *   <LetterheadRenderer 
 *     letterhead={business.letterhead}
 *     logoUrl={business.logo_url}
 *     businessName={business.name}
 *     showFooter={true}
 *   />
 */
export default function LetterheadRenderer({ letterhead, logoUrl, businessName, showFooter = false }) {
  // Fallback if no letterhead configured
  if (!letterhead || Object.keys(letterhead).length === 0) {
    return (
      <div style={{ textAlign: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase' }}>
          {businessName || 'STORE APP'}
        </h2>
      </div>
    );
  }

  const displayName = letterhead.company_name || businessName || 'Store App';
  const accentColor = letterhead.accent_color || '#4338ca';
  const showBorder = letterhead.show_border !== false;
  const showLogo = letterhead.show_logo !== false;

  return (
    <>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingBottom: showBorder ? '12px' : '8px',
        marginBottom: '16px',
        borderBottom: showBorder ? `2px solid ${accentColor}` : 'none'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {showLogo && logoUrl && (
            <img
              src={logoUrl}
              alt="Logo"
              style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'contain' }}
            />
          )}
          <div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: accentColor, letterSpacing: '-0.01em' }}>
              {displayName}
            </div>
            {letterhead.tagline && (
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '1px' }}>
                {letterhead.tagline}
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: '0.65rem', color: '#64748b', lineHeight: 1.6 }}>
          {letterhead.address && <div>{letterhead.address}</div>}
          {letterhead.phone && <div>Tel: {letterhead.phone}</div>}
          {letterhead.email && <div>{letterhead.email}</div>}
          {letterhead.registration_no && <div>Reg: {letterhead.registration_no}</div>}
        </div>
      </div>

      {/* Footer (optional, rendered at caller's discretion via showFooter) */}
      {showFooter && letterhead.footer_text && (
        <div style={{
          textAlign: 'center',
          paddingTop: '12px',
          marginTop: '24px',
          borderTop: showBorder ? `1px solid ${accentColor}40` : 'none',
          fontSize: '0.75rem',
          color: '#94a3b8'
        }}>
          {letterhead.footer_text}
        </div>
      )}
    </>
  );
}

/**
 * LetterheadFooter — Standalone footer for use at the bottom of documents
 * when the header and footer need to be separate (e.g., wrapping receipt content).
 */
export function LetterheadFooter({ letterhead }) {
  if (!letterhead?.footer_text) return null;
  
  const accentColor = letterhead.accent_color || '#4338ca';
  const showBorder = letterhead.show_border !== false;

  return (
    <div style={{
      textAlign: 'center',
      paddingTop: '12px',
      marginTop: '24px',
      borderTop: showBorder ? `1px solid ${accentColor}40` : 'none',
      fontSize: '0.75rem',
      color: '#94a3b8'
    }}>
      {letterhead.footer_text}
    </div>
  );
}
