const crypto = require('crypto');

const ADMIN_PASSWORD = 'Treadstone71!';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// splits the cookie header into a proper object — handy
function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(
    raw.split(';').map(s => s.trim().split('=').map(decodeURIComponent))
  );
}

// creates a fresh session token and registers it with an expiry
function createSession() {
  const token = generateToken();
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function isValidSession(token) {
  if (!token || !sessions.has(token)) return false;
  if (Date.now() > sessions.get(token)) { sessions.delete(token); return false; }
  return true;
}

function destroySession(token) {
  sessions.delete(token);
}

// middleware that boots you back to login if you're not authenticated
function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  if (isValidSession(cookies.admin_session)) return next();
  res.redirect('/admin/login');
}

module.exports = { ADMIN_PASSWORD, createSession, destroySession, parseCookies, isValidSession, requireAuth };
