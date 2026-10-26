// API-ul /api/manage (Anexa C). Toate rutele cer sesiune și dreptul indicat, verificat pe server.
import {ENTITIES, BY_KEY, entity, titleOf, pathOf, relFields, relTable} from '../registry/entities.mjs';
import {whereUsed} from '../core/whereused.mjs';
import {todo} from '../core/todo.mjs';
import {createGraph} from '../core/graph.mjs';
import {norm} from '../core/content.mjs';

const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };

export async function readBody(req, limit = 20 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) fail(413, 'cerere prea mare'); chunks.push(c); }
  return Buffer.concat(chunks);
}
const jsonBody = async req => { const b = await readBody(req, 5 * 1024 * 1024); return b.length ? JSON.parse(b.toString('utf8')) : {}; };

export function inferredGroups(store) {
  const groups = [];
  for (const e of ENTITIES) for (const f of relFields(e)) {
    const rows = store.db.prepare(`SELECT * FROM ${relTable(e, f)} WHERE status != 'confirmed' ORDER BY confidence DESC, src_id`).all();
    if (!rows.length) continue;
    const byEvidence = new Map();
    for (const r of rows) {
      const ev = /^numele în text/.test(r.note ?? '') ? 'numele în text' : /^din /.test(r.note ?? '') ? `regulă: ${r.note}` : r.note ? 'altă dovadă' : 'fără dovadă';
      const list = byEvidence.get(ev) ?? [];
      list.push({src: r.src_id, dst: r.dst_id, status: r.status, confidence: r.confidence, note: r.note,
        srcTitle: titleOf(e, store.read(e.key, r.src_id)), dstTitle: titleOf(BY_KEY[f.target], store.read(f.target, r.dst_id))});
      byEvidence.set(ev, list);
    }
    for (const [evidence, items] of byEvidence) {
      const avg = items.reduce((s, x) => s + (x.confidence ?? 0.5), 0) / items.length;
      groups.push({relation: `${e.key}.${f.key}`, label: `${e.label} → ${f.label}`, sensitive: !!f.sensitive, evidence, items,
        recommendation: avg >= 0.9 ? 'confirmă' : avg < 0.3 ? 'scoate' : 'una câte una'});
    }
  }
  return groups;
}

