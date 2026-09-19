// Business Admin has every tenant permission at runtime, including permissions
// added after its seed role was created. Delegation must use the same authority.
function canGrantPermissions(actor, permissions) {
  if (!Array.isArray(permissions) || permissions.some(p => typeof p !== 'string')) return false;
  if (actor.role === 'Platform Admin') return true;
  return permissions.every(p => p !== 'manage_platform' &&
    (actor.role === 'Business Admin' || actor.permissions?.includes(p)));
}

function canAssignRole(actor, role, businessId = actor.business_id) {
  if (!role || (role.business_id != null && role.business_id !== businessId)) return false;
  if (actor.role === 'Platform Admin') return true;
  if (role.name === 'Platform Admin') return false;
  if (role.name === 'Business Admin' && actor.role !== 'Business Admin') return false;
  return canGrantPermissions(actor, role.permissions || []);
}

module.exports = { canGrantPermissions, canAssignRole };
