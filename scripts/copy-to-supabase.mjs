// Copiază Brain-ul local (data/brain.db + data/media) în Supabase (DATABASE_URL + Storage).
//   npm run copy:supabase              refuză dacă baza din Supabase are deja conținut
//   npm run copy:supabase -- --replace  golește întâi tabelele din Supabase
// Aceleași ID-uri, o singură tranzacție, apoi verificarea numărului de rânduri pe fiecare tabel.
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {DATA} from '../src/app.mjs';
import {openDb, tx} from '../src/core/db.mjs';
import {createStore} from '../src/core/store.mjs';
import {createMedia} from '../src/core/media.mjs';
import {ENTITIES, BY_KEY, relFields, relTable, targetOf} from '../src/registry/entities.mjs';

const REPLACE = process.argv.includes('--replace');
const url = process.env.DATABASE_URL;
if (!url) throw new Error('Lipsește DATABASE_URL (în .env.local).');
const supabaseUrl = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !key) throw new Error('Lipsesc SUPABASE_URL sau SUPABASE_SECRET_KEY (în .env.local).');

const local = openDb(join(DATA, 'brain.db'));
const pg = openDb(url);

// ordinea: sistemul de bază, media, entitățile în ordinea cheilor străine, legăturile, apoi istoricul și indexul
const order = [], seen = new Set();
const visit = e => {
  if (seen.has(e.key)) return; seen.add(e.key);
  for (const f of e.fields) if ((f.type === 'ref' || f.type === 'image') && targetOf(f) !== e.key) visit(BY_KEY[targetOf(f)]);
  order.push(e.table);
};
ENTITIES.forEach(visit);
const tables = ['sources', 'users', 'meta', ...order,
  ...ENTITIES.flatMap(e => relFields(e).map(f => relTable(e, f))),
  'provenance', 'link_dismissals', 'aliases', 'validations', 'audit_log', 'change_events', 'sync_log', 'page_index', 'page_deps'];

const cols = (db, t) => db.dialect === 'pg'
  ? db.prepare('SELECT column_name AS name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ?').all(t).map(c => c.name)
  : db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);

const filled = pg.prepare('SELECT COUNT(*) AS n FROM product_lines').get().n;
if (filled && !REPLACE) throw new Error(`Supabase are deja ${filled} game. Rulează cu --replace ca să o golești și să copiezi din nou.`);

// 1. fișierele media în Storage (numele = amprenta conținutului, deci reluarea nu dublează nimic)
const store = createStore(pg);
const media = createMedia(store, join(DATA, 'media'), {storage: {url: supabaseUrl.replace(/\/$/, ''), key, bucket: 'media'}});
const files = local.prepare('SELECT file, mime FROM media').all();
let uploaded = 0;
for (const f of files) {
  const p = join(DATA, 'media', f.file);
  if (!existsSync(p)) { console.warn(`lipsește local: ${f.file}`); continue; }
  media.put(f.file, readFileSync(p), f.mime);
  uploaded++;
}
console.log(`media: ${uploaded}/${files.length} fișiere în Storage`);

// 2. tabelele, într-o singură tranzacție
const counts = {};
tx(pg, () => {
  if (REPLACE) pg.exec(`TRUNCATE ${tables.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  for (const t of tables) {
    const common = cols(local, t).filter(c => cols(pg, t).includes(c));
    const rows = local.prepare(`SELECT ${common.map(c => `"${c}"`).join(', ')} FROM ${t}`).all();
    for (let i = 0; i < rows.length; i += 200) {          // mai multe rânduri pe interogare: mult mai puține drumuri până la Supabase
      const batch = rows.slice(i, i + 200);
      const values = batch.map(() => `(${common.map(() => '?').join(', ')})`).join(', ');
      pg.prepare(`INSERT INTO ${t} (${common.map(c => `"${c}"`).join(', ')}) VALUES ${values} RETURNING 1`).all(...batch.flatMap(r => common.map(c => r[c])));
    }
    if (common.includes('id')) pg.exec(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`);
    counts[t] = rows.length;
  }
});

// 3. verificarea
const diff = tables.filter(t => pg.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n !== counts[t]);
console.log(JSON.stringify({tables: tables.length, rows: Object.values(counts).reduce((a, b) => a + b, 0), different: diff}));
if (diff.length) process.exitCode = 1;
local.close(); pg.close();