export function createApi(app) {
  const {store, sync, media} = app;
  const graph = createGraph(store);
  const recordOut = (key, r) => {
    const e = entity(key);
    return r && {...r, _title: titleOf(e, r), _path: pathOf(e, r), _live: e.noStatus || r.status === 'published'};
  };
  const observationsFor = (key, id) => todo(store).filter(t => t.key === key && t.id === id);

  return async function handle(req, res, user, url) {
    const p = url.pathname.replace(/^\/api\/manage/, '').replace(/\/$/, '') || '/';
    const m = re => p.match(re);
    const method = req.method;
    const send = (data, status = 200) => { res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'}); res.end(JSON.stringify(data)); };
    let r;

    if (method === 'GET' && p === '/status') { store.need(user, 'content.read'); return send({sync: sync.status(), todo: todo(store).length}); }
    if (method === 'GET' && p === '/todo') { store.need(user, 'content.read'); return send(todo(store)); }

    if (method === 'GET' && p === '/search') {
      store.need(user, 'content.read');
      const s = norm(url.searchParams.get('q') ?? '');
      const out = [];
      if (s.length >= 2) for (const e of ENTITIES) for (const rec of store.list(e.key, {search: s, limit: 8})) out.push({key: e.key, id: rec.id, title: titleOf(e, rec), type: e.one});
      return send(out.slice(0, 40));
    }
    if (method === 'GET' && (r = m(/^\/options\/([a-z-]+)$/))) {
      store.need(user, 'content.read');
      const e = entity(r[1]);
      return send(store.list(e.key).map(x => ({id: x.id, title: titleOf(e, x), status: x.status ?? null})));
    }

    // --- entități --------------------------------------------------------------------
    if ((r = m(/^\/entities\/([a-z-]+)$/))) {
      if (method === 'GET') { store.need(user, 'content.read'); return send(store.list(r[1], {search: url.searchParams.get('q') || undefined, status: url.searchParams.get('status') || undefined}).map(x => recordOut(r[1], x))); }
      if (method === 'POST') {
        const b = await jsonBody(req);
        const rec = store.create(user, r[1], b.data ?? {}, {status: b.publish ? 'published' : undefined});
        return send({record: recordOut(r[1], rec), observations: observationsFor(r[1], rec.id)}, 201);
      }
    }
    if ((r = m(/^\/entities\/([a-z-]+)\/(\d+)$/))) {
      const [, key, id] = r;
      if (method === 'GET') { store.need(user, 'content.read'); return send({record: recordOut(key, store.read(key, +id)), draft: recordOut(key, store.read(key, +id, {draft: true}))}); }
      if (method === 'PUT') {
        const b = await jsonBody(req);
        const rec = store.update(user, key, +id, b.data ?? {}, {version: b.version, publish: !!b.publish});
        return send({record: recordOut(key, rec), draft: !!rec._draft, inferred: rec._inferred ?? [], observations: observationsFor(key, +id)});
      }
      if (method === 'DELETE') return send(store.remove(user, key, +id));
    }
    if (method === 'POST' && (r = m(/^\/entities\/([a-z-]+)\/(\d+)\/(status|publish)$/))) {
      const b = r[3] === 'publish' ? {status: 'published'} : await jsonBody(req);
      return send({record: recordOut(r[1], store.setStatus(user, r[1], +r[2], b.status))});
    }
    if (method === 'PUT' && (r = m(/^\/entities\/([a-z-]+)\/(\d+)\/links\/([a-z_]+)$/))) {
      const b = await jsonBody(req);
      return send(store.setLinks(user, r[1], +r[2], r[3], b.items ?? []));
    }
    if (method === 'PUT' && (r = m(/^\/entities\/([a-z-]+)\/(\d+)\/inverse\/([a-z-]+)\/([a-z_]+)$/))) {
      const b = await jsonBody(req);
      return send(store.setInverse(user, r[1], +r[2], r[3], r[4], b.ids ?? []));
    }
    if (method === 'PUT' && (r = m(/^\/entities\/([a-z-]+)\/(\d+)\/links\/([a-z_]+)\/(\d+)\/status$/))) {
      const b = await jsonBody(req);
      return send(store.setLinkStatus(user, r[1], +r[2], r[3], +r[4], b.status));
    }
    if (method === 'POST' && (r = m(/^\/entities\/([a-z-]+)\/(\d+)\/merge$/))) {
      const b = await jsonBody(req);
      return send({record: recordOut(r[1], store.merge(user, r[1], +r[2], (b.ids ?? []).map(Number)))});
    }
    if (method === 'GET' && (r = m(/^\/entities\/([a-z-]+)\/(\d+)\/where-used$/))) { store.need(user, 'content.read'); return send(whereUsed(store, r[1], +r[2])); }
    if (method === 'GET' && (r = m(/^\/entities\/([a-z-]+)\/(\d+)\/history$/))) { store.need(user, 'content.read'); return send(store.history(r[1], +r[2])); }
    if (method === 'POST' && (r = m(/^\/history\/(\d+)\/revert$/))) { const b = await jsonBody(req); return send({record: store.revert(user, +r[1], {field: b.field})}); }
    if (method === 'POST' && (r = m(/^\/provenance\/(\d+)\/confirm$/))) return send(store.confirmProvenance(user, +r[1]));

    // --- legături de verificat ---------------------------------------------------------
    if (method === 'GET' && p === '/inferred') { store.need(user, 'content.read'); return send(inferredGroups(store)); }
    if (method === 'POST' && (r = m(/^\/inferred\/([a-z-]+\.[a-z_]+)$/))) {
      const b = await jsonBody(req);
      return send(store.bulkLinkStatus(user, r[1], b.pairs ?? [], b.status));
    }

    // --- harta --------------------------------------------------------------------------
    if (method === 'GET' && (r = m(/^\/graph\/(overview|health|edges|neighbors|path|relation|members)$/))) {
      store.need(user, 'content.read');
      const sp = url.searchParams;
      if (r[1] === 'overview' || r[1] === 'edges') return send(graph.overview());
      if (r[1] === 'health') return send(graph.health());
      if (r[1] === 'relation') return send(graph.relation(sp.get('id')));
      if (r[1] === 'neighbors') { const [k, i] = (sp.get('node') ?? '').split(':'); return send(graph.neighbors(k, +i)); }
      if (r[1] === 'path') return send(graph.path(sp.get('from'), sp.get('to')));
      if (r[1] === 'members') {
        const e = entity(sp.get('type')), page = +(sp.get('page') ?? 0);
        const all = store.list(e.key).map(x => ({id: x.id, title: titleOf(e, x), degree: (graph.neighbors(e.key, x.id)?.out.length ?? 0) + (graph.neighbors(e.key, x.id)?.in.length ?? 0)}))
          .filter(x => !sp.get('q') || norm(x.title).includes(norm(sp.get('q')))).sort((a, b) => b.degree - a.degree);
        return send({total: all.length, items: all.slice(page * 40, page * 40 + 40)});
      }
    }

    // --- propagare, temporizatoare -------------------------------------------------------
    if (method === 'POST' && (r = m(/^\/sync\/retry\/(\d+)$/))) { store.need(user, 'content.write'); return send(sync.retry(+r[1]).map(x => ({event: x.event, pages: x.targets.size, failed: x.failed}))); }
    if (method === 'POST' && p === '/sync/scan') { store.need(user, 'settings.write'); return send(sync.scan()); }
    if (method === 'GET' && (r = m(/^\/sync\/events\/(\d+)$/))) {
      store.need(user, 'content.read');
      return send({event: store.db.prepare('SELECT * FROM change_events WHERE id = ?').get(+r[1]), log: store.db.prepare('SELECT * FROM sync_log WHERE event_id = ? ORDER BY id').all(+r[1])});
    }

    // --- media -----------------------------------------------------------------------------
    if (method === 'POST' && p === '/media') {
      store.need(user, 'media.write');
      const buf = await readBody(req);
      const rec = media.add(user, buf, {name: url.searchParams.get('name') ?? 'fisier', alt: url.searchParams.get('alt') ?? ''});
      return send({record: recordOut('media', rec), existing: !!rec._existing}, 201);
    }
    if (method === 'PUT' && (r = m(/^\/media\/(\d+)$/))) {
      store.need(user, 'media.write');
      const buf = await readBody(req);
      return send({record: recordOut('media', media.replace(user, +r[1], buf, {name: url.searchParams.get('name') ?? undefined}))});
    }

    fail(404, 'rută necunoscută');
  };
}
