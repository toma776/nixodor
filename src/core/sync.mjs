// Propagarea (§3.4–3.5): din eveniment → paginile afectate, fiecare cu motivul ei → refacere și jurnal.
import {createHash} from 'node:crypto';
import {tx, nowIso, meta} from './db.mjs';
import {ENTITIES, BY_KEY, pathOf} from '../registry/entities.mjs';
import {render as renderSite, resolve} from '../site/render.mjs';

const RENDER_NOW = 150, MAX_ATTEMPTS = 5;
const KINDS_ALWAYS = new Set(['page', 'direct', 'list', 'media', 'pending']);
const FIXED_PATHS = ['/', '/blog/', '/sitemap.xml'];

export function createSync(store, {render = renderSite, log = () => {}} = {}) {
  const db = store.db, q = sql => db.prepare(sql);
  const cache = new Map();
  let running = false, again = false;

  function writeIndex(path, r) {
    const hash = createHash('sha1').update(r.html ?? '').digest('hex');
    q('DELETE FROM page_deps WHERE path = ?').run(path);
    const ins = q('INSERT INTO page_deps (path, entity, entity_id, kind, component, scope, fields, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const seen = new Set();
    const put = (p, d) => {
      const k = [p, d.entity, d.entity_id, d.kind, d.component, d.scope, d.fields].join('|');
      if (seen.has(k)) return; seen.add(k);
      ins.run(p, d.entity, d.entity_id, d.kind, d.component ?? '', d.scope ?? '', d.fields, d.reason ?? null);
    };
    for (const d of r.deps) put(path, d);
    for (const [name, list] of r.layoutDeps ?? []) {              // o singură dată pe componentă
      const lp = `#layout:${name}`;
      q('DELETE FROM page_deps WHERE path = ?').run(lp);
      for (const d of list) put(lp, d);
    }
    q(`INSERT INTO page_index (path, owner_entity, owner_id, title, status, rendered_at, hash, deps, error, stale) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)
       ON CONFLICT(path) DO UPDATE SET owner_entity = excluded.owner_entity, owner_id = excluded.owner_id, title = excluded.title, status = excluded.status,
       rendered_at = excluded.rendered_at, hash = excluded.hash, deps = excluded.deps, error = NULL, stale = 0`)
      .run(path, r.owner?.key ?? null, r.owner?.id ?? null, r.title ?? null, r.status, nowIso(), hash, r.deps.length);
    return hash;
  }

  function dropIndex(path) {
    q('DELETE FROM page_deps WHERE path = ?').run(path);
    q('DELETE FROM page_index WHERE path = ?').run(path);
    cache.delete(path);
  }

  // Randează și indexează o adresă. Paginile 404 nu intră în index și nu scriu dependențe.
  function build(path) {
    const r = render(store, path);
    if (r.status !== 200) { dropIndex(path); return r; }
    tx(db, () => writeIndex(path, r));
    cache.set(path, {status: r.status, html: r.html, type: r.type});
    return r;
  }

  function get(path) {
    const hit = cache.get(path);
    if (hit) return hit;
    const r = build(path);
    return {status: r.status, html: r.html, type: r.type};
  }

  // --- paginile afectate ----------------------------------------------------------
  function affected(ev) {
    const out = new Map();
    const add = (path, reason) => { if (path && !out.has(path)) out.set(path, reason); };
    const p = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload ?? {};

    if (!ev.entity || ev.action === 'global' || ev.action === 'restore') {
      for (const r of q('SELECT path FROM page_index').all()) add(r.path, `modificare globală (${ev.action})`);
      return out;
    }
    const records = ev.action === 'bulk-links' ? (p.scopes ?? []).map(s => ({id: s.id, before: s.before, after: s.after, changed: ['*']}))
      : [{id: ev.entity_id, before: p.before, after: p.after, changed: p.changed}];
    const created = ev.action === 'create', deleted = ev.action === 'delete' || ev.action === 'merge';

    for (const {id, before, after, changed = []} of records) {
      // 2. dependențele înregistrării
      const statusChanged = before?.status !== after?.status;
      for (const d of q('SELECT * FROM page_deps WHERE entity = ? AND entity_id = ?').all(ev.entity, id)) {
        if (d.kind === 'list' && d.fields) {
          const fields = JSON.parse(d.fields);
          if (created || deleted || statusChanged || p.reorder || changed.includes('*') || changed.some(f => fields.includes(f))) add(d.path, reasonOf(d));
        } else if (KINDS_ALWAYS.has(d.kind)) add(d.path, reasonOf(d));
        else if (d.kind === 'link' && linkMatters(before, after, created, deleted)) add(d.path, reasonOf(d));
      }
      // 3–4. listele: fără scope (cu câmpuri, doar dacă s-au schimbat), sau cu scope-ul vechi/nou
      const scopes = new Set([...(before?.scopes ?? []), ...(after?.scopes ?? [])]);
      for (const d of q(`SELECT * FROM page_deps WHERE entity = ? AND kind = 'query'`).all(ev.entity)) {
        if (d.scope) { if (scopes.has(d.scope)) add(d.path, `${reasonOf(d)} (${d.scope})`); continue; }
        const fields = d.fields ? JSON.parse(d.fields) : null;
        if (!fields || created || deleted || statusChanged || p.reorder || changed.includes('*') || changed.some(f => fields.includes(f))) add(d.path, reasonOf(d));
      }
      // 5. adresele proprii, cea veche și cea nouă
      for (const path of [...(before?.paths ?? []), ...(after?.paths ?? [])]) add(path, before?.paths?.[0] !== after?.paths?.[0] ? 'adresa paginii s-a schimbat' : 'pagina proprie');
    }
    // 6. capetele relațiilor atinse: paginile lor proprii
    for (const t of p.touched ?? []) for (const d of q(`SELECT path FROM page_deps WHERE entity = ? AND entity_id = ? AND kind = 'page'`).all(t.key, t.id))
      add(d.path, `capătul relației (${BY_KEY[t.key]?.one ?? t.key} ${t.id})`);
    // 7. componentele comune: #layout:<nume> → toate paginile care o folosesc
    for (const [path, reason] of [...out]) {
      if (!path.startsWith('#layout:')) continue;
      out.delete(path);
      const name = path.slice(8);
      for (const d of q(`SELECT DISTINCT path FROM page_deps WHERE kind = 'layout' AND component = ?`).all(name)) add(d.path, `${name} — ${reason}`);
    }
    return out;
  }

  // linkMatters = creare || ștergere || stare diferită || adrese diferite || orice câmp din linkFields diferit (§3.4)
  function linkMatters(before, after, created, deleted) {
    if (created || deleted || !before || !after) return true;
    if (before.status !== after.status) return true;
    if (JSON.stringify(before.paths) !== JSON.stringify(after.paths)) return true;
    return JSON.stringify(before.linkFields ?? {}) !== JSON.stringify(after.linkFields ?? {});
  }
  const reasonOf = d => d.reason || ({page: 'pagina proprie', pending: 'așteaptă publicarea', link: 'link', media: 'fișier afișat'})[d.kind] || d.kind;

  // --- procesarea ----------------------------------------------------------------
  function processEvent(ev) {
    const targets = affected(ev);
    const logIns = q('INSERT INTO sync_log (event_id, at, path, action, detail) VALUES (?, ?, ?, ?, ?)');
    let rendered = 0, failed = [];
    tx(db, () => {
      for (const [path] of targets) { cache.delete(path); q('UPDATE page_index SET stale = 1 WHERE path = ?').run(path); }
    });
    for (const [path, reason] of targets) {
      try {
        if (rendered >= RENDER_NOW) { logIns.run(ev.id, nowIso(), path, 'invalidated', reason); continue; }
        const r = render(store, path);
        if (r.status !== 200) {
          tx(db, () => dropIndex(path));
          const red = q(`SELECT 1 FROM ${BY_KEY.redirecturi.table} WHERE from_path = ?`).get(path);
          logIns.run(ev.id, nowIso(), path, red ? 'redirect' : 'removed', reason);
          continue;
        }
        tx(db, () => writeIndex(path, r));
        cache.set(path, {status: r.status, html: r.html, type: r.type});
        rendered++;
        logIns.run(ev.id, nowIso(), path, 'rendered', reason);
      } catch (e) {
        failed.push(path);
        q('UPDATE page_index SET error = ? WHERE path = ?').run(String(e.message), path);
        logIns.run(ev.id, nowIso(), path, 'failed', `${reason} — ${e.message}`);
      }
    }
    if (failed.length) {
      const attempts = ev.attempts + 1;
      q(`UPDATE change_events SET status = 'failed', attempts = ?, last_error = ?, next_try_at = ?, processed_at = ?, affected = ? WHERE id = ?`)
        .run(attempts, `${failed.length} pagini: ${failed.slice(0, 3).join(', ')}`, new Date(Date.now() + 30000 * 2 ** attempts).toISOString(), nowIso(), targets.size, ev.id);
    } else q(`UPDATE change_events SET status = 'done', processed_at = ?, affected = ?, last_error = NULL WHERE id = ?`).run(nowIso(), targets.size, ev.id);
    log(`eveniment ${ev.id} ${ev.action} ${ev.entity}:${ev.entity_id} → ${targets.size} pagini${failed.length ? `, ${failed.length} eșuate` : ''}`);
    return {targets, failed};
  }

  function process({force = false} = {}) {
    if (running) { again = true; return []; }
    running = true;
    const done = [];
    try {
      do {
        again = false;
        const events = q(`SELECT * FROM change_events WHERE status = 'pending'
          OR (status = 'failed' AND attempts < ? AND (? OR next_try_at <= ?)) ORDER BY id`).all(MAX_ATTEMPTS, force ? 1 : 0, nowIso());
        for (const ev of events) done.push({event: ev.id, ...processEvent(ev)});
      } while (again);
    } finally { running = false; }
    return done;
  }

  function retry(id) {
    q(`UPDATE change_events SET status = 'pending', next_try_at = NULL WHERE id = ? AND status = 'failed'`).run(id);
    return process();
  }

  // --- scanarea: toate adresele publice, cu dependențele rescrise (§3.5) --------------
  function publicPaths() {
    const paths = new Set(FIXED_PATHS);
    for (const e of ENTITIES.filter(e => e.public))
      for (const r of store.list(e.key, {status: e.noStatus ? undefined : 'published'})) { const p = pathOf(e, r); if (p) paths.add(p); }
    return [...paths];
  }

  function scan() {
    const paths = publicPaths();
    const errors = [];
    for (const p of paths) try { build(p); } catch (e) { errors.push({path: p, error: e.message}); }
    const keep = new Set(paths);
    tx(db, () => {
      for (const r of q('SELECT path FROM page_index').all()) if (!keep.has(r.path)) dropIndex(r.path);
      const usedLayouts = new Set(q(`SELECT DISTINCT component FROM page_deps WHERE kind = 'layout'`).all().map(r => `#layout:${r.component}`));
      for (const r of q(`SELECT DISTINCT path FROM page_deps WHERE path LIKE '#layout:%'`).all()) if (!usedLayouts.has(r.path)) q('DELETE FROM page_deps WHERE path = ?').run(r.path);
      q(`UPDATE change_events SET status = 'done', processed_at = ?, last_error = 'acoperit de scanare' WHERE status IN ('pending','failed')`).run(nowIso());
    });
    meta.set(db, 'last_scan', nowIso());
    return {pages: paths.length, errors};
  }

  // Temporizatoarele (§3.7): rulează la pornire, la fiecare minut și din /api/manage/cron/tick.
  function tick() {
    const year = String(new Date().getFullYear());
    const known = meta.get(db, 'year');
    if (known !== year) {
      tx(db, () => {
        meta.set(db, 'year', year);
        if (known) store.emit(null, 'global', null, null, null, null, {reason: `anul s-a schimbat ({an} = ${year})`});
      });
    }
    return process();
  }

  function status() {
    const one = sql => q(sql).get();
    return {
      pending: one(`SELECT COUNT(*) n FROM change_events WHERE status = 'pending'`).n,
      failed: one(`SELECT COUNT(*) n FROM change_events WHERE status = 'failed'`).n,
      pages: one('SELECT COUNT(*) n FROM page_index').n,
      stale: one('SELECT COUNT(*) n FROM page_index WHERE stale = 1').n,
      errors: one('SELECT COUNT(*) n FROM page_index WHERE error IS NOT NULL').n,
      deps: one('SELECT COUNT(*) n FROM page_deps').n,
      last: q(`SELECT * FROM change_events WHERE status = 'done' ORDER BY id DESC LIMIT 1`).get() ?? null,
      lastScan: meta.get(db, 'last_scan')
    };
  }

  return {get, build, affected, process, processEvent, retry, scan, tick, status, publicPaths, cache, resolve: p => resolve(store, p)};
}
