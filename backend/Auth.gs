/**
 * Auth.gs
 * =============================================================================
 * Lightweight, school-friendly authentication.
 *
 *  - Login with email + PIN. We store only a hash of the PIN (never the PIN).
 *  - On success we mint a random session token, cache it server-side for 6h,
 *    and return it. The frontend sends it back on every write request.
 *  - Roles: admin (full), teacher (manage own tasks), viewer (read-only).
 *  - SCANNING NEEDS NO LOGIN — pupils just scan and go.
 *
 * This is intentionally simple (a kiosk in a classroom, not a bank). It keeps
 * casual users out and ties writes to a named teacher for the audit trail.
 * =============================================================================
 */

var SESSION_TTL = 6 * 60 * 60; // 6 hours in seconds

/** Log in. Returns { token, user } or throws. */
function login(email, pin) {
  email = clean(email).toLowerCase();
  var user = null;
  readAll(SHEETS.USERS).forEach(function (u) {
    if (String(u.email).toLowerCase() === email) user = u;
  });
  if (!user) throw new Error('No account for that email.');
  if (String(user.status) !== 'Active') throw new Error('Account is not active.');
  if (String(user.pinHash) !== hashPin(pin)) throw new Error('Wrong PIN.');

  var token = uid('S') + randomSuffix(8);
  var session = { userId: user.userId, name: user.name, role: user.role, email: user.email };
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify(session), SESSION_TTL);

  return { token: token, user: session };
}

/** Resolve a session token to a user, or null if invalid/expired. */
function getSession(token) {
  if (!token) return null;
  var raw = CacheService.getScriptCache().get('sess_' + clean(token));
  return raw ? JSON.parse(raw) : null;
}

/** Throw unless the session has one of the allowed roles. Returns the session. */
function requireRole(token, allowedRoles) {
  var s = getSession(token);
  if (!s) throw new Error('Not signed in (session expired). Please log in again.');
  if (allowedRoles && allowedRoles.indexOf(s.role) === -1) {
    throw new Error('Your role (' + s.role + ') cannot perform this action.');
  }
  return s;
}

/** Log out (invalidate the session token). */
function logout(token) {
  CacheService.getScriptCache().remove('sess_' + clean(token));
  return true;
}

/** Admin-only: create a new user with a starting PIN. */
function createUser(session, payload) {
  var ids = readAll(SHEETS.USERS).map(function (u) { return u.userId; });
  var user = {
    userId: nextId('U', ids),
    name: clean(payload.name),
    email: clean(payload.email).toLowerCase(),
    role: ENUMS && CONFIG.ROLES.indexOf(payload.role) !== -1 ? payload.role : 'teacher',
    pinHash: hashPin(payload.pin || '1234'),
    status: 'Active',
    createdAt: nowIso(),
  };
  appendRow(SHEETS.USERS, user);
  delete user.pinHash;
  return user;
}
