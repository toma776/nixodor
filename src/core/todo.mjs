// „De făcut” (§1.8): observații calculate, cu impact și link direct la câmp.
import {ENTITIES, BY_KEY, titleOf, relFields, relTable} from '../registry/entities.mjs';
import {contradictions, stripTags, norm} from './content.mjs';
import {createContext} from '../site/context.mjs';

export function todo(store) {
  const q = sql => store.db.prepare(sql), out = [];
  const add = (impact, kind, key, id, field, text) => out.push({impact, kind, key, id, field, text, title: key && id ? titleOf(BY_KEY[key], store.read(key, id)) : null});
  const firma = store.singleton('firma');
  const ctx = createContext(store, {path: '#todo', preview: true});
  const live = (e, r) => e.noStatus || r.status === 'published';

  for (const e of ENTITIES) {
    for (const r of store.list(e.key)) {
      const visible = live(e, r);
      // câmpuri obligatorii goale (pe înregistrările publicate)
      if (visible) for (const f of e.fields.filter(f => f.required && f.type !== 'refs')) if (r[f.key] == null || r[f.key] === '')
        add('mare', 'obligatoriu', e.key, r.id, f.key, `Câmpul „${f.label}” e gol.`);
      // ciorne care așteaptă publicare sau aprobare
      if (!e.noStatus && r.draft) add(e.approval ? 'mare' : 'mediu', 'aprobare', e.key, r.id, null,
        e.approval ? 'Modificări în ciornă care așteaptă aprobarea unui administrator.' : 'Modificări în ciornă, nepublicate.');
      for (const f of e.fields.filter(f => ['richtext', 'textarea', 'links'].includes(f.type))) {
        const v = typeof r[f.key] === 'string' ? r[f.key] : r[f.key] ? JSON.stringify(r[f.key]) : '';
        if (!v) continue;
        // texte propuse, marcate [[de-validat:notă]]
        for (const [, note] of v.matchAll(/\[\[de-validat(?::([^\]]*))?\]\]/g)) add('mare', 'de-validat', e.key, r.id, f.key, `De validat: ${note ?? 'text propus'}.`);
        // valori scrise de mână care contrazic Date firmă
        if (!e.noTokens && e.key !== 'firma') for (const c of contradictions(v, firma))
          add('mare', 'contradicție', e.key, r.id, f.key, `${c.kind === 'telefon' ? 'Telefon' : 'Email'} diferit de Date firmă: ${c.value}`);
        // linkuri interne rupte (în texte și meniuri)
        if (!visible) continue;
        for (const [, href] of v.matchAll(/href="(\/[^"]*|https?:\/\/(?:www\.)?nixodor\.ro[^"]*)"/g))
          if (!href.includes('/blog/wp-content/') && ctx.internal(href) == null) add('mare', 'link-rupt', e.key, r.id, f.key, `Link intern fără destinație: ${href}`);
        for (const [, k, id] of v.matchAll(/(?:data-ref="|ref:)([a-z-]+):(\d+)/g)) {
          const t = BY_KEY[k], target = t && store.read(k, +id);
          if (!target) add('mare', 'link-rupt', e.key, r.id, f.key, `Trimitere spre ${k}:${id}, care nu mai există.`);
          else if (!t.noStatus && target.status !== 'published') add('mic', 'nepublicat', e.key, r.id, f.key, `Link spre „${titleOf(t, target)}”, nepublicat: apare ca text până la publicare.`);
        }
      }
      // legături spre înregistrări arhivate
      if (visible) for (const f of relFields(e)) {
        const t = BY_KEY[f.target];
        if (t.noStatus) continue;
        for (const l of q(`SELECT x.dst_id FROM ${relTable(e, f)} x JOIN ${t.table} d ON d.id = x.dst_id WHERE x.src_id = ? AND d.status = 'archived'`).all(r.id))
          add('mediu', 'arhivat', e.key, r.id, f.key, `Legat de ${t.one.toLowerCase()} ${l.dst_id}, arhivat.`);
      }
    }
  }

  // imagini folosite pe site fără text alternativ
  for (const m of q(`SELECT m.id FROM media m WHERE (m.alt IS NULL OR m.alt = '') AND m.mime LIKE 'image/%' AND EXISTS (SELECT 1 FROM page_deps d WHERE d.entity = 'media' AND d.entity_id = m.id)`).all())
    add('mediu', 'alt', 'media', m.id, 'alt', 'Imagine afișată pe site, fără text alternativ.');

  // posibile dubluri, după regula declarată în registru (§1.7)
  for (const e of ENTITIES.filter(e => e.duplicates)) {
    const groups = new Map();
    for (const r of store.list(e.key)) {
      const k = e.duplicates.by.map(f => e.duplicates.exact ? String(r[f] ?? '') : norm(stripTags(String(r[f] ?? ''))).replace(/[^a-z0-9]+/g, ' ').trim()).join('|');
      if (k.replace(/\|/g, '')) groups.set(k, [...(groups.get(k) ?? []), r.id]);
    }
    for (const ids of groups.values()) if (ids.length > 1) add('mediu', 'dublură', e.key, ids[0], null, `Posibile dubluri: ${ids.map(i => `${e.key}:${i}`).join(', ')}.`);
  }

  // legături de verificat, propagări eșuate
  let inferred = 0;
  for (const e of ENTITIES) for (const f of relFields(e)) inferred += q(`SELECT COUNT(*) n FROM ${relTable(e, f)} WHERE status != 'confirmed'`).get().n;
  if (inferred) add('mediu', 'legături', null, null, null, `${inferred} legături deduse sau neverificate așteaptă o decizie.`);
  const failed = q(`SELECT COUNT(*) n FROM change_events WHERE status = 'failed'`).get().n;
  if (failed) add('mare', 'propagare', null, null, null, `${failed} propagări eșuate.`);

  // aceeași observație, găsită de două ori în același câmp (ex. emailul scris de două ori în text), apare o singură dată
  const seen = new Set(), unique = out.filter(t => { const k = `${t.key}:${t.id}:${t.field}:${t.text}`; return !seen.has(k) && seen.add(k); });
  const order = {mare: 0, mediu: 1, mic: 2};
  return unique.sort((a, b) => order[a.impact] - order[b.impact]);
}
