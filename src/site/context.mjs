// Contextul urmărit (§3.1): pagina publică nu citește baza direct. Fiecare citire trece pe aici
// și devine o dependență, cu componenta și motivul ei. Tot aici stau regulile de publicare:
// doar ce e publicat, doar legăturile confirmate, linkurile spre ceva nepublicat devin text.
import {BY_KEY, entity, titleOf, pathOf, LINK_REF, targetOf} from '../registry/entities.mjs';
import {TOKENS, esc} from '../core/content.mjs';

export function createContext(store, {path, preview = false} = {}) {
  const deps = [], layoutDeps = new Map();
  const stack = [{component: '', reason: ''}];
  let sink = deps;
  const where = () => stack[stack.length - 1];
  const dep = (kind, ent, id, extra = {}) => {
    if (preview) return;
    sink.push({kind, entity: ent, entity_id: id ?? null, component: extra.component ?? where().component, scope: extra.scope ?? '',
      fields: extra.fields ? JSON.stringify(extra.fields) : null, reason: extra.reason ?? where().reason});
  };
  const live = (e, r) => !!r && (e.noStatus || r.status === 'published' || preview && r.status !== 'archived');
  const load = (key, id) => store.read(key, id, {draft: preview});

  const ctx = {
    path, preview, deps, layoutDeps,

    within(component, reason, fn) {
      stack.push({component, reason});
      try { return fn(); } finally { stack.pop(); }
    },

    // Componentele comune își scriu dependențele o singură dată, sub #layout:<nume> (§3.2).
    layout(name, fn) {
      dep('layout', '#layout', null, {component: name, reason: `folosește ${name}`});
      if (preview) return fn();
      const prev = sink;
      sink = [];
      stack.push({component: name, reason: name});
      try { return fn(); } finally { layoutDeps.set(name, [...(layoutDeps.get(name) ?? []), ...sink]); sink = prev; stack.pop(); }
    },

    page(key, id) {
      const e = entity(key), r = load(key, id);
      dep('page', key, id, {reason: 'pagina proprie'});
      return live(e, r) ? r : null;
    },

    get(key, id, reason) {
      if (id == null) return null;
      const e = entity(key), r = load(key, id);
      if (!live(e, r)) { dep('pending', key, id, {reason: reason ?? 'așteaptă publicarea'}); return null; }
      dep('direct', key, id, {reason});
      return r;
    },

    one(key, reason) {
      const r = store.singleton(key);
      if (r) dep('direct', key, r.id, {reason});
      return r;
    },

    // O listă își declară scope-ul sau câmpurile după care filtrează/ordonează (§3.2, NOU).
    query(key, {where: w = {}, order, limit, scope, fields, reason} = {}) {
      const e = entity(key);
      if (!scope && !fields) throw new Error(`ctx.query('${key}') fără scope și fără câmpuri declarate`);
      dep('query', key, null, {scope: scope ?? '', fields: scope ? null : fields, reason});
      const rows = store.list(key, {where: w, order}).map(r => preview ? store.read(key, r.id, {draft: true}) : r).filter(r => live(e, r));
      const out = limit ? rows.slice(0, limit) : rows;
      // un element dintr-o listă cu câmpuri declarate reface pagina doar când se schimbă acele câmpuri
      for (const r of out) dep('list', key, r.id, {reason, fields: scope ? null : fields});
      return out;
    },

    // Legăturile multiple ale unei înregistrări: doar cele confirmate, doar spre ținte publicate.
    links(key, id, field, reason) {
      const e = entity(key), f = e.fields.find(x => x.key === field);
      const t = BY_KEY[f.target];
      const draftLinks = preview ? load(key, id)?._links?.[field] : null;
      const rows = draftLinks
        ? draftLinks.map(x => ({dst_id: typeof x === 'object' ? x.id : +x, status: 'confirmed', attrs: x.attrs ?? null}))
        : store.links(key, id, field).filter(l => l.status === 'confirmed' || preview);
      const out = [];
      for (const l of rows) {
        const r = load(f.target, l.dst_id);
        if (!live(t, r)) { dep('pending', f.target, l.dst_id, {reason: reason ?? 'legat, așteaptă publicarea'}); continue; }
        dep('list', f.target, l.dst_id, {reason});
        out.push({...r, _attrs: l.attrs});
      }
      return out;
    },

    // Sursele care trimit spre o țintă (de exemplu articolele care recomandă o gamă).
    inverse(srcKey, field, targetKey, targetId, reason) {
      const s = entity(srcKey), f = s.fields.find(x => x.key === field);
      dep('query', srcKey, null, {scope: `${targetKey}:${targetId}`, reason});
      let ids;
      if (f.type === 'refs') ids = store.db.prepare(`SELECT src_id id FROM rel_${s.table}_${field} WHERE dst_id = ? ${preview ? '' : `AND status = 'confirmed'`} ORDER BY src_id DESC`).all(targetId).map(r => r.id);
      else ids = store.db.prepare(`SELECT id FROM ${s.table} WHERE "${field}" = ? ORDER BY id DESC`).all(targetId).map(r => r.id);
      const out = [];
      for (const id of ids) { const r = load(srcKey, id); if (live(s, r)) { dep('list', srcKey, id, {reason}); out.push(r); } }
      return out;
    },

    // Un link spre o entitate: se reface doar dacă se schimbă ce contează pentru link (linkFields, stare, adresă).
    link(key, id, reason) {
      const e = BY_KEY[key];
      if (!e || id == null) return null;
      const r = load(key, id);
      if (!live(e, r)) { dep('pending', key, id, {reason: reason ?? 'link spre ceva nepublicat'}); return null; }
      dep('link', key, id, {reason});
      const href = pathOf(e, r);
      return href ? {href, label: titleOf(e, r), rec: r} : null;
    },

    // ref:<tip>:<id>[?parametri][#ancoră] → adresa curentă; parametrii și ancora se păstrează.
    href(to, reason) {
      if (!to) return null;
      const m = LINK_REF.exec(to);
      if (!m) return /^(https?:|mailto:|tel:)/.test(to) ? ctx.tokens(to) : ctx.internal(to, reason);
      if (m[1] === 'magazine') { const r = ctx.get('magazine', +m[2], reason); return r?.url ?? null; }
      if (m[1] === 'media') return ctx.media(+m[2])?.url ?? null;
      const l = ctx.link(m[1], +m[2], reason);
      return l ? l.href + (m[3] ?? '') : null;
    },

    // O adresă internă scrisă de mână: trece prin redirecționări; fără destinație → null (devine text).
    internal(href, reason) {
      const u = href.replace(/^https?:\/\/(www\.)?nixodor\.ro/, '') || '/';
      const [p, rest = ''] = u.split(/(?=[?#])/);
      const R = BY_KEY.redirecturi;
      const red = store.db.prepare(`SELECT * FROM ${R.table} WHERE from_path = ?`).get(p);
      if (red) {
        dep('link', 'redirecturi', red.id, {reason: reason ?? `link prin redirecționarea ${p}`});
        return red.to_ref ? ctx.href(red.to_ref + rest, reason) : red.to_path ? red.to_path + rest : null;
      }
      for (const key of Object.keys(BY_KEY)) {
        const m = BY_KEY[key].public?.match(p);
        if (!m) continue;
        const row = store.db.prepare(`SELECT id FROM ${BY_KEY[key].table} WHERE "${m.field}" = ?`).get(m.value);
        if (row) { const l = ctx.link(key, row.id, reason); return l ? l.href + rest : null; }
      }
      if (['/blog/', '/'].includes(p)) return p + rest;
      // fără destinație azi: pagina se reface dacă apare o redirecționare pentru această adresă
      dep('query', 'redirecturi', null, {fields: ['from_path'], reason: reason ?? `link intern fără destinație: ${p}`});
      return null;
    },

    media(id, variant) {
      if (id == null) return null;
      const r = store.read('media', id);
      dep('media', 'media', id);
      if (!r) return null;
      const v = (r.updated_at ?? '').replace(/\D/g, '').slice(0, 17);
      // în Supabase Storage fișierul se servește direct de CDN-ul lor; local, prin /media/<id>/
      const url = store.mediaBase ? `${store.mediaBase}/${r.file}?v=${v}` : `/media/${r.id}/${encodeURIComponent(r.name)}?v=${v}`;
      return {url, alt: r.alt ?? '', width: r.width, height: r.height, mime: r.mime, rec: r};
    },

    tokens(text) {
      return String(text ?? '').replace(/\{(\w+)\}/g, (m, name) => {
        const t = TOKENS[name];
        if (!t) return m;
        if (!t.entity) return t.format();
        const firma = ctx.one(t.entity, `valoarea {${name}}`);
        const v = firma?.[t.field];
        return v == null ? '' : t.format(v);
      });
    },

    // Textul bogat: linkuri interne, fișiere și jetoane devin dependențe (rich() din oxxygene).
    rich(html) {
      if (!html) return '';
      let s = String(html);
      s = s.replace(/href="tel:\{telefon\}"/g, () => `href="tel:${(ctx.one('firma', 'valoarea {telefon}')?.phone ?? '').replace(/\s/g, '')}"`);
      s = ctx.tokens(s);
      s = s.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/g, (m, attrs, inner) => {
        const ref = attrs.match(/data-ref="([a-z-]+):(\d+)([^"]*)"/);
        const med = attrs.match(/data-media="(\d+)"/);
        const raw = attrs.match(/href="([^"]*)"/)?.[1];
        let href;
        if (ref) href = ctx.href(`ref:${ref[1]}:${ref[2]}${ref[3] ?? ''}`);
        else if (med) href = ctx.media(+med[1])?.url ?? null;
        else if (raw && (raw.startsWith('/') || /^https?:\/\/(www\.)?nixodor\.ro(\/|$)/.test(raw))) href = ctx.internal(raw);
        else href = raw ?? null;
        if (!href) return inner;
        const ext = /^https?:/.test(href) && !/^https?:\/\/(www\.)?nixodor\.ro/.test(href);
        return `<a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${inner}</a>`;
      });
      s = s.replace(/<img\b([^>]*?)data-media="(\d+)"([^>]*)>/g, (m, a, id) => {
        const md = ctx.media(+id);
        if (!md) return '';
        const alt = (a + m).match(/alt="([^"]*)"/)?.[1] || md.alt;
        return `<img src="${esc(md.url)}" alt="${esc(alt)}" loading="lazy"${md.width ? ` width="${md.width}" height="${md.height}"` : ''}>`;
      });
      s = s.replace(/\[\[de-validat(?::([^\]]*))?\]\]/g, (m, note) => preview ? `<mark class="de-validat" title="${esc(note ?? '')}">De validat</mark>` : '');
      return s;
    }
  };
  return ctx;
}
