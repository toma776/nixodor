// Publicarea pe site-ul online: baza locală (data/brain.db) și fișierele media intră în deploy.
//   npm run publish            copia publică a bazei + media, commit și push; Vercel publică în ~1 minut
//   npm run publish -- --local doar pregătește fișierele (fără commit și push)
// Copia publică nu are conturi, sesiuni sau încercări de login: repository-ul e public.
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync, rmSync, copyFileSync, existsSync, statSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {ROOT, DATA} from '../src/app.mjs';

const SRC = join(DATA, 'brain.db'), OUT_DIR = join(ROOT, 'site-data'), OUT = join(OUT_DIR, 'brain.db');
const PUBLIC_MEDIA = join(ROOT, 'public/media');

// 1. copia bazei: consistentă (VACUUM INTO citește tot, inclusiv WAL), fără datele private
mkdirSync(OUT_DIR, {recursive: true});
rmSync(OUT, {force: true});
const src = new DatabaseSync(SRC);
src.exec(`VACUUM INTO '${OUT.replace(/'/g, "''")}'`);
src.close();
const out = new DatabaseSync(OUT);
out.exec(`DELETE FROM sessions; DELETE FROM users; DELETE FROM login_attempts; PRAGMA journal_mode = DELETE; VACUUM;`);
const counts = out.prepare(`SELECT (SELECT COUNT(*) FROM product_lines WHERE status = 'published') game, (SELECT COUNT(*) FROM media) media`).get();
const files = out.prepare('SELECT id, name, file FROM media').all();
out.close();

// 2. toate fișierele media, la adresa pe care o folosesc paginile (/media/<id>/<nume>), servite static de Vercel
rmSync(PUBLIC_MEDIA, {recursive: true, force: true});
let copied = 0;
for (const m of files) {
  const from = join(DATA, 'media', m.file);
  if (!existsSync(from)) { console.warn(`lipsește fișierul pentru media ${m.id} (${m.name})`); continue; }
  const to = join(PUBLIC_MEDIA, String(m.id), m.name);
  mkdirSync(dirname(to), {recursive: true});
  copyFileSync(from, to);
  copied++;
}
console.log(`Pregătit: baza (${Math.round(statSync(OUT).size / 1024)} KB, ${counts.game} game publicate) și ${copied} fișiere media.`);

// 3. commit și push: Vercel publică singur
if (!process.argv.includes('--local')) {
  const git = (...a) => execFileSync('git', a, {cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit']}).toString().trim();
  git('add', 'site-data', 'public/media');
  if (!git('diff', '--cached', '--name-only', '--', 'site-data', 'public/media')) { console.log('Nimic nou de publicat.'); process.exit(0); }
  git('commit', '-m', `Publicare conținut ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, '--', 'site-data', 'public/media');
  git('push', '-q', 'origin', 'HEAD');
  console.log('Publicat: Vercel pune versiunea nouă pe site în aproximativ un minut.');
}
