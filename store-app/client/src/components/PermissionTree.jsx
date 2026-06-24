import React, { useState } from 'react';
import { PERMISSION_TREE, getLeafIds } from '../constants/permissions';

const CheckboxIcon = ({ checked, indeterminate }) => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginRight: '10px' }}>
    <rect x="0.5" y="0.5" width="15" height="15" rx="4" fill={checked || indeterminate ? 'var(--color-accent-primary)' : 'var(--color-bg-tertiary)'} stroke={checked || indeterminate ? 'var(--color-accent-primary)' : 'var(--color-border)'} />
    {checked && !indeterminate && <path d="M4 8.5L7 11.5L12 5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
    {indeterminate && <path d="M4 8H12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
  </svg>
);

const TreeNode = ({ node, selectedPermissions, onChange, level = 0 }) => {
  const [expanded, setExpanded] = useState(level === 0); // Auto-expand top level
  const isLeaf = !node.children || node.children.length === 0;

  const leafIds = getLeafIds(node);
  const selectedCount = leafIds.filter(id => selectedPermissions.includes(id)).length;
  
  const checked = selectedCount === leafIds.length && leafIds.length > 0;
  const indeterminate = selectedCount > 0 && selectedCount < leafIds.length;

  const handleToggle = () => {
    let newSelected = [...selectedPermissions];
    if (checked) {
      // Uncheck all
      newSelected = newSelected.filter(id => !leafIds.includes(id));
    } else {
      // Check all
      const toAdd = leafIds.filter(id => !newSelected.includes(id));
      newSelected = [...newSelected, ...toAdd];
    }
    onChange(newSelected);
  };

  return (
    <div style={{ marginLeft: level > 0 ? '28px' : '0', marginTop: level === 0 ? '16px' : '8px' }}>
      <div style={{ 
        display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none',
        padding: '8px', borderRadius: 'var(--radius-sm)',
        background: level === 0 ? 'var(--color-bg-tertiary)' : 'transparent',
        border: level === 0 ? '1px solid var(--color-border)' : 'none'
      }}>
        {!isLeaf && (
          <div onClick={() => setExpanded(!expanded)} style={{ width: '24px', height: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '4px', background: 'var(--color-bg-primary)', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--color-text-secondary)' }}>
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
        {isLeaf && <div style={{ width: '28px' }} />}
        <div onClick={handleToggle} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          <CheckboxIcon checked={checked} indeterminate={indeterminate} />
          <span style={{ 
            fontSize: level === 0 ? '1rem' : (isLeaf ? '0.9rem' : '0.95rem'), 
            fontWeight: level === 0 ? 600 : (isLeaf ? 400 : 500), 
            color: level === 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' 
          }}>
            {node.label}
          </span>
          {level === 0 && (
            <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--color-text-muted)', background: 'var(--color-bg-primary)', padding: '2px 8px', borderRadius: '12px' }}>
              {selectedCount} / {leafIds.length}
            </span>
          )}
        </div>
      </div>
      
      {!isLeaf && expanded && (
        <div style={{ 
          borderLeft: '1px dashed var(--color-border)', 
          marginLeft: '12px', 
          paddingLeft: '4px',
          paddingBottom: level === 0 ? '8px' : '0'
        }}>
          {node.children.map(child => (
            <TreeNode 
              key={child.id} 
              node={child} 
              selectedPermissions={selectedPermissions} 
              onChange={onChange} 
              level={level + 1} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default function PermissionTree({ selectedPermissions, onChange }) {
  // Add a "Select All / Deselect All" toggle at the top
  const allLeafIds = getLeafIds({ children: PERMISSION_TREE });
  const allSelectedCount = allLeafIds.filter(id => selectedPermissions.includes(id)).length;
  const isAllChecked = allSelectedCount === allLeafIds.length && allLeafIds.length > 0;
  const isAllIndeterminate = allSelectedCount > 0 && allSelectedCount < allLeafIds.length;

  const handleToggleAll = () => {
    if (isAllChecked) {
      onChange([]);
    } else {
      onChange(allLeafIds);
    }
  };

  return (
    <div className="permission-tree" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px' }}>
        <h4 style={{ margin: 0, color: 'var(--color-text-primary)' }}>Granular Permissions</h4>
        <button 
          type="button"
          onClick={handleToggleAll} 
          style={{ display: 'flex', alignItems: 'center', background: 'transparent', border: '1px solid var(--color-border)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-primary)' }}
        >
          <CheckboxIcon checked={isAllChecked} indeterminate={isAllIndeterminate} />
          {isAllChecked ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      <div style={{ marginTop: '8px' }}>
        {PERMISSION_TREE.map(node => (
          <TreeNode 
            key={node.id} 
            node={node} 
            selectedPermissions={selectedPermissions || []} 
            onChange={onChange} 
          />
        ))}
      </div>
    </div>
  );
}
