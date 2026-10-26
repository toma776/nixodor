// Autorizarea se face pe server, la fiecare cerere (§1.9). Parole scrypt, login limitat,
// cookie HttpOnly. Fără parolă doar pe localhost.
import {scryptSync, randomBytes, timingSafeEqual} from 'node:crypto';
import {PERMS} from '../registry/entities.mjs';
import {nowIso} from '../core/db.mjs';

export const hashPassword = pw => { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(pw, salt, 64).toString('hex')}`; };
const verify = (pw, stored) => {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const a = scryptSync(pw, salt, 64), b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
};

export const isLocal = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && !req.headers['x-forwarded-for'];
const cookies = req => Object.fromEntries((req.headers.cookie ?? '').split(';').map(c => c.trim().split('=').map(decodeURIComponent)).filter(c => c[0]));
const asUser = u => ({id: u.id, name: u.name, email: u.email, role: u.role, perms: new Set(PERMS[u.role] ?? [])});

export function createAuth(db) {
  const q = sql => db.prepare(sql);
  return {
    user(req) {
      const sid = cookies(req).nx_session;
      if (sid) {
        const u = q(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?`).get(sid, nowIso());
        if (u) return asUser(u);
      }
      if (isLocal(req) && process.env.NIXODOR_LOCAL_ADMIN !== '0') return {id: null, name: 'Local', role: 'admin', perms: new Set(PERMS.admin), local: true};
      return null;
    },
    login(email, password, ip) {
      const since = new Date(Date.now() - 15 * 60000).toISOString();
      if (q('SELECT COUNT(*) n FROM login_attempts WHERE ip = ? AND at > ?').get(ip, since).n >= 10) return {error: 'Prea multe încercări. Reîncearcă peste 15 minute.'};
      const u = q('SELECT * FROM users WHERE email = ?').get(String(email ?? '').toLowerCase().trim());
      if (!u || !verify(String(password ?? ''), u.password)) { q('INSERT INTO login_attempts (ip, at) VALUES (?, ?)').run(ip, nowIso()); return {error: 'Email sau parolă greșită.'}; }
      const token = randomBytes(32).toString('hex');
      q('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(token, u.id, nowIso(), new Date(Date.now() + 14 * 864e5).toISOString());
      return {token, user: asUser(u)};
    },
    logout(req) { const sid = cookies(req).nx_session; if (sid) q('DELETE FROM sessions WHERE token = ?').run(sid); },
    addUser(email, name, role, password) {
      q('INSERT INTO users (email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?)').run(email.toLowerCase(), name, role, hashPassword(password), nowIso());
    },
    // Scrierile venite din alt site sunt refuzate (verificarea Origin).
    sameOrigin(req) {
      const origin = req.headers.origin ?? req.headers.referer;
      if (!origin) return true;
      try { return new URL(origin).host === req.headers.host; } catch { return false; }
    }
  };
}
