// Store: singurul drum de scriere (§3.3). Fiecare modificare scrie în aceeași tranzacție
// datele, istoricul (audit_log) și evenimentul de propagare (change_events, outbox).
import {tx, afterCommit, nowIso, JSON_TYPES, meta} from './db.mjs';
import {ENTITIES, BY_KEY, entity, titleOf, pathOf, linkFieldsOf, relFields, relTable, targetOf, RELATION_TYPES,
  RESERVED_SLUGS, PERMS, LINK_REF} from '../registry/entities.mjs';
import {sanitizeContent, tokenizeValues, findMentions, slugify, norm, stripTags} from './content.mjs';

export const SYSTEM_USER = {name: 'Sistem', role: 'admin', perms: new Set(PERMS.admin)};
export const asUser = (name, role) => ({name, role, perms: new Set(PERMS[role] ?? [])});

const fail = (status, message, extra) => { throw Object.assign(new Error(message), {status, ...extra}); };
const SETTINGS_TYPES = new Set(['firma', 'meniuri', 'redirecturi']);

export function createStore(db) {
  const listeners = new Set();
  let quiet = 0;
  const q = sql => db.prepare(sql);

  // --- citire ---------------------------------------------------------------
  const parse = (e, row) => {
    if (!row) return null;
    const r = {...row};
    for (const f of e.fields) if (JSON_TYPES.has(f.type) && typeof r[f.key] === 'string') try { r[f.key] = JSON.parse(r[f.key]); } catch {}
    for (const f of e.fields) if (f.type === 'boolean' && r[f.key] != null) r[f.key] = !!r[f.key];
    if (typeof r.draft === 'string') try { r.draft = JSON.parse(r.draft); } catch { r.draft = null; }
    return r;
  };
  const isLive = (e, r) => !!r && (e.noStatus || r.status === 'published');

  function read(key, id, {draft = false} = {}) {
    const e = entity(key);
    const r = parse(e, q(`SELECT * FROM ${e.table} WHERE id = ?`).get(id));
    if (r && draft && r.draft) { const {links, ...vals} = r.draft; Object.assign(r, vals); r._links = links; }
    return r;
  }
  const singleton = key => { const e = entity(key); return parse(e, q(`SELECT * FROM ${e.table} ORDER BY id LIMIT 1`).get()); };

  function list(key, {status, where = {}, order, limit, offset = 0, search} = {}) {
    const e = entity(key), conds = [], args = [];
    if (status && !e.noStatus) { conds.push('status = ?'); args.push(status); }
    for (const [k, v] of Object.entries(where)) { conds.push(v === null ? `"${k}" IS NULL` : `"${k}" = ?`); if (v !== null) args.push(v); }
    if (search) { conds.push('search LIKE ?'); args.push(`%${norm(search)}%`); }
    const sql = `SELECT * FROM ${e.table}${conds.length ? ' WHERE ' + conds.join(' AND ') : ''} ORDER BY ${order ?? 'id'}${limit ? ` LIMIT ${+limit} OFFSET ${+offset}` : ''}`;
    return q(sql).all(...args).map(r => parse(e, r));
  }
  const count = (key, status) => { const e = entity(key); return q(`SELECT COUNT(*) n FROM ${e.table}${status && !e.noStatus ? ' WHERE status = ?' : ''}`).get(...(status && !e.noStatus ? [status] : [])).n; };

  function links(key, id, field, {status} = {}) {
    const e = entity(key), f = e.fields.find(x => x.key === field && x.type === 'refs');
    if (!f) fail(400, `câmpul ${field} nu e o relație multiplă`);
    const t = BY_KEY[f.target];
    return q(`SELECT r.*, d.* , r.status AS link_status, r.created_at AS link_created_at, r.created_by AS link_created_by
      FROM ${relTable(e, f)} r JOIN ${t.table} d ON d.id = r.dst_id WHERE r.src_id = ?${status ? ' AND r.status = ?' : ''} ORDER BY r.position, r.dst_id`)
      .all(...(status ? [id, status] : [id]))
      .map(row => ({dst_id: row.dst_id, position: row.position, status: row.link_status, confidence: row.confidence, note: row.note,
        source_id: row.source_id, attrs: row.attrs ? JSON.parse(row.attrs) : null, created_at: row.link_created_at, created_by: row.link_created_by,
        target: parse(t, {...row, id: row.dst_id, status: t.noStatus ? undefined : q(`SELECT status FROM ${t.table} WHERE id = ?`).get(row.dst_id)?.status})}));
  }

  // Relațiile văzute din capătul țintă (calculate, nu stocate de două ori).
  function inverse(key, id) {
    return RELATION_TYPES.filter(r => r.target === key).map(r => {
      const s = BY_KEY[r.source];
      const rows = r.cardinality === 'M:N'
        ? q(`SELECT s.*, x.status AS link_status, x.note AS link_note FROM ${r.storage} x JOIN ${s.table} s ON s.id = x.src_id WHERE x.dst_id = ? ORDER BY s.id`).all(id)
        : q(`SELECT s.* FROM ${s.table} s WHERE s."${r.field}" = ? ORDER BY s.id`).all(id);
      return {relation: r, items: rows.map(row => ({id: row.id, title: titleOf(s, parse(s, row)), status: row.status ?? null, link_status: row.link_status ?? 'confirmed', note: row.link_note ?? null}))};
    }).filter(g => g.items.length);
  }

  // Ce trimite spre o înregistrare (protecția la ștergere, „Folosit de”). Legăturile deținute (owned) nu contează.
  function usage(key, id) {
    const out = [];
    for (const g of inverse(key, id)) if (!g.relation.owned) for (const it of g.items) out.push({key: g.relation.source, id: it.id, title: it.title, via: g.relation.label, relation: g.relation.id});
    const needles = [`ref:${key}:${id}`, `data-ref="${key}:${id}"`, ...(key === 'media' ? [`data-media="${id}"`] : [])];
    for (const e of ENTITIES) {
      const cols = e.fields.filter(f => ['richtext', 'textarea', 'links', 'text'].includes(f.type)).map(f => `"${f.key}"`);
      if (!cols.length) continue;
      const cond = needles.map(() => `(${cols.map(c => `instr(IFNULL(${c},''), ?)`).join(' OR ')}${e.noStatus ? '' : ` OR instr(IFNULL(draft,''), ?)`})`).join(' OR ');
      const args = needles.flatMap(n => [...cols.map(() => n), ...(e.noStatus ? [] : [n])]);
      for (const row of q(`SELECT * FROM ${e.table} WHERE ${cond}`).all(...args))
        if (!(e.key === key && row.id === id) && !out.some(o => o.key === e.key && o.id === row.id))
          out.push({key: e.key, id: row.id, title: titleOf(e, parse(e, row)), via: 'link în text'});
    }
    return out;
  }

  // --- instantaneul pentru propagare --------------------------------------------
  function snap(e, r) {
    if (!r) return null;
    const scopes = [];
    for (const f of e.fields) if ((f.type === 'ref' || f.type === 'image') && r[f.key] != null) scopes.push(`${targetOf(f)}:${r[f.key]}`);
    for (const f of relFields(e))
      for (const l of q(`SELECT dst_id FROM ${relTable(e, f)} WHERE src_id = ? AND status = 'confirmed'`).all(r.id)) scopes.push(`${f.target}:${l.dst_id}`);
    const lf = {};
    for (const k of linkFieldsOf(e)) lf[k] = r[k] ?? null;
    const live = isLive(e, r);
    return {status: e.noStatus ? 'published' : r.status, paths: live && pathOf(e, r) ? [pathOf(e, r)] : [], scopes, title: titleOf(e, r), linkFields: lf};
  }

  function emit(user, action, key, id, before, after, extra = {}) {
    const res = q('INSERT INTO change_events (at, user_name, action, entity, entity_id, label, payload) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(nowIso(), user?.name ?? 'Sistem', action, key, id, (after ?? before)?.title ?? null, JSON.stringify({before, after, ...extra}));
    afterCommit(db, () => { for (const cb of listeners) try { cb({key, id, action, event: Number(res.lastInsertRowid)}); } catch (err) { console.error(err); } });
    return Number(res.lastInsertRowid);
  }

  function audit(user, action, key, id, label, changes, snapshot) {
    if (quiet) return;
    q('INSERT INTO audit_log (at, user_id, user_name, action, entity, entity_id, label, changes, snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(nowIso(), user?.id ?? null, user?.name ?? 'Sistem', action, key, id, label, changes ? JSON.stringify(changes) : null, snapshot ? JSON.stringify(snapshot) : null);
  }

  // --- drepturi -------------------------------------------------------------------
  function need(user, perm, why) {
    if (!user?.perms?.has(perm)) fail(403, `Nu ai dreptul ${perm}${why ? ` (${why})` : ''}.`);
  }
  const writePerm = key => key === 'media' ? 'media.write' : SETTINGS_TYPES.has(key) ? 'settings.write' : 'content.write';
  const publishPerm = e => e.approval ? 'content.approve' : 'content.publish';

  // --- validare și codare ------------------------------------------------------------
  function encode(e, data, current, allowReadonly = false) {
    const out = {}, errors = [];
    for (const f of e.fields) {
      if (!(f.key in data) || f.type === 'refs' || f.readonly && current && !allowReadonly) continue;
      let v = data[f.key];
      if (v === '' && !['text', 'textarea', 'richtext', 'slug'].includes(f.type)) v = null;
      switch (f.type) {
        case 'int': case 'ref': case 'image': v = v == null ? null : Number.parseInt(v, 10); if (Number.isNaN(v)) errors.push({field: f.key, error: 'trebuie să fie un număr întreg'}); break;
        case 'number': case 'money': v = v == null ? null : Number(String(v).replace(',', '.')); if (Number.isNaN(v)) errors.push({field: f.key, error: 'trebuie să fie un număr'}); break;
        case 'boolean': v = v == null ? null : (v === true || v === 1 || v === '1' || v === 'true' || v === 'on') ? 1 : 0; break;
        case 'richtext': v = sanitizeContent(v); break;
        case 'slug': v = v == null ? null : f.allowEmpty && v === '' ? '' : slugify(v) || null; break;
        case 'email': v = v == null ? null : String(v).trim().toLowerCase(); if (v && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v)) errors.push({field: f.key, error: 'adresă de email invalidă'}); break;
        case 'url': v = v == null ? null : String(v).trim(); if (v && !/^(https?:\/\/|\/|ref:)/.test(v)) errors.push({field: f.key, error: 'adresa trebuie să înceapă cu https://, / sau ref:'}); break;
        case 'select': if (v != null && f.options && !f.options.includes(v)) errors.push({field: f.key, error: `valoare nepermisă: ${v}`}); break;
        default: if (JSON_TYPES.has(f.type)) v = v == null ? null : JSON.stringify(typeof v === 'string' ? JSON.parse(v) : v);
          else if (v != null) v = String(v);
      }
      if (f.max && typeof v === 'string' && f.type === 'text' && v.length > f.max) errors.push({field: f.key, error: `cel mult ${f.max} caractere`});
      if ((f.type === 'ref' || f.type === 'image') && v != null) {
        const t = BY_KEY[targetOf(f)];
        const target = q(`SELECT * FROM ${t.table} WHERE id = ?`).get(v);
        if (!target) errors.push({field: f.key, error: `${t.one} ${v} nu există`});
        else if (f.only && !f.only(parse(t, target))) errors.push({field: f.key, error: 'ținta nu e permisă pentru acest câmp'});
      }
      out[f.key] = v;
    }
    return {out, errors};
  }

  function requiredErrors(e, rec) {
    return e.fields.filter(f => f.required && f.type !== 'refs' && (rec[f.key] == null || rec[f.key] === '')).map(f => ({field: f.key, error: 'câmp obligatoriu'}));
  }

  function searchText(e, rec) {
    return norm([titleOf(e, rec), ...e.fields.filter(f => ['text', 'textarea', 'slug', 'richtext'].includes(f.type)).map(f => stripTags(rec[f.key] ?? ''))].join(' ')).slice(0, 4000);
  }

  // Adresa publică e unică între toate tipurile (§1.2).
  function pathTaken(path, selfKey, selfId) {
    if (!path) return null;
    const first = path.split('/')[1];
    if (RESERVED_SLUGS.has(first) && !['blog', 'utilizari'].includes(first)) return 'adresă rezervată';
    if (path.startsWith('/blog/') && RESERVED_SLUGS.has(path.split('/')[2]) && path.split('/')[2] !== '') return null;
    for (const e of ENTITIES) {
      const m = e.public?.match(path);
      if (!m) continue;
      const row = q(`SELECT id FROM ${e.table} WHERE "${m.field}" = ?`).get(m.value);
      if (row && !(e.key === selfKey && row.id === selfId)) return `adresa e folosită de ${e.one.toLowerCase()} ${row.id}`;
    }
    return null;
  }

  function uniqueSlug(e, base, selfId) {
    if (base == null) return null;
    if (base === '') return '';
    let s = base, n = 2;
    const probe = slug => { const r = {slug}; const p = pathOf(e, r); return p ? pathTaken(p, e.key, selfId) : null; };
    while (RESERVED_SLUGS.has(s) || probe(s)) s = `${base}-${n++}`;
    return s;
  }

  // La salvare: jetoane pentru valori și mențiuni → legături deduse (§1.6).
  function enrichText(e, values) {
    if (e.noTokens) return;
    const firma = singleton('firma');
    for (const f of e.fields) if (['richtext', 'textarea'].includes(f.type) && typeof values[f.key] === 'string')
      values[f.key] = tokenizeValues(values[f.key], firma).html;
  }

  function detectMentions(user, e, rec) {
    const texts = e.fields.filter(f => f.type === 'richtext').map(f => rec[f.key] ?? '').join('\n');
    if (!texts.trim()) return [];
    const found = [];
    for (const f of relFields(e)) {
      const t = BY_KEY[f.target];
      if (!t.mentions) continue;
      const cands = list(t.key).filter(c => c.id !== rec.id || t.key !== e.key).map(c => ({key: t.key, id: c.id,
        names: [titleOf(t, c), ...(Array.isArray(c.aliases) ? c.aliases : []), ...q('SELECT alias FROM aliases WHERE entity = ? AND entity_id = ?').all(t.key, c.id).map(a => a.alias)]}));
      const rt = relTable(e, f), rel = `${e.key}.${f.key}`;
      for (const hit of findMentions(texts, cands)) {
        if (q(`SELECT 1 FROM ${rt} WHERE src_id = ? AND dst_id = ?`).get(rec.id, hit.id)) continue;
        if (q('SELECT 1 FROM link_dismissals WHERE relation = ? AND src_id = ? AND dst_id = ?').get(rel, rec.id, hit.id)) continue;
        q(`INSERT INTO ${rt} (src_id, dst_id, position, status, confidence, note, created_at, created_by) VALUES (?, ?, 999, 'inferred', 0.6, ?, ?, ?)`)
          .run(rec.id, hit.id, `numele în text: „${hit.excerpt}”`, nowIso(), 'detectare');
        found.push({relation: rel, dst: hit.id, excerpt: hit.excerpt});
      }
    }
    return found;
  }

  function manualProvenance(user, key, id, fields) {
    if (!user || user === SYSTEM_USER || user.import) return;
    const url = `manual:${user.name}`;
    q(`INSERT INTO sources (kind, url, title, created_at) VALUES ('manual', ?, ?, ?) ON CONFLICT(url) DO NOTHING`).run(url, `Editare în /manage — ${user.name}`, nowIso());
    const sid = q('SELECT id FROM sources WHERE url = ?').get(url).id;
    for (const field of fields) {
      q('DELETE FROM provenance WHERE entity = ? AND entity_id = ? AND field = ?').run(key, id, field);
      q(`INSERT INTO provenance (entity, entity_id, field, source_id, method, certainty, verified_at, verified_by, created_at) VALUES (?, ?, ?, ?, 'manual', 'confirmed', ?, ?, ?)`)
        .run(key, id, field, sid, nowIso(), user.name, nowIso());
    }
  }

  function writeRow(e, id, values) {
    const keys = Object.keys(values);
    if (!keys.length) return;
    q(`UPDATE ${e.table} SET ${keys.map(k => `"${k}" = ?`).join(', ')} WHERE id = ?`).run(...keys.map(k => values[k]), id);
  }

  // 301 automat la schimbarea adresei unei pagini publicate (§3.8): spre entitate, deci fără lanțuri.
  function autoRedirect(user, e, id, oldPath, newPath) {
    if (!oldPath || !newPath || oldPath === newPath) return;
    const R = BY_KEY.redirecturi;
    q(`DELETE FROM ${R.table} WHERE from_path = ?`).run(newPath);                       // fără bucle
    q(`DELETE FROM ${R.table} WHERE from_path = ?`).run(oldPath);
    const ts = nowIso();
    const r = q(`INSERT INTO ${R.table} (from_path, to_ref, code, auto, created_at, updated_at, created_by, updated_by, search) VALUES (?, ?, 301, 1, ?, ?, ?, ?, ?)`)
      .run(oldPath, `ref:${e.key}:${id}`, ts, ts, user?.name ?? 'Sistem', user?.name ?? 'Sistem', norm(oldPath));
    const rid = Number(r.lastInsertRowid);
    q(`UPDATE ${R.table} SET to_ref = ?, to_path = NULL WHERE to_path = ?`).run(`ref:${e.key}:${id}`, oldPath);   // redirecționările vechi spre adresa veche
    audit(user, 'create', 'redirecturi', rid, oldPath, null, null);
    emit(user, 'create', 'redirecturi', rid, null, snap(R, read('redirecturi', rid)));
  }

  // --- scrieri --------------------------------------------------------------------
  function create(user, key, data = {}, opts = {}) {
    const e = entity(key);
    need(user, writePerm(key));
    if (e.singleton && count(key) > 0) fail(409, `${e.label}: există deja o înregistrare`);
    return tx(db, () => {
      const {out, errors} = encode(e, data, null);
      for (const f of e.fields) if (f.type === 'slug' && !(f.key in data) && f.from && data[f.from]) out[f.key] = slugify(data[f.from]);
      const all = [...errors, ...requiredErrors(e, out), ...(e.validate?.(out) ?? [])];
      if (all.length) fail(422, 'Date invalide', {errors: all});
      for (const f of e.fields) if (f.type === 'slug' && out[f.key] != null) out[f.key] = uniqueSlug(e, out[f.key], null);
      enrichText(e, out);
      let status = e.noStatus ? undefined : opts.status ?? 'draft';
      if (status === 'published') need(user, publishPerm(e), e.approval ? 'tipul cere aprobare' : null);
      const ts = nowIso();
      const row = {...out, ...(status ? {status, published_at: status === 'published' ? (opts.published_at ?? ts) : null} : {}),
        legacy_ref: opts.legacy_ref ?? null, created_at: opts.created_at ?? ts, updated_at: opts.updated_at ?? ts, created_by: user.name, updated_by: user.name};
      row.search = searchText(e, row);
      const cols = Object.keys(row);
      const res = q(`INSERT INTO ${e.table} (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map(c => row[c]));
      const id = Number(res.lastInsertRowid);
      for (const f of relFields(e)) if (Array.isArray(data[f.key])) writeLinks(user, e, f, id, data[f.key]);
      const rec = read(key, id);
      const inferred = detectMentions(user, e, rec);
      manualProvenance(user, key, id, Object.keys(out));
      audit(user, 'create', key, id, titleOf(e, rec), null, null);
      if (isLive(e, rec)) emit(user, 'create', key, id, null, snap(e, rec));
      return {...rec, _inferred: inferred};
    });
  }

  // Salvarea: pe o înregistrare publicată scrie ciorna (site-ul rămâne neschimbat, zero evenimente);
  // cu {publish: true} sau pe tipurile fără stare scrie direct și emite evenimentul.
  function update(user, key, id, data = {}, opts = {}) {
    const e = entity(key);
    need(user, writePerm(key));
    return tx(db, () => {
      const cur = read(key, id);
      if (!cur) fail(404, `${e.one} ${id} nu există`);
      if (opts.version != null && +opts.version !== cur.version) fail(409, 'Între timp a salvat altcineva.', {current: cur});
      const {out, errors} = encode(e, data, cur, opts.system);
      const merged = {...cur, ...(cur.draft ?? {}), ...out};
      const all = [...errors, ...requiredErrors(e, merged), ...(e.validate?.(merged) ?? [])];
      if (all.length) fail(422, 'Date invalide', {errors: all});
      for (const f of e.fields) if (f.type === 'slug' && f.key in out && out[f.key] != null && out[f.key] !== cur[f.key]) out[f.key] = uniqueSlug(e, out[f.key], id);
      enrichText(e, out);
      const raw = q(`SELECT * FROM ${e.table} WHERE id = ?`).get(id);
      const same = (a, b) => (a ?? null) === (b ?? null) || (a != null && b != null && String(a) === String(b));
      const changed = Object.keys(out).filter(k => !same(out[k], raw[k]));
      const linkChanges = relFields(e).filter(f => Array.isArray(data[f.key]));
      // o salvare care nu schimbă nimic nu scrie istoric și nu emite eveniment
      const publishes = opts.publish && !e.noStatus && (cur.status !== 'published' || cur.draft);
      if (!changed.length && !linkChanges.length && !publishes) return cur;
      const toDraft = !e.noStatus && cur.status === 'published' && !opts.publish && !opts.live;

      if (toDraft) {
        const draft = {...(cur.draft ?? {})};
        for (const k of changed) draft[k] = out[k];
        for (const f of linkChanges) (draft.links ??= {})[f.key] = data[f.key];
        q(`UPDATE ${e.table} SET draft = ?, version = version + 1, updated_at = ?, updated_by = ? WHERE id = ?`)
          .run(Object.keys(draft).length ? JSON.stringify(draft) : null, nowIso(), user.name, id);
        manualProvenance(user, key, id, changed);
        audit(user, 'draft', key, id, titleOf(e, cur), Object.fromEntries(changed.map(k => [k, [cur[k], out[k]]])), null);
        return {...read(key, id), _draft: true};
      }

      if (opts.publish && !e.noStatus) need(user, publishPerm(e), e.approval ? 'tipul cere aprobare' : null);
      // o scriere directă pe site (revenire, capătul invers) nu ocolește aprobarea
      if (!opts.publish && !e.noStatus && cur.status === 'published' && e.approval) need(user, 'content.approve', 'modificare directă a unui tip cu aprobare');
      const before = snap(e, cur);
      const pending = opts.publish && cur.draft ? cur.draft : {};
      const {links: draftLinks, ...draftVals} = pending;
      const values = {...draftVals, ...out};
      if (opts.publish && !e.noStatus) { values.status = 'published'; if (!cur.published_at) values.published_at = nowIso(); }
      // publicarea consumă ciorna; o scriere directă o lasă în așteptare (nu pierde ce n-a fost aprobat)
      if (!e.noStatus && opts.publish) values.draft = null;
      const next = {...cur, ...values};
      values.search = searchText(e, next);
      values.updated_at = nowIso(); values.updated_by = user.name;
      writeRow(e, id, values);
      q(`UPDATE ${e.table} SET version = version + 1 WHERE id = ?`).run(id);
      const touched = [];
      for (const [field, items] of [...Object.entries(draftLinks ?? {}), ...linkChanges.map(f => [f.key, data[f.key]])])
        touched.push(...writeLinks(user, e, e.fields.find(f => f.key === field), id, items));
      const rec = read(key, id);
      const inferred = detectMentions(user, e, rec);
      manualProvenance(user, key, id, changed);
      const allChanged = [...new Set([...changed, ...Object.keys(draftVals)])];
      audit(user, opts.publish ? 'publish' : 'update', key, id, titleOf(e, rec),
        Object.fromEntries(allChanged.map(k => [k, [cur[k], rec[k]]])), cur);
      const after = snap(e, rec);
      if (isLive(e, cur) || isLive(e, rec)) {
        emit(user, opts.publish && cur.status !== 'published' ? 'publish' : 'update', key, id, before, after, {changed: allChanged, touched});
        if (isLive(e, cur) && isLive(e, rec)) autoRedirect(user, e, id, before.paths[0], after.paths[0]);
      }
      return {...rec, _inferred: inferred};
    });
  }

  const publish = (user, key, id) => update(user, key, id, {}, {publish: true});

  function setStatus(user, key, id, status) {
    const e = entity(key);
    if (e.noStatus) fail(400, `${e.label} nu au stare`);
    if (!['draft', 'published', 'archived'].includes(status)) fail(400, 'stare necunoscută');
    if (status === 'published') return publish(user, key, id);
    need(user, writePerm(key));
    if (e.approval) need(user, 'content.approve', 'retragerea sau arhivarea unui tip cu aprobare');
    else need(user, 'content.publish');
    return tx(db, () => {
      const cur = read(key, id);
      if (!cur) fail(404, `${e.one} ${id} nu există`);
      if (cur.status === status) return cur;
      const before = snap(e, cur);
      q(`UPDATE ${e.table} SET status = ?, version = version + 1, updated_at = ?, updated_by = ? WHERE id = ?`).run(status, nowIso(), user.name, id);
      const rec = read(key, id);
      audit(user, status === 'archived' ? 'archive' : 'unpublish', key, id, titleOf(e, rec), {status: [cur.status, status]}, cur);
      if (isLive(e, cur)) emit(user, status === 'archived' ? 'archive' : 'unpublish', key, id, before, snap(e, rec));
      return rec;
    });
  }

  function remove(user, key, id, {force = false} = {}) {
    const e = entity(key);
    need(user, 'content.delete');
    return tx(db, () => {
      const cur = read(key, id);
      if (!cur) fail(404, `${e.one} ${id} nu există`);
      const used = usage(key, id);
      if (used.length && !force) fail(409, `${e.one} e folosit${e.one.endsWith('ă') ? 'ă' : ''} în ${used.length} locuri.`, {usage: used});
      const before = snap(e, cur);
      // copiii deținuți (secțiunile unei pagini, variantele unei game) pleacă odată cu părintele
      const owned = [];
      for (const f of relFields(e).filter(f => f.owned)) for (const l of links(key, id, f.key)) owned.push([f.target, l.dst_id]);
      const ownedFk = RELATION_TYPES.filter(r => r.target === key && r.owned && r.cardinality === 'N:1')
        .flatMap(r => q(`SELECT id FROM ${BY_KEY[r.source].table} WHERE "${r.field}" = ?`).all(id).map(x => [r.source, x.id]));
      for (const [k, cid] of ownedFk) remove(user, k, cid, {force: true});
      q(`DELETE FROM ${e.table} WHERE id = ?`).run(id);
      for (const [k, cid] of owned) if (!usage(k, cid).length) remove(user, k, cid, {force: true});
      q('DELETE FROM provenance WHERE entity = ? AND entity_id = ?').run(key, id);
      audit(user, 'delete', key, id, before.title, null, cur);
      if (isLive(e, cur)) emit(user, 'delete', key, id, before, null, {touched: used.map(u => ({key: u.key, id: u.id}))});
      return {deleted: true};
    });
  }

  // Legăturile multiple. Întoarce capetele atinse (touched).
  function writeLinks(user, e, f, id, items) {
    if (!f || f.type !== 'refs') fail(400, 'câmpul nu e o relație multiplă');
    if (f.max && items.length > f.max) fail(422, `cel mult ${f.max} legături`);
    const t = BY_KEY[f.target], rt = relTable(e, f);
    const old = q(`SELECT * FROM ${rt} WHERE src_id = ?`).all(id);
    const norm1 = it => typeof it === 'object' ? it : {id: +it};
    const next = items.map(norm1);
    for (const it of next) {
      const target = q(`SELECT * FROM ${t.table} WHERE id = ?`).get(it.id);
      if (!target) fail(422, `${t.one} ${it.id} nu există`);
      if (f.only && !f.only(parse(t, target))) fail(422, `${t.one} ${it.id} nu e permis aici`);
    }
    const keep = new Map(old.map(o => [o.dst_id, o]));
    q(`DELETE FROM ${rt} WHERE src_id = ?`).run(id);
    const ins = q(`INSERT INTO ${rt} (src_id, dst_id, position, status, confidence, source_id, note, attrs, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    next.forEach((it, i) => {
      const o = keep.get(it.id);
      ins.run(id, it.id, f.ordered ? i : 0, it.status ?? o?.status ?? 'confirmed', it.confidence ?? o?.confidence ?? null, it.source_id ?? o?.source_id ?? null,
        it.note ?? o?.note ?? null, it.attrs ? JSON.stringify(it.attrs) : o?.attrs ?? null, o?.created_at ?? nowIso(), o?.created_by ?? user.name);
    });
    const ids = new Set(next.map(x => x.id));
    const touched = [...new Set([...old.map(o => o.dst_id).filter(d => !ids.has(d)), ...next.map(x => x.id).filter(d => !keep.has(d))])];
    return touched.map(d => ({key: f.target, id: d}));
  }

  function setLinks(user, key, id, field, items) {
    const e = entity(key), f = e.fields.find(x => x.key === field && x.type === 'refs');
    if (!f) fail(400, `câmpul ${field} nu e o relație multiplă`);
    need(user, writePerm(key));
    if (f.sensitive) need(user, 'content.approve', 'relație sensibilă');
    return tx(db, () => {
      const cur = read(key, id);
      if (!cur) fail(404, `${e.one} ${id} nu există`);
      const before = snap(e, cur);
      const oldList = q(`SELECT dst_id, attrs, status FROM ${relTable(e, f)} WHERE src_id = ? ORDER BY position, dst_id`).all(id);
      const touched = writeLinks(user, e, f, id, items);
      const newList = q(`SELECT dst_id, attrs, status FROM ${relTable(e, f)} WHERE src_id = ? ORDER BY position, dst_id`).all(id);
      if (JSON.stringify(oldList) === JSON.stringify(newList)) return {changed: false};
      audit(user, 'links', key, id, titleOf(e, cur), {[field]: [oldList.map(o => o.dst_id), newList.map(o => o.dst_id)]}, null);
      if (isLive(e, cur)) emit(user, 'links', key, id, before, snap(e, read(key, id)), {changed: [field], touched, reorder: touched.length === 0});
      return {changed: true, live: isLive(e, cur), touched};
    });
  }

  // Din capătul invers: lista surselor care trimit spre (key, id) prin srcKey.field.
  function setInverse(user, key, id, srcKey, field, srcIds) {
    const s = entity(srcKey), f = s.fields.find(x => x.key === field);
    if (!f || targetOf(f) !== key) fail(400, 'relație necunoscută');
    need(user, writePerm(srcKey));
    if (f.sensitive) need(user, 'content.approve', 'relație sensibilă');
    return tx(db, () => {
      const want = new Set(srcIds.map(Number));
      if (f.type === 'refs') {
        const rt = relTable(s, f);
        const have = new Set(q(`SELECT src_id FROM ${rt} WHERE dst_id = ?`).all(id).map(r => r.src_id));
        for (const sid of new Set([...want, ...have])) {
          if (want.has(sid) === have.has(sid)) continue;
          const cur = links(srcKey, sid, field).map(l => ({id: l.dst_id, status: l.status, attrs: l.attrs, note: l.note}));
          setLinks(user, srcKey, sid, field, want.has(sid) ? [...cur, {id}] : cur.filter(l => l.id !== id));
        }
      } else {
        const have = new Set(q(`SELECT id FROM ${s.table} WHERE "${field}" = ?`).all(id).map(r => r.id));
        for (const sid of have) if (!want.has(sid)) {
          if (f.required) fail(422, `Legătura e obligatorie pentru ${s.one.toLowerCase()} ${sid}: nu se poate scoate din acest capăt.`);
          update(user, srcKey, sid, {[field]: null}, {live: true});
        }
        for (const sid of want) if (!have.has(sid)) update(user, srcKey, sid, {[field]: id}, {live: true});   // N:1: mută legătura de la ținta veche
      }
      return {inverse: inverse(key, id)};
    });
  }

  function setLinkStatus(user, key, id, field, dst, status, {note} = {}) {
    const e = entity(key), f = e.fields.find(x => x.key === field && x.type === 'refs');
    if (!f) fail(400, 'relație necunoscută');
    need(user, writePerm(key));
    if (f.sensitive || e.approval) need(user, 'content.approve', 'confirmarea unei legături sensibile sau a unui tip cu aprobare');
    if (!['confirmed', 'inferred', 'unverified', 'dismissed'].includes(status)) fail(400, 'stare necunoscută');
    return tx(db, () => {
      const cur = read(key, id);
      const before = snap(e, cur);
      const rt = relTable(e, f);
      const row = q(`SELECT * FROM ${rt} WHERE src_id = ? AND dst_id = ?`).get(id, dst);
      if (!row) fail(404, 'legătura nu există');
      if (status === 'dismissed') {
        q(`DELETE FROM ${rt} WHERE src_id = ? AND dst_id = ?`).run(id, dst);
        q('INSERT OR REPLACE INTO link_dismissals (relation, src_id, dst_id, evidence, at, by) VALUES (?, ?, ?, ?, ?, ?)').run(`${key}.${field}`, id, dst, row.note, nowIso(), user.name);
      } else q(`UPDATE ${rt} SET status = ?, note = COALESCE(?, note) WHERE src_id = ? AND dst_id = ?`).run(status, note ?? null, id, dst);
      audit(user, 'link-status', key, id, titleOf(e, cur), {[`${field}:${dst}`]: [row.status, status]}, null);
      if (isLive(e, cur) && (row.status === 'confirmed') !== (status === 'confirmed'))
        emit(user, 'link-status', key, id, before, snap(e, read(key, id)), {changed: [field], touched: [{key: f.target, id: dst}]});
      return {status};
    });
  }

  // Confirmarea sau scoaterea în masă: o tranzacție, un singur eveniment (§2.5).
  function bulkLinkStatus(user, relation, pairs, status) {
    const [key, field] = relation.split('.');
    const e = entity(key), f = e.fields.find(x => x.key === field);
    need(user, writePerm(key));
    if (f.sensitive || e.approval) need(user, 'content.approve', 'relație sensibilă');
    if (pairs.length > 5000) fail(422, 'cel mult 5.000 de perechi');
    return tx(db, () => {
      const rt = relTable(e, f), touched = [], befores = {};
      for (const [src, dst] of pairs) {
        befores[src] ??= snap(e, read(key, src));
        const row = q(`SELECT * FROM ${rt} WHERE src_id = ? AND dst_id = ?`).get(src, dst);
        if (!row) continue;
        if (status === 'dismissed') {
          q(`DELETE FROM ${rt} WHERE src_id = ? AND dst_id = ?`).run(src, dst);
          q('INSERT OR REPLACE INTO link_dismissals (relation, src_id, dst_id, evidence, at, by) VALUES (?, ?, ?, ?, ?, ?)').run(relation, src, dst, row.note, nowIso(), user.name);
        } else q(`UPDATE ${rt} SET status = ? WHERE src_id = ? AND dst_id = ?`).run(status, src, dst);
        audit(user, 'link-status', key, src, null, {[`${field}:${dst}`]: [row.status, status]}, null);
        touched.push({key, id: src}, {key: f.target, id: dst});
      }
      emit(user, 'bulk-links', key, null, null, null, {relation, status, touched,
        scopes: Object.entries(befores).map(([src, b]) => ({id: +src, before: b, after: snap(e, read(key, +src))}))});
      return {count: pairs.length};
    });
  }

  function confirmProvenance(user, provId) {
    const p = q('SELECT * FROM provenance WHERE id = ?').get(provId);
    if (!p) fail(404, 'sursa nu există');
    need(user, 'content.write');
    if (entity(p.entity).approval) need(user, 'content.approve', 'tipul cere aprobare');
    return tx(db, () => {
      q(`UPDATE provenance SET certainty = 'confirmed', verified_at = ?, verified_by = ? WHERE id = ?`).run(nowIso(), user.name, provId);
      audit(user, 'confirm-source', p.entity, p.entity_id, null, {[p.field || '*']: [p.certainty, 'confirmed']}, null);
      return {confirmed: true};
    });
  }

  // Unirea dublurilor (§1.7): tot ce trimitea spre dublură trimite spre înregistrarea păstrată.
  function merge(user, key, keepId, dupIds) {
    const e = entity(key);
    need(user, 'content.write'); need(user, 'content.delete');
    return tx(db, () => {
      const keep = read(key, keepId);
      if (!keep) fail(404, 'înregistrarea păstrată nu există');
      const touched = [];
      for (const dup of dupIds) {
        if (dup === keepId) continue;
        const d = read(key, dup);
        if (!d) continue;
        for (const r of RELATION_TYPES.filter(r => r.target === key)) {
          const s = BY_KEY[r.source];
          if (r.cardinality === 'N:1') {
            for (const x of q(`SELECT id FROM ${s.table} WHERE "${r.field}" = ?`).all(dup)) touched.push({key: r.source, id: x.id});
            q(`UPDATE ${s.table} SET "${r.field}" = ? WHERE "${r.field}" = ?`).run(keepId, dup);
          } else {
            for (const x of q(`SELECT src_id FROM ${r.storage} WHERE dst_id = ?`).all(dup)) touched.push({key: r.source, id: x.src_id});
            q(`INSERT OR IGNORE INTO ${r.storage} (src_id, dst_id, position, status, confidence, source_id, note, attrs, created_at, created_by)
               SELECT src_id, ?, position, status, confidence, source_id, note, attrs, created_at, created_by FROM ${r.storage} WHERE dst_id = ? AND src_id != ?`).run(keepId, dup, keepId);
            q(`DELETE FROM ${r.storage} WHERE dst_id = ?`).run(dup);
          }
        }
        for (const f of relFields(e)) {
          const rt = relTable(e, f);
          q(`INSERT OR IGNORE INTO ${rt} (src_id, dst_id, position, status, confidence, source_id, note, attrs, created_at, created_by)
             SELECT ?, dst_id, position, status, confidence, source_id, note, attrs, created_at, created_by FROM ${rt} WHERE src_id = ?`).run(keepId, dup);
        }
        // linkurile din texte, inclusiv din ciorne
        for (const s of ENTITIES) {
          const cols = s.fields.filter(f => ['richtext', 'textarea', 'links', 'text', 'url'].includes(f.type)).map(f => f.key).concat(s.noStatus ? [] : ['draft']);
          for (const c of cols) {
            const rows = q(`SELECT id, "${c}" v FROM ${s.table} WHERE instr(IFNULL("${c}",''), ?) OR instr(IFNULL("${c}",''), ?)`).all(`ref:${key}:${dup}`, `data-ref="${key}:${dup}"`);
            for (const row of rows) {
              const v = row.v.replace(new RegExp(`ref:${key}:${dup}(?!\\d)`, 'g'), `ref:${key}:${keepId}`).replace(new RegExp(`data-ref="${key}:${dup}"`, 'g'), `data-ref="${key}:${keepId}"`);
              q(`UPDATE ${s.table} SET "${c}" = ? WHERE id = ?`).run(v, row.id);
              touched.push({key: s.key, id: row.id});
            }
          }
        }
        q('UPDATE OR IGNORE provenance SET entity_id = ? WHERE entity = ? AND entity_id = ?').run(keepId, key, dup);
        q('DELETE FROM provenance WHERE entity = ? AND entity_id = ?').run(key, dup);
        const before = snap(e, d);
        q(`DELETE FROM ${e.table} WHERE id = ?`).run(dup);
        audit(user, 'merge', key, dup, before.title, {merged_into: [dup, keepId]}, d);
        emit(user, 'merge', key, dup, before, null, {merged_into: keepId, touched: [...touched, {key, id: keepId}]});
      }
      for (const t of touched) if (t.key !== key || t.id !== keepId) {
        const s = BY_KEY[t.key], r = read(t.key, t.id);
        if (r && isLive(s, r)) emit(user, 'update', t.key, t.id, snap(s, r), snap(s, r), {changed: ['*'], reason: 'unire'});
      }
      const k = read(key, keepId);
      emit(user, 'update', key, keepId, snap(e, k), snap(e, k), {changed: ['*'], reason: 'unire'});
      return k;
    });
  }

  // Revenire din istoric: tot o modificare, cu eveniment (§3.6).
  function revert(user, auditId, {field} = {}) {
    const a = q('SELECT * FROM audit_log WHERE id = ?').get(auditId);
    if (!a) fail(404, 'intrarea din istoric nu există');
    const changes = a.changes ? JSON.parse(a.changes) : {};
    const data = {};
    for (const [k, [oldV]] of Object.entries(changes)) if (!field || k === field) if (entity(a.entity).fields.some(f => f.key === k && f.type !== 'refs')) data[k] = oldV;
    if (!Object.keys(data).length) fail(422, 'nimic de readus');
    const res = update(user, a.entity, a.entity_id, data, {live: true});
    q('UPDATE audit_log SET reverted_by = (SELECT MAX(id) FROM audit_log) WHERE id = ?').run(auditId);
    return res;
  }

  function quietly(fn) { quiet++; try { return fn(); } finally { quiet--; } }

  return {
    db, read, list, count, links, inverse, usage, singleton, snap, isLive,
    create, update, publish, setStatus, remove, setLinks, setInverse, setLinkStatus, bulkLinkStatus, confirmProvenance, merge, revert,
    emit, audit, quietly, need, onChange: cb => (listeners.add(cb), () => listeners.delete(cb)),
    history: (key, id) => q('SELECT * FROM audit_log WHERE entity = ? AND entity_id = ? ORDER BY id DESC').all(key, id),
    provenance: (key, id) => q('SELECT p.*, s.url, s.kind, s.title AS source_title, s.fetched_at, s.snapshot_file FROM provenance p JOIN sources s ON s.id = p.source_id WHERE p.entity = ? AND p.entity_id = ? ORDER BY p.field').all(key, id),
    meta: {get: k => meta.get(db, k), set: (k, v) => meta.set(db, k, v)}
  };
}
