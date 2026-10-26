// Asamblarea: baza, store-ul, media, propagarea și temporizatoarele.
// Configurarea vine din mediu (.env.local local, variabilele proiectului pe Vercel):
//   DATABASE_URL         → Postgres (Supabase); lipsă = SQLite local în data/brain.db
//   SUPABASE_URL, SUPABASE_SECRET_KEY → fișierele media în Supabase Storage (doar împreună cu Postgres)
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {openDb} from './core/db.mjs';
import {createStore} from './core/store.mjs';
import {createMedia} from './core/media.mjs';
import {createSync} from './core/sync.mjs';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DATA = process.env.NIXODOR_DATA ?? join(ROOT, 'data');
const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);
// adresa proiectului Supabase se deduce din utilizatorul conexiunii (postgres.<ref>) dacă nu e dată explicit
if (!process.env.SUPABASE_URL && /postgres\.([a-z0-9]{20})[:@]/.test(process.env.DATABASE_URL ?? ''))
  process.env.SUPABASE_URL = `https://${process.env.DATABASE_URL.match(/postgres\.([a-z0-9]{20})[:@]/)[1]}.supabase.co`;
export const SERVERLESS = !!process.env.VERCEL;

export function createApp({dbFile = process.env.DATABASE_URL ?? join(DATA, 'brain.db'), mediaDir = join(DATA, 'media'), live = SERVERLESS ? 'inline' : true, log} = {}) {
  const db = openDb(dbFile);
  const store = createStore(db);
  const remote = db.dialect === 'pg' && process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY;
  const storage = remote ? {url: process.env.SUPABASE_URL.replace(/\/$/, ''), key: process.env.SUPABASE_SECRET_KEY, bucket: process.env.SUPABASE_BUCKET ?? 'media'} : null;
  const media = createMedia(store, mediaDir, {storage});
  // paginile trimit direct la CDN-ul Supabase pentru fișiere (fără să treacă prin funcție)
  store.mediaBase = storage ? `${storage.url}/storage/v1/object/public/${storage.bucket}` : null;
  const sync = createSync(store, {log});
  // După COMMIT, propagarea pornește imediat (§3.5). Pe Vercel rulează în aceeași cerere ('inline'),
  // pentru că după răspuns funcția poate fi oprită; evenimentele rămase le reia cron-ul.
  if (live === 'inline') store.onChange(() => { try { sync.process(); } catch (e) { console.error('propagare', e); } });
  else if (live) store.onChange(() => setImmediate(() => { try { sync.process(); } catch (e) { console.error('propagare', e); } }));
  let timer = null;
  return {
    db, store, media, sync, mediaDir,
    start() {
      sync.tick();
      if (!db.prepare('SELECT 1 FROM page_index LIMIT 1').get()) sync.scan();
      if (SERVERLESS) return;                       // pe Vercel, temporizatoarele le pornește Vercel Cron
      timer = setInterval(() => { try { sync.tick(); } catch (e) { console.error('tick', e); } }, 60000);
      timer.unref?.();
    },
    stop() { clearInterval(timer); db.close(); }
  };
}
