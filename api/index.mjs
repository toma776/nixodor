// Punctul de intrare pe Vercel: site-ul public, /manage și /api/manage, cu același cod ca local.
// Baza (SQLite, brain.db) stă într-un Blob privat. Fiecare instanță o ține în /tmp:
//   - la fiecare cerere verifică ETag-ul din Blob (ieftin) și o descarcă doar dacă s-a schimbat;
//   - după o cerere care scrie (POST/PUT/DELETE), o urcă înapoi condiționat (ifMatch): dacă între timp a scris
//     altă instanță, salvarea nu suprascrie nimic, iar editorul primește 409 („reîncarcă și salvează din nou”).
// Fișierele media noi (urcate din panou) stau în același Blob, sub media/.
import {get, put, BlobPreconditionFailedError} from '@vercel/blob';
import {mkdir, writeFile, readFile, readdir, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {createApp} from '../src/app.mjs';
import {createHandler} from '../src/server.mjs';

const TMP = '/tmp/nixodor', DB = join(TMP, 'brain.db'), MEDIA = join(TMP, 'media');
const DB_BLOB = 'brain.db';
let app = null, handler = null, etag = null;
const inBlob = new Set();                                    // fișierele media pe care Blob-ul le are deja

const readAll = async stream => Buffer.from(await new Response(stream).arrayBuffer());

async function load() {
  const r = await get(DB_BLOB, {access: 'private', useCache: false, ...(etag && app ? {ifNoneMatch: etag} : {})});
  if (!r) throw new Error('brain.db lipsește din Blob (prima urcare se face cu npm run blob:upload)');
  if (r.statusCode === 304) return;
  const buf = await readAll(r.stream);
  app?.stop();
  await mkdir(MEDIA, {recursive: true});
  for (const f of ['', '-wal', '-shm']) await rm(DB + f, {force: true});
  await writeFile(DB, buf);
  etag = r.blob.etag;
  // propagarea o pornim noi, înainte de urcare (live: false), ca rezultatul ei să ajungă în aceeași versiune
  app = createApp({dbFile: DB, mediaDir: MEDIA, live: false});
  app.db.exec('PRAGMA journal_mode = DELETE');              // un singur fișier, gata de urcat
  app.start();
  handler = createHandler(app);
}

async function persist() {
  const buf = await readFile(DB);
  const r = await put(DB_BLOB, buf, {access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/vnd.sqlite3', ifMatch: etag});
  etag = r.etag;
  for (const file of await readdir(MEDIA)) {                 // fișierele noi din panou
    if (inBlob.has(file)) continue;
    await put(`media/${file}`, await readFile(join(MEDIA, file)), {access: 'private', allowOverwrite: true, addRandomSuffix: false});
    inBlob.add(file);
  }
}

// /media/<id>/…: fișierele de la import sunt statice în deploy (public/media); cele urcate din panou vin din Blob
async function ensureMedia(path) {
  const m = path.match(/^\/media\/(\d+)\//);
  const rec = m && app.store.read('media', +m[1]);
  if (!rec || existsSync(join(MEDIA, rec.file))) return;
  const r = await get(`media/${rec.file}`, {access: 'private'});
  if (r?.statusCode === 200) { await writeFile(join(MEDIA, rec.file), await readAll(r.stream)); inBlob.add(rec.file); }
}

export default async function nixodor(req, res) {
  try {
    await load();
  } catch (e) {
    console.error(e);
    res.writeHead(503, {'content-type': 'text/plain; charset=utf-8'});
    return res.end('Brain-ul nu e disponibil momentan.');
  }
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.startsWith('/media/')) await ensureMedia(path);
  // un canal deschis (SSE) nu are sens într-o funcție: browserul primește 204 și nu mai reîncearcă
  if (path === '/api/manage/events') { res.writeHead(204); return res.end(); }

  const writes = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (!writes) return handler(req, res);

  // la scrieri, răspunsul (antetele și corpul) pleacă abia după ce baza a ajuns în Blob
  const writeHead = res.writeHead.bind(res), end = res.end.bind(res);
  let head = null, finish;
  const ended = new Promise(r => { finish = r; });
  res.writeHead = (...args) => { head = args; return res; };
  res.end = (...args) => { finish(args); return res; };
  await handler(req, res);
  const body = await ended;
  res.writeHead = writeHead; res.end = end;
  try {
    app.sync.process();
    await persist();
  } catch (e) {
    console.error(e);
    etag = null;                                              // la următoarea cerere se reîncarcă versiunea din Blob
    const conflict = e instanceof BlobPreconditionFailedError;
    for (const h of res.getHeaderNames()) res.removeHeader(h);
    res.writeHead(conflict ? 409 : 500, {'content-type': 'application/json; charset=utf-8'});
    return res.end(JSON.stringify({error: conflict ? 'Între timp a salvat altcineva. Reîncarcă pagina și salvează din nou.' : 'Salvarea nu a ajuns în Blob.'}));
  }
  if (head) res.writeHead(...head);
  return res.end(...body);
}
