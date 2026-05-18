const ROLES = Object.freeze({
  admin: 'admin',
  employee: 'employee',
});

const DATA_SCOPES = Object.freeze({
  own: 'own',
  assigned: 'assigned',
  team: 'team',
  all: 'all',
});

function canAccessScope(role, scope) {
  if (role === ROLES.admin) return true;
  return scope === DATA_SCOPES.own || scope === DATA_SCOPES.assigned;
}

module.exports = {
  ROLES,
  DATA_SCOPES,
  canAccessScope,
};
