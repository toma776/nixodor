// Punctul de intrare pe Vercel: site-ul public, /manage și /api/manage, cu același cod ca local.
// Baza vine cu deploy-ul (site-data/brain.db, pusă acolo de `npm run publish` din baza locală):
// fiecare instanță o copiază în /tmp și o deschide. Online nu se salvează nimic: panoul e doar pentru citire,
// iar editarea se face în panoul local și ajunge pe site la următorul `npm run publish`.
import {copyFileSync, mkdirSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createApp} from '../src/app.mjs';
import {createHandler} from '../src/server.mjs';

const BUNDLED = fileURLToPath(new URL('../site-data/brain.db', import.meta.url));
const TMP = '/tmp/nixodor', DB = join(TMP, 'brain.db');
let handler = null;

function open() {
  mkdirSync(join(TMP, 'media'), {recursive: true});
  if (!existsSync(DB)) copyFileSync(BUNDLED, DB);
  const app = createApp({dbFile: DB, mediaDir: join(TMP, 'media'), live: false});
  app.readOnly = true;
  app.start();
  return createHandler(app);
}

export default async function nixodor(req, res) {
  try {
    handler ??= open();
  } catch (e) {
    console.error(e);
    res.writeHead(503, {'content-type': 'text/plain; charset=utf-8'});
    return res.end('Brain-ul nu e disponibil momentan.');
  }
  const path = new URL(req.url, 'http://x').pathname;
  // un canal deschis (SSE) nu are sens într-o funcție: browserul primește 204 și nu mai reîncearcă
  if (path === '/api/manage/events') { res.writeHead(204); return res.end(); }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    res.writeHead(403, {'content-type': 'application/json; charset=utf-8'});
    return res.end(JSON.stringify({error: 'Panoul online e doar pentru citire. Modifică în panoul local (npm start) și publică cu npm run publish.'}));
  }
  return handler(req, res);
}
