export default function PageLoader({ text = "Loading..." }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '400px',
      height: '100%',
      padding: '2rem'
    }}>
      <div className="spinner" style={{ 
        width: '40px', 
        height: '40px', 
        borderWidth: '3px',
        marginBottom: '1rem' 
      }}></div>
      <p style={{ 
        color: 'var(--color-text-secondary)',
        fontSize: '1.1rem',
        fontWeight: 500
      }}>{text}</p>
    </div>
  );
}
