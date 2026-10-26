// „Unde apare” (§2.3): patru niveluri ținute separat, ca nimic nesigur să nu fie prezentat drept fapt.
import {BY_KEY, entity, titleOf, relFields} from '../registry/entities.mjs';
import {TOKENS, norm, mentionable, stripTags} from './content.mjs';

export function whereUsed(store, key, id) {
  const e = entity(key), db = store.db, q = sql => db.prepare(sql);
  const rec = store.read(key, id);
  if (!rec) return null;

  // 1. relațiile directe, din ambele capete, cu starea lor
  const direct = [];
  for (const f of e.fields.filter(f => f.type === 'ref' || f.type === 'image')) if (rec[f.key] != null) {
    const t = BY_KEY[f.type === 'image' ? 'media' : f.target], r = store.read(t.key, rec[f.key]);
    direct.push({dir: 'out', relation: `${key}.${f.key}`, label: f.label, key: t.key, id: rec[f.key], title: titleOf(t, r), status: 'confirmed'});
  }
  for (const f of relFields(e)) for (const l of store.links(key, id, f.key))
    direct.push({dir: 'out', relation: `${key}.${f.key}`, label: f.label, key: f.target, id: l.dst_id, title: titleOf(BY_KEY[f.target], l.target), status: l.status, note: l.note});
  for (const g of store.inverse(key, id)) for (const it of g.items)
    direct.push({dir: 'in', relation: g.relation.id, label: g.relation.inverseLabel === e.label ? g.relation.label : `${BY_KEY[g.relation.source].label} (${g.relation.verb})`,
      key: g.relation.source, id: it.id, title: it.title, status: it.link_status, note: it.note, owned: g.relation.owned});

  // 2. utilizările efective în pagini, din dependențele măsurate (page_deps)
  const deps = q('SELECT * FROM page_deps WHERE entity = ? AND entity_id = ?').all(key, id);
  const pages = new Map();
  const addPage = (path, component, reason, kind, via) => {
    const p = pages.get(path) ?? {path, title: q('SELECT title FROM page_index WHERE path = ?').get(path)?.title ?? path, uses: []};
    p.uses.push({component, reason, kind, via});
    pages.set(path, p);
  };
  for (const d of deps.filter(d => d.kind !== 'pending')) {
    if (d.path.startsWith('#layout:')) {
      const name = d.path.slice(8);
      for (const r of q(`SELECT DISTINCT path FROM page_deps WHERE kind = 'layout' AND component = ?`).all(name)) addPage(r.path, name, d.reason, d.kind, 'componentă comună');
    } else addPage(d.path, d.component, d.reason, d.kind);
  }
  const pending = deps.filter(d => d.kind === 'pending').map(d => ({path: d.path, reason: d.reason, component: d.component}));

  // 3. dependențe indirecte: listele în care intră sau din care ar ieși
  const snap = store.snap(e, rec);
  const lists = q(`SELECT DISTINCT path, component, scope, fields, reason FROM page_deps WHERE entity = ? AND kind = 'query'`).all(key)
    .filter(d => !d.scope || snap.scopes.includes(d.scope))
    .map(d => ({path: d.path, component: d.component, reason: d.reason, scope: d.scope || null, fields: d.fields ? JSON.parse(d.fields) : null}));

  // 4. detectate, neverificate
  const detected = direct.filter(d => d.status !== 'confirmed').map(d => ({...d, why: 'legătură nesigură'}));
  for (const p of store.provenance(key, id).filter(p => p.certainty !== 'confirmed'))
    detected.push({why: `sursă ${p.certainty === 'inferred' ? 'dedusă' : p.certainty === 'unverified' ? 'neverificată' : 'nerecuperabilă'}`, field: p.field, source: p.url, method: p.method, provenance_id: p.id});
  if (e.mentions) {
    const names = [titleOf(e, rec), ...(Array.isArray(rec.aliases) ? rec.aliases : [])].filter(mentionable);
    const linked = new Set(direct.map(d => `${d.key}:${d.id}`));
    for (const s of Object.values(BY_KEY)) {
      if (!s.fields.some(f => f.type === 'richtext')) continue;
      for (const n of names) {
        const rows = q(`SELECT id FROM ${s.table} WHERE search LIKE ?`).all(`%${norm(n)}%`);
        for (const r of rows) {
          if (s.key === key && r.id === id || linked.has(`${s.key}:${r.id}`)) continue;
          const other = store.read(s.key, r.id);
          const text = s.fields.filter(f => f.type === 'richtext').map(f => stripTags(other[f.key] ?? '')).join(' ');
          const m = new RegExp(`(?<![a-z0-9])${norm(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`).exec(norm(text));
          if (!m) continue;
          linked.add(`${s.key}:${r.id}`);
          detected.push({why: 'numele apare în text, fără legătură salvată', key: s.key, id: r.id, title: titleOf(s, other),
            excerpt: text.slice(Math.max(0, m.index - 60), m.index + n.length + 60)});
        }
      }
    }
  }

  // „Se completează automat în”: unde apar jetoanele care citesc câmpurile acestei înregistrări
  const autofill = [];
  for (const [name, t] of Object.entries(TOKENS)) {
    if (t.entity !== key) continue;
    for (const s of Object.values(BY_KEY)) {
      const cols = s.fields.filter(f => ['richtext', 'textarea'].includes(f.type)).map(f => f.key);
      if (!cols.length) continue;
      const rows = q(`SELECT id FROM ${s.table} WHERE ${cols.map(c => `instr(COALESCE("${c}",''), ?)`).join(' OR ')}`).all(...cols.map(() => `{${name}}`));
      for (const r of rows) autofill.push({token: `{${name}}`, field: t.field, key: s.key, id: r.id, title: titleOf(s, store.read(s.key, r.id))});
    }
  }

  return {direct, pages: [...pages.values()].sort((a, b) => a.path.localeCompare(b.path)), pending, lists, detected, autofill, count: pages.size};
}
