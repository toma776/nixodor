// Harta legăturilor (§2.4): datele vin din registru și din tabele, nimic nu e întreținut de mână.
import {ENTITIES, BY_KEY, RELATION_TYPES, titleOf, pathOf} from '../registry/entities.mjs';

export function createGraph(store) {
  const q = sql => store.db.prepare(sql);

  function relCounts(r) {
    const s = BY_KEY[r.source];
    if (r.cardinality === 'M:N') {
      const row = q(`SELECT COUNT(*) n, COUNT(DISTINCT src_id) srcs, COUNT(DISTINCT dst_id) dsts,
        SUM(status = 'confirmed') confirmed, SUM(status = 'inferred') inferred, SUM(status = 'unverified') unverified FROM ${r.storage}`).get();
      return {...row};
    }
    const row = q(`SELECT COUNT("${r.field}") n, COUNT(DISTINCT CASE WHEN "${r.field}" IS NOT NULL THEN id END) srcs, COUNT(DISTINCT "${r.field}") dsts FROM ${s.table}`).get();
    return {...row, confirmed: row.n, inferred: 0, unverified: 0};
  }

  function overview() {
    const nodes = ENTITIES.map(e => ({key: e.key, label: e.label, category: e.category, color: e.color, count: store.count(e.key), hub: e.hub !== false}));
    const edges = RELATION_TYPES.map(r => ({...r, ...relCounts(r)}));
    return {nodes, edges};
  }

  function examples(r, n = 3) {
    const s = BY_KEY[r.source], t = BY_KEY[r.target];
    const rows = r.cardinality === 'M:N'
      ? q(`SELECT src_id, dst_id FROM ${r.storage} LIMIT ${n}`).all()
      : q(`SELECT id src_id, "${r.field}" dst_id FROM ${s.table} WHERE "${r.field}" IS NOT NULL LIMIT ${n}`).all();
    return rows.map(x => ({from: titleOf(s, store.read(s.key, x.src_id)), to: titleOf(t, store.read(t.key, x.dst_id))}));
  }

  // Panoul unei relații: stocare, cardinalitate, cifre reale, exemple, rupte, obligatorii goale.
  function relation(id) {
    const r = RELATION_TYPES.find(x => x.id === id);
    if (!r) return null;
    const s = BY_KEY[r.source];
    const emptyRequired = r.required ? q(`SELECT COUNT(*) n FROM ${s.table} WHERE "${r.field}" IS NULL`).get().n : 0;
    return {...r, ...relCounts(r), examples: examples(r), broken: 0, emptyRequired,
      editableFrom: [BY_KEY[r.source].label, r.cardinality === 'N:1' && !r.required ? `${BY_KEY[r.target].label} (capătul invers, mută legătura)` : BY_KEY[r.target].label],
      onDelete: r.cardinality === 'M:N' ? 'legătura dispare (cascadă)' : r.required ? 'ștergerea țintei e blocată (RESTRICT)' : 'câmpul devine gol (SET NULL)'};
  }

  // Sănătatea hărții (§2.4, pilateslab).
  function health() {
    const ov = overview();
    const used = new Set(ov.edges.filter(e => e.n > 0).flatMap(e => [e.source, e.target]));
    const isolated = ov.nodes.filter(n => n.count > 0 && !used.has(n.key)).map(n => n.key);
    const unused = ov.edges.filter(e => e.n === 0).map(e => e.id);
    const emptyRequired = RELATION_TYPES.filter(r => r.required).map(r => ({relation: r.id, n: q(`SELECT COUNT(*) n FROM ${BY_KEY[r.source].table} WHERE "${r.field}" IS NULL`).get().n})).filter(x => x.n);
    // trimiteri din texte (data-ref, ref:) spre înregistrări care nu mai există
    const broken = [];
    for (const e of ENTITIES) {
      const cols = e.fields.filter(f => ['richtext', 'links', 'text', 'textarea'].includes(f.type)).map(f => f.key);
      for (const c of cols) for (const row of q(`SELECT id, "${c}" v FROM ${e.table} WHERE "${c}" LIKE '%ref%'`).all())
        for (const [, k, rid] of String(row.v).matchAll(/(?:ref:|data-ref=")([a-z-]+):(\d+)/g))
          if (!BY_KEY[k] || !store.read(k, +rid)) broken.push({from: `${e.key}:${row.id}`, field: c, to: `${k}:${rid}`});
    }
    // înregistrări orfane: nimic nu trimite spre ele și nici ele nu trimit nicăieri
    const orphans = [];
    for (const e of ENTITIES) {
      if (['firma', 'meniuri', 'redirecturi', 'media'].includes(e.key)) continue;
      const out = RELATION_TYPES.filter(r => r.source === e.key), inn = RELATION_TYPES.filter(r => r.target === e.key);
      for (const rec of store.list(e.key)) {
        const has = out.some(r => r.cardinality === 'M:N' ? q(`SELECT 1 FROM ${r.storage} WHERE src_id = ? LIMIT 1`).get(rec.id) : rec[r.field] != null)
          || inn.some(r => r.cardinality === 'M:N' ? q(`SELECT 1 FROM ${r.storage} WHERE dst_id = ? LIMIT 1`).get(rec.id) : q(`SELECT 1 FROM ${BY_KEY[r.source].table} WHERE "${r.field}" = ? LIMIT 1`).get(rec.id))
          || q(`SELECT 1 FROM page_deps WHERE entity = ? AND entity_id = ? AND kind != 'page' LIMIT 1`).get(e.key, rec.id);
        if (!has) orphans.push({key: e.key, id: rec.id, title: titleOf(e, rec)});
      }
    }
    return {isolated, unused, broken, emptyRequired, orphans};
  }

  function neighbors(key, id) {
    const e = BY_KEY[key], rec = store.read(key, id);
    if (!rec) return null;
    const out = [], inn = [];
    for (const r of RELATION_TYPES.filter(r => r.source === key)) {
      const t = BY_KEY[r.target];
      const ids = r.cardinality === 'M:N' ? q(`SELECT dst_id id, status FROM ${r.storage} WHERE src_id = ?`).all(id) : rec[r.field] != null ? [{id: rec[r.field], status: 'confirmed'}] : [];
      for (const x of ids) out.push({relation: r.id, verb: r.verb, key: t.key, id: x.id, title: titleOf(t, store.read(t.key, x.id)), status: x.status, sensitive: r.sensitive});
    }
    for (const r of RELATION_TYPES.filter(r => r.target === key)) {
      const s = BY_KEY[r.source];
      const ids = r.cardinality === 'M:N' ? q(`SELECT src_id id, status FROM ${r.storage} WHERE dst_id = ?`).all(id) : q(`SELECT id, 'confirmed' status FROM ${s.table} WHERE "${r.field}" = ?`).all(id);
      for (const x of ids) inn.push({relation: r.id, verb: r.verb, key: s.key, id: x.id, title: titleOf(s, store.read(s.key, x.id)), status: x.status, sensitive: r.sensitive});
    }
    const pages = q(`SELECT path, component, reason FROM page_deps WHERE entity = ? AND entity_id = ? AND path NOT LIKE '#%'`).all(key, id);
    return {node: {key, id, title: titleOf(e, rec), path: pathOf(e, rec), color: e.color}, out, in: inn, pages};
  }

  // Traseul cel mai scurt: BFS, cel mult 6 pași, fără media ca intermediar.
  function path(from, to) {
    const [fk, fid] = from.split(':'), [tk, tid] = to.split(':');
    const start = `${fk}:${+fid}`, goal = `${tk}:${+tid}`;
    const prev = new Map([[start, null]]);
    let frontier = [start];
    for (let depth = 0; depth < 6 && frontier.length && !prev.has(goal); depth++) {
      const next = [];
      for (const node of frontier) {
        const [k, i] = node.split(':');
        if (k === 'media' && node !== start) continue;
        const n = neighbors(k, +i);
        for (const x of [...(n?.out ?? []), ...(n?.in ?? [])]) {
          const id = `${x.key}:${x.id}`;
          if (prev.has(id)) continue;
          prev.set(id, {from: node, via: x.relation, verb: x.verb});
          next.push(id);
        }
      }
      frontier = next;
    }
    if (!prev.has(goal)) return null;
    const steps = [];
    for (let cur = goal; prev.get(cur); cur = prev.get(cur).from) steps.unshift({node: cur, ...prev.get(cur)});
    const label = id => { const [k, i] = id.split(':'); return titleOf(BY_KEY[k], store.read(k, +i)); };
    return {length: steps.length, steps: [{node: start, title: label(start)}, ...steps.map(s => ({node: s.node, title: label(s.node), via: s.via, verb: s.verb}))]};
  }

  return {overview, relation, health, neighbors, path};
}
