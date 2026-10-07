import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../lib/AuthContext';

export default function SavedViews({ name }) {
  const { businessId, user } = useAuthContext();
  const location = useLocation();
  const navigate = useNavigate();
  const key = `quaderp:views:${businessId}:${user?.id}:${name}`;
  const [label, setLabel] = useState('');
  const [revision, setRevision] = useState(0);
  let views = [];
  try { views = JSON.parse(localStorage.getItem(key) || '[]'); if (!Array.isArray(views)) views = []; else views = views.filter(view=>typeof view?.label==='string' && typeof view?.search==='string'); } catch { /* optional preference */ }
  const save = () => {
    try {
      localStorage.setItem(key, JSON.stringify([...views.filter(v => v.label !== label.trim()), { label: label.trim(), search: location.search }].slice(-12)));
      setLabel(''); setRevision(revision + 1);
    } catch { /* The current URL remains usable when storage is unavailable. */ }
  };
  return <details className="workspace-saved-views"><summary>Saved views</summary>
    <div className="workspace-toolbar">
      {views.map(view => <span key={view.label} className="workspace-saved-item"><button className="btn btn-secondary btn-sm" onClick={() => navigate({ pathname: location.pathname, search: view.search })}>{view.label}</button><button className="btn btn-ghost btn-sm" aria-label={`Remove saved view ${view.label}`} onClick={() => { try { localStorage.setItem(key, JSON.stringify(views.filter(v => v.label !== view.label))); setRevision(revision + 1); } catch { /* preference */ } }}>×</button></span>)}
      <label>View name<input className="form-input" value={label} maxLength={40} onChange={e => setLabel(e.target.value)} placeholder="e.g. Osu low stock" /></label>
      <button className="btn btn-secondary" disabled={!label.trim()} onClick={save}>Save current view</button>
    </div>
  </details>;
}
