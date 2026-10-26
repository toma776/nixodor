// Conturile panoului /manage (online, login-ul e obligatoriu; pe localhost nu e nevoie de cont).
//   npm run user -- add <email> "<Nume>" <admin|editor|viewer>    parola: din NIXODOR_PASSWORD sau generată
//   npm run user -- list
// Rulează pe baza din .env.local (Supabase) sau pe cea locală, la fel ca restul aplicației.
import {randomBytes} from 'node:crypto';
import {createApp} from '../src/app.mjs';
import {createAuth} from '../src/manage/auth.mjs';

const [cmd, email, name, role = 'editor'] = process.argv.slice(2);
const app = createApp({live: false});
const auth = createAuth(app.db);

if (cmd === 'add' && email && name) {
  if (!['admin', 'editor', 'viewer'].includes(role)) throw new Error('rolul e admin, editor sau viewer');
  const password = process.env.NIXODOR_PASSWORD || randomBytes(12).toString('base64url');
  auth.addUser(email, name, role, password);
  console.log(`Cont creat: ${email} (${role}).`);
  if (!process.env.NIXODOR_PASSWORD) console.log(`Parola generată (se afișează o singură dată): ${password}`);
} else if (cmd === 'list') {
  for (const u of app.db.prepare('SELECT email, name, role, created_at FROM users ORDER BY id').all()) console.log(`${u.email}\t${u.name}\t${u.role}\t${u.created_at}`);
} else {
  console.log('Folosire: npm run user -- add <email> "<Nume>" <admin|editor|viewer>  ·  npm run user -- list');
}
app.stop();
