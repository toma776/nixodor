// Serverul: site-ul public (din cache-ul de pagini), /media, adresele vechi, /manage și /api/manage.
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFileSync, existsSync, statSync} from 'node:fs';
import {join, extname, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp, ROOT, DATA} from './app.mjs';
import {createBlobSync, loadToken} from './core/blobsync.mjs';
import {createAuth} from './manage/auth.mjs';
import {createApi, readBody} from './manage/api.mjs';
import {createViews} from './manage/views.mjs';
import {createContext} from './site/context.mjs';
import {render, CANONICAL} from './site/render.mjs';
import {BY_KEY} from './registry/entities.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const TYPES = {'.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'};

export function createHandler(app) {
  const {store, sync, media} = app;
  const auth = createAuth(store.db);
  const api = createApi(app);
  const views = createViews(app);
  const sse = new Set();

  // Actualizare live între utilizatori (§3.11): fiecare modificare ajunge la panourile deschise.
  store.onChange(({key, id, action, event}) => {
    const ev = store.db.prepare('SELECT user_name, label FROM change_events WHERE id = ?').get(event);
    const msg = `data: ${JSON.stringify({key, id, action, user: ev?.user_name, label: ev?.label})}\n\n`;
    for (const res of sse) res.write(msg);
  });

  const send = (res, status, body, type = 'text/html; charset=utf-8', headers = {}) => { res.writeHead(status, {'content-type': type, ...headers}); res.end(body); };
  const redirect = (res, to, code = 301) => { res.writeHead(code, {location: to}); res.end(); };

  function serveFile(res, base, rel, cache) {
    const file = normalize(join(base, rel));
    if (!file.startsWith(normalize(base)) || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, readFileSync(file), TYPES[extname(file)] ?? 'application/octet-stream', {'cache-control': cache});
  }

  // Adresa finală a unei redirecționări (destinația poate fi o entitate, deci rezistă la mutări).
  function redirectTarget(path, search) {
    const r = store.db.prepare(`SELECT * FROM ${BY_KEY.redirecturi.table} WHERE from_path = ?`).get(path);
    if (!r) return null;
    const ctx = createContext(store, {path: '#redirect', preview: true});
    const to = r.to_ref ? ctx.href(r.to_ref) : r.to_path;
    return to ? {to: to + (to.includes('?') ? '' : search), code: r.code ?? 301} : null;
  }

  async function handleManage(req, res, url, user) {
    const p = url.pathname;
    if (p === '/manage/login/' && req.method === 'POST') {
      if (!auth.sameOrigin(req)) return send(res, 403, 'Origine refuzată', 'text/plain');
      const form = new URLSearchParams((await readBody(req, 10000)).toString());
      const r = auth.login(form.get('email'), form.get('password'), req.socket.remoteAddress);
      if (r.error) return send(res, 401, views.login(r.error));
      res.setHeader('set-cookie', `nx_session=${r.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1209600${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`);
      return redirect(res, '/manage/', 303);
    }
    if (p === '/manage/logout/') { auth.logout(req); res.setHeader('set-cookie', 'nx_session=; Path=/; Max-Age=0'); return redirect(res, '/manage/login/', 303); }
    if (!user) return p === '/manage/login/' ? send(res, 200, views.login()) : redirect(res, '/manage/login/', 303);
    if (!user.perms.has('content.read')) return send(res, 403, 'Fără drept de citire', 'text/plain');
    let m, html;
    if (p === '/manage/' || p === '/manage') html = views.dashboard(user);
    else if (p === '/manage/entitati/') html = views.entitiesHome(user);
    else if ((m = p.match(/^\/manage\/entitati\/([a-z-]+)\/nou\/$/)) && BY_KEY[m[1]]) html = views.newEntity(user, m[1]);
    else if ((m = p.match(/^\/manage\/entitati\/([a-z-]+)\/$/)) && BY_KEY[m[1]]) html = views.entityList(user, m[1], url);
    else if ((m = p.match(/^\/manage\/entitati\/([a-z-]+)\/(\d+)\/(?:([a-z-]+)\/)?$/)) && BY_KEY[m[1]]) html = views.entityPage(user, m[1], +m[2], m[3] ?? 'detalii', url);
    else if (p === '/manage/harta/') html = views.map(user, url);
    else if (p === '/manage/surse/') html = views.sources(user);
    else if (p === '/manage/surse/legaturi/') html = views.inferred(user);
    else if (p === '/manage/propagare/') html = views.propagation(user);
    else if ((m = p.match(/^\/manage\/propagare\/(\d+)\/$/))) html = views.propagation(user, +m[1]);
    else if (p === '/manage/istoric/') html = views.history(user);
    else if (p === '/manage/cautare/') html = views.search(user, url);
    else if (p.startsWith('/manage/previzualizare/')) {
      const path = p.slice('/manage/previzualizare'.length) || '/';
      const r = render(store, path, {preview: true});
      return send(res, r.status, r.html, r.type ?? 'text/html; charset=utf-8', {'cache-control': 'no-store', 'x-robots-tag': 'noindex'});
    }
    if (!html) return send(res, 404, 'Pagina nu există', 'text/plain');
    send(res, 200, html, 'text/html; charset=utf-8', {'cache-control': 'no-store'});
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(url.pathname);
    try {
      // domeniul canonic (presupunerea 8): nixodor.ro → www.nixodor.ro
      const host = (req.headers.host ?? '').toLowerCase();
      if (host === 'nixodor.ro') return redirect(res, `${CANONICAL}${req.url}`);

      // cu ?v= (versiune după conținut) fișierul nu se mai schimbă la aceeași adresă; fără ?v=, browserul revalidează
      if (p.startsWith('/assets/')) return serveFile(res, join(HERE, 'site/assets'), p.slice(8), url.searchParams.has('v') || p.startsWith('/assets/fonts/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      if (p.startsWith('/manage/assets/')) return serveFile(res, join(HERE, 'manage/assets'), p.slice(15), 'no-cache');

      if (p.startsWith('/media/')) {
        const m = p.match(/^\/media\/(\d+)\//);
        const rec = m && store.read('media', +m[1]);
        if (!rec) return send(res, 404, 'Not found', 'text/plain');
        return serveFile(res, app.mediaDir, rec.file, url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
      }

      if (p.startsWith('/api/manage/')) {
        if (p === '/api/manage/cron/tick' && req.method === 'POST') {
          const key = process.env.CRON_KEY;
          if (!(key && req.headers['x-cron-key'] === key) && !auth.user(req)?.perms.has('settings.write')) return send(res, 403, '{"error":"cheie de cron"}', 'application/json');
          const done = sync.tick();
          return send(res, 200, JSON.stringify({events: done.length}), 'application/json');
        }
        const user = auth.user(req);
        if (!user) return send(res, 401, JSON.stringify({error: 'Neautentificat'}), 'application/json');
        if (req.method !== 'GET' && !auth.sameOrigin(req)) return send(res, 403, JSON.stringify({error: 'Origine refuzată'}), 'application/json');
        if (p === '/api/manage/events') {
          res.writeHead(200, {'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive'});
          res.write(': conectat\n\n');
          sse.add(res);
          const ping = setInterval(() => res.write(': ping\n\n'), 25000);
          req.on('close', () => { clearInterval(ping); sse.delete(res); });
          return;
        }
        return await api(req, res, user, url);
      }

      if (p.startsWith('/manage')) return await handleManage(req, res, url, auth.user(req));

      // adresele site-ului vechi (§3.8)
      if (/^\/(wp-admin|wp-json|wp-login\.php|xmlrpc\.php)/.test(p) || /^\/blog\/(wp-admin|wp-json|wp-login\.php)/.test(p) || p === '/feed/') return send(res, 404, render(store, '/404/').html);
      if (p.startsWith('/blog/wp-content/uploads/')) {
        const legacy = `url:${p.replace(/-\d+x\d+(\.\w+)$/, '$1')}`;
        const rec = store.db.prepare('SELECT id, name FROM media WHERE legacy_ref = ? OR legacy_ref = ?').get(legacy, legacy.replace(/(\.\w+)$/, '-scaled$1'));
        return rec ? redirect(res, `/media/${rec.id}/${encodeURIComponent(rec.name)}`) : send(res, 404, 'Not found', 'text/plain');
      }
      if (url.searchParams.has('p') && /^\/(blog\/)?$/.test(p)) {
        const a = store.db.prepare(`SELECT slug FROM ${BY_KEY.articole.table} WHERE legacy_ref = ?`).get(`wp:${+url.searchParams.get('p')}`);
        if (a) return redirect(res, `/blog/${a.slug}/`);
      }
      const red = redirectTarget(p, url.search);
      if (red) return redirect(res, red.to, red.code);
      if (!p.endsWith('/') && !extname(p)) return redirect(res, p + '/' + url.search);   // bara de la final

      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
      const page = sync.get(p);
      // Browserul revalidează mereu (ETag): o pagină refăcută de propagare se vede imediat, nu după expirarea unui max-age.
      const etag = page.status === 200 ? `"${createHash('sha1').update(page.html).digest('base64url').slice(0, 20)}"` : null;
      if (etag && req.headers['if-none-match'] === etag) { res.writeHead(304, {etag, 'cache-control': 'no-cache'}); return res.end(); }
      send(res, page.status, req.method === 'HEAD' ? '' : page.html, page.type ?? 'text/html; charset=utf-8',
        page.status === 200 ? {'cache-control': 'no-cache', etag} : {'cache-control': 'no-store'});
    } catch (e) {
      const status = e.status ?? 500;
      if (status >= 500) console.error(e);
      if (p.startsWith('/api/')) return send(res, status, JSON.stringify({error: e.message, errors: e.errors, usage: e.usage, current: e.current}), 'application/json; charset=utf-8');
      send(res, status, `<!doctype html><meta charset="utf-8"><p>${status}: ${String(e.message).replace(/</g, '&lt;')}</p>`);
    }
  };
}

// Local, cu cheia Blob în .env.local (npx vercel env pull .env.local), serverul ține baza la zi cu site-ul online:
//   - la pornire și la fiecare 20 s aduce versiunea online, dacă s-a schimbat și local nu e nimic neurcat;
//   - la 3 s după o salvare din panoul local, urcă baza; site-ul online o folosește de la următoarea cerere.
// Dacă s-a lucrat în ambele locuri, nu suprascrie nimic: panoul arată un mesaj cu cele două variante.
// NIXODOR_BLOB_SYNC=0 oprește sincronizarea.
async function main() {
  const log = m => console.log(new Date().toISOString(), m);
  const syncOn = process.env.NIXODOR_BLOB_SYNC !== '0' && loadToken(ROOT);
  const blob = syncOn ? createBlobSync({dataDir: DATA}) : null;
  const status = {on: syncOn, conflict: false, error: null, last: null};
  let app, handler, pushTimer = null, busy = false;

  const open = () => {
    app = createApp({log});
    app.blob = status;
    app.store.onChange(() => { if (blob) { clearTimeout(pushTimer); pushTimer = setTimeout(tick, 3000); } });
    app.start();
    handler = createHandler(app);
  };
  const pull = async () => { app?.stop(); app = null; try { await blob.pull(); } finally { open(); } };
  // un pas de sincronizare; o singură operație cu Blob-ul o dată
  const exclusive = async fn => { if (busy) return; busy = true; try { await fn(); status.error = null; } catch (e) { status.error = e.message; log(`sincronizare: ${e.message}`); } finally { busy = false; } };
  const tick = () => exclusive(async () => {
    const s = await blob.state(app?.db);
    status.conflict = s.remoteChanged && s.dirty;
    if (status.conflict) return log('sincronizare: s-a lucrat și local, și online; nu suprascriu nimic (vezi panoul)');
    if (s.remoteChanged) { await pull(); status.last = new Date().toISOString(); return log('sincronizare: am adus modificările făcute online'); }
    if (s.dirty) {
      try { await blob.push(app?.db); status.last = new Date().toISOString(); log('sincronizare: modificările locale sunt pe site-ul online'); }
      catch (e) { if (e.conflict) status.conflict = true; else throw e; }
    }
  });

  if (blob) await tick();
  if (!app) open();
  if (blob) setInterval(tick, 20000).unref();

  const port = +(process.env.PORT ?? 4310);
  createServer(async (req, res) => {
    // alegerea din mesajul de conflict: păstrează varianta online sau pe cea locală
    if (blob && req.method === 'POST' && (req.url === '/api/manage/blob/keep-online' || req.url === '/api/manage/blob/keep-local')) {
      if (!createAuth(app.db).user(req)?.perms.has('settings.write')) { res.writeHead(403); return res.end(); }
      await exclusive(async () => {
        if (req.url.endsWith('online')) await pull(); else await blob.push(app.db, {force: true});
        status.conflict = false; status.last = new Date().toISOString();
      });
      res.writeHead(status.error ? 500 : 200, {'content-type': 'application/json'});
      return res.end(JSON.stringify({ok: !status.error, error: status.error}));
    }
    return handler(req, res);
  }).listen(port, () => console.log(`NIXODOR: http://localhost:${port}/  ·  Brain: http://localhost:${port}/manage/${blob ? '  ·  sincronizat cu site-ul online' : ''}`));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) main();
