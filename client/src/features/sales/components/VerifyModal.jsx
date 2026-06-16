import Modal from '../../../components/Modal';

export default function VerifyModal({ isOpen, onClose, customerToVerify, verifyCode, setVerifyCode, handleVerifyCode }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Verify Phone Number">
      <div className="card" style={{ marginBottom: '1rem', background: 'var(--surface-50)' }}>
        <p>A verification code was sent via SMS to <strong>{customerToVerify?.phone}</strong>.</p>
        <p className="text-muted" style={{ marginTop: '0.5rem' }}>Please ask the customer for the code.</p>
      </div>
      <form onSubmit={handleVerifyCode} className="form-layout">
        <div className="form-group">
          <label htmlFor="verify-code">6-Digit Code</label>
          <input 
            type="text" 
            id="verify-code" 
            className="form-input text-mono text-center" 
            maxLength="6" 
            required 
            value={verifyCode}
            onChange={e => setVerifyCode(e.target.value)} 
            placeholder="000000" 
            style={{ fontSize: '1.5rem', letterSpacing: '0.25em' }}
          />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={verifyCode.length < 6}>Verify</button>
        </div>
      </form>
    </Modal>
  );
}
