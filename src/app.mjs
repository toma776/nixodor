// Asamblarea: baza, store-ul, media, propagarea și temporizatoarele.
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDb} from './core/db.mjs';
import {createStore} from './core/store.mjs';
import {createMedia} from './core/media.mjs';
import {createSync} from './core/sync.mjs';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DATA = process.env.NIXODOR_DATA ?? join(ROOT, 'data');

export function createApp({dbFile = join(DATA, 'brain.db'), mediaDir = join(DATA, 'media'), live = true, log} = {}) {
  const db = openDb(dbFile);
  const store = createStore(db);
  const media = createMedia(store, mediaDir);
  const sync = createSync(store, {log});
  // După COMMIT, propagarea pornește imediat (§3.5); evenimentele rămase se reiau la fiecare minut.
  if (live) store.onChange(() => setImmediate(() => { try { sync.process(); } catch (e) { console.error('propagare', e); } }));
  let timer = null;
  return {
    db, store, media, sync, mediaDir,
    start() {
      sync.tick();
      if (!db.prepare('SELECT 1 FROM page_index LIMIT 1').get()) sync.scan();
      timer = setInterval(() => { try { sync.tick(); } catch (e) { console.error('tick', e); } }, 60000);
      timer.unref?.();
    },
    stop() { clearInterval(timer); db.close(); }
  };
}
