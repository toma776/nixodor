// Panourile /manage: randate la fiecare cerere, fără cache (§3.1), deci arată starea curentă.
import {ENTITIES, BY_KEY, entity, titleOf, pathOf, relFields, RELATION_TYPES, targetOf} from '../registry/entities.mjs';
import {esc} from '../core/content.mjs';
import {whereUsed} from '../core/whereused.mjs';
import {todo} from '../core/todo.mjs';
import {createGraph} from '../core/graph.mjs';
import {inferredGroups} from './api.mjs';

const CATEGORIES = {produse: 'Produse', vanzare: 'Vânzare', continut: 'Conținut', firma: 'Firma', sistem: 'Sistem'};
const STATUS = {draft: 'Ciornă', published: 'Publicat', archived: 'Arhivat'};
const LINK_STATUS = {confirmed: 'confirmată', inferred: 'dedusă', unverified: 'neverificată'};
const CERTAINTY = {confirmed: 'confirmată', inferred: 'dedusă', unverified: 'neverificată', unrecoverable: 'nerecuperabilă'};
const fmt = iso => iso ? new Date(iso).toLocaleString('ro-RO', {dateStyle: 'medium', timeStyle: 'short'}) : '—';
const badge = (s, map = STATUS) => s ? `<span class="badge s-${esc(s)}">${esc(map[s] ?? s)}</span>` : '';
const eurl = (key, id, tab = '') => `/manage/entitati/${key}/${id}/${tab ? tab + '/' : ''}`;

export function createViews(app) {
  const {store, sync} = app;
  const graph = createGraph(store);
  const q = sql => store.db.prepare(sql);

  function layout(user, {title, active = ''}, body) {
    const st = sync.status();
    const nav = [['/manage/', 'Panou', 'panou'], ['/manage/entitati/', 'Entități', 'entitati'], ['/manage/harta/', 'Harta', 'harta'],
      ['/manage/surse/', 'Surse', 'surse'], ['/manage/surse/legaturi/', 'Legături de verificat', 'legaturi'], ['/manage/propagare/', `Propagare${st.failed ? ` <b class="err">${st.failed}</b>` : ''}`, 'propagare'],
      ['/manage/istoric/', 'Istoric', 'istoric']];
    return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Brain NIXODOR</title><link rel="stylesheet" href="/manage/assets/manage.css"><link rel="icon" href="/assets/favicon.png"></head>
<body data-user="${esc(user.name)}"><header class="top"><a class="brand" href="/manage/">Brain <b>NIXODOR</b></a>
<form class="search" action="/manage/cautare/"><input name="q" placeholder="Caută în Brain…" aria-label="Caută"></form>
<span class="who">${esc(user.name)} · ${esc(user.role)}${user.local ? '' : ' · <a href="/manage/logout/">Ieșire</a>'}</span><a class="site" href="/" target="_blank">Site ↗</a></header>
<div class="shell"><nav class="side">${nav.map(([h, l, k]) => `<a href="${h}"${k === active ? ' class="on"' : ''}>${l}</a>`).join('')}
<div class="side-cats">${Object.entries(CATEGORIES).map(([c, l]) => `<p>${l}</p>${ENTITIES.filter(e => e.category === c && e.hub !== false).map(e => `<a href="/manage/entitati/${e.key}/"${active === e.key ? ' class="on"' : ''}><i style="background:${e.color}"></i>${esc(e.label)}</a>`).join('')}`).join('')}</div></nav>
<main class="main"><div id="live-banner" hidden></div>${body}</main></div>
<script src="/manage/assets/manage.js" defer></script></body></html>`;
  }

  // --- Panou ----------------------------------------------------------------------------
  function dashboard(user) {
    const st = sync.status(), items = todo(store);
    const failed = q(`SELECT * FROM change_events WHERE status = 'failed' ORDER BY id DESC LIMIT 20`).all();
    const recent = q(`SELECT * FROM change_events ORDER BY id DESC LIMIT 12`).all();
    const approvals = items.filter(t => t.kind === 'aprobare');
    const counts = ['game', 'produse', 'articole', 'recenzii', 'pagini', 'media'].map(k => `<a class="stat" href="/manage/entitati/${k}/"><b>${store.count(k)}</b><span>${esc(BY_KEY[k].label)}</span></a>`).join('');
    const todoHtml = items.length ? `<ul class="todo">${items.map(t => `<li class="i-${t.impact}"><span class="impact">${t.impact}</span>
      ${t.key && t.id ? `<a href="${eurl(t.key, t.id)}${t.field ? `?camp=${t.field}` : ''}">${esc(t.title ?? `${t.key}:${t.id}`)}</a> — ` : t.kind === 'legături' ? '<a href="/manage/surse/legaturi/">Legături de verificat</a> — ' : t.kind === 'propagare' ? '<a href="/manage/propagare/">Propagare</a> — ' : ''}${esc(t.text)}</li>`).join('')}</ul>` : '<p class="ok">Nimic de făcut.</p>';
    return layout(user, {title: 'Panou', active: 'panou'}, `<h1>Panou</h1><div class="stats">${counts}</div>
      <div class="cols"><section class="box"><h2>De făcut <small>${items.length}</small></h2>${todoHtml}</section>
      <div><section class="box"><h2>Propagare</h2><dl class="kv"><dt>În așteptare</dt><dd>${st.pending}</dd><dt>Eșuate</dt><dd>${st.failed}</dd>
        <dt>Pagini în index</dt><dd>${st.pages}</dd><dt>Pagini de refăcut</dt><dd>${st.stale}</dd><dt>Dependențe</dt><dd>${st.deps}</dd>
        <dt>Ultima propagare</dt><dd>${st.last ? `${fmt(st.last.processed_at)} · ${st.last.affected ?? 0} pagini` : '—'}</dd><dt>Ultima scanare</dt><dd>${fmt(st.lastScan)}</dd></dl>
        ${failed.map(f => `<p class="err-row">Eveniment ${f.id} (${esc(f.action)} ${esc(f.label ?? '')}): ${esc(f.last_error)} <button data-post="/api/manage/sync/retry/${f.id}">Reia</button></p>`).join('')}</section>
      <section class="box"><h2>Aprobări <small>${approvals.length}</small></h2>${approvals.length ? `<ul>${approvals.map(t => `<li><a href="${eurl(t.key, t.id)}">${esc(t.title)}</a> <span class="muted">${esc(BY_KEY[t.key].one)}</span></li>`).join('')}</ul>` : '<p class="muted">Nicio ciornă nu așteaptă.</p>'}</section>
      <section class="box"><h2>Ultimele modificări</h2><table class="t"><tbody>${recent.map(ev => `<tr><td>${fmt(ev.at)}</td><td>${esc(ev.user_name)}</td><td>${esc(ev.action)}</td>
        <td>${ev.entity && ev.entity_id ? `<a href="${eurl(ev.entity, ev.entity_id)}">${esc(ev.label ?? '')}</a>` : esc(ev.label ?? ev.entity ?? '')}</td>
        <td><a href="/manage/propagare/${ev.id}/">${ev.affected ?? '…'} pagini</a></td></tr>`).join('')}</tbody></table></section></div></div>`);
  }

  // --- Entități ---------------------------------------------------------------------------
  function entitiesHome(user) {
    return layout(user, {title: 'Entități', active: 'entitati'}, `<h1>Entități</h1>${Object.entries(CATEGORIES).map(([c, l]) => `<h2>${l}</h2><div class="stats">${
      ENTITIES.filter(e => e.category === c && e.hub !== false).map(e => `<a class="stat" href="/manage/entitati/${e.key}/" style="border-color:${e.color}"><b>${store.count(e.key)}</b><span>${esc(e.label)}</span></a>`).join('')}</div>`).join('')}`);
  }

  const appearsIn = (key, id) => q(`SELECT COUNT(DISTINCT path) n FROM page_deps WHERE entity = ? AND entity_id = ? AND kind != 'pending' AND path NOT LIKE '#%'`).get(key, id).n
    + q(`SELECT COUNT(DISTINCT d2.path) n FROM page_deps d JOIN page_deps d2 ON d2.kind = 'layout' AND '#layout:' || d2.component = d.path WHERE d.entity = ? AND d.entity_id = ? AND d.path LIKE '#layout:%'`).get(key, id).n;

  function entityList(user, key, url) {
    const e = entity(key), search = url.searchParams.get('q') ?? '', status = url.searchParams.get('status') ?? '';
    const rows = store.list(key, {search: search || undefined, status: status || undefined, order: e.fields.some(f => f.key === 'position') ? 'position, id' : 'id DESC'});
    const cols = e.fields.filter(f => f.list).slice(0, 4);
    const cell = (f, r) => {
      const v = r[f.key];
      if (v == null || v === '') return '<span class="muted">—</span>';
      if (f.type === 'ref' || f.type === 'image') { const t = BY_KEY[targetOf(f)]; return `<a href="${eurl(t.key, v)}">${esc(titleOf(t, store.read(t.key, v)))}</a>`; }
      return esc(String(v).slice(0, 80));
    };
    return layout(user, {title: e.label, active: key}, `<div class="head"><h1>${esc(e.label)} <small>${rows.length}</small></h1>
      ${e.singleton && rows.length ? '' : `<a class="btn" href="/manage/entitati/${key}/nou/">${e.one} nou${e.one.endsWith('ă') ? 'ă' : ''}</a>`}</div>
      <form class="filters"><input name="q" value="${esc(search)}" placeholder="Caută">${e.noStatus ? '' : `<select name="status"><option value="">Toate stările</option>${Object.entries(STATUS).map(([k, l]) => `<option value="${k}"${status === k ? ' selected' : ''}>${l}</option>`).join('')}</select>`}<button>Filtrează</button></form>
      <table class="t list"><thead><tr><th>${e.thumb ? '' : '#'}</th><th>Nume</th>${cols.filter(f => f.key !== e.title).map(f => `<th>${esc(f.label)}</th>`).join('')}${e.noStatus ? '' : '<th>Stare</th>'}<th>Apare în</th></tr></thead><tbody>
      ${rows.map(r => {
        const thumbId = e.thumb === 'id' ? r.id : e.thumb ? r[e.thumb] : null, m = thumbId && store.read('media', thumbId);
        return `<tr><td>${m && /^image/.test(m.mime) ? `<img class="thumb" src="/media/${m.id}/${encodeURIComponent(m.name)}" alt="">` : r.id}</td><td><a href="${eurl(key, r.id)}">${esc(titleOf(e, r))}</a>${r.draft ? ' <span class="badge s-draft">modificări în ciornă</span>' : ''}</td>
        ${cols.filter(f => f.key !== e.title).map(f => `<td>${cell(f, r)}</td>`).join('')}${e.noStatus ? '' : `<td>${badge(r.status)}</td>`}<td>${appearsIn(key, r.id) || '<span class="muted">0</span>'}</td></tr>`;
      }).join('')}</tbody></table>`);
  }

  // --- formularul ------------------------------------------------------------------------
  const linksToText = (items, depth = 0) => (items ?? []).map(it => `${'- '.repeat(depth)}${it.label ?? ''} | ${it.to ?? ''}${it.button ? ' | buton' : ''}\n${linksToText(it.children, depth + 1)}`).join('');

  function field(f, value, rec) {
    const id = `f_${f.key}`, ro = f.readonly ? ' readonly' : '';
    const label = `<label for="${id}">${esc(f.label)}${f.required ? ' <b class="req">*</b>' : ''}</label>`;
    let input;
    switch (f.type) {
      case 'textarea': input = `<textarea id="${id}" name="${f.key}" rows="4"${ro}>${esc(value ?? '')}</textarea>`; break;
      case 'richtext': input = `<textarea id="${id}" name="${f.key}" rows="10" class="rich"${ro}>${esc(value ?? '')}</textarea><small class="hint">HTML curățat la salvare: titluri, paragrafe, liste, citate, tabele, linkuri (<code>data-ref="tip:id"</code>), imagini (<code>data-media="id"</code>). Jetoane: <code>{telefon}</code> <code>{email}</code> <code>{firma}</code> <code>{an}</code>.</small>`; break;
      case 'boolean': input = `<input type="checkbox" id="${id}" name="${f.key}" data-type="boolean"${value ? ' checked' : ''}${f.readonly ? ' disabled' : ''}>`; break;
      case 'select': input = `<select id="${id}" name="${f.key}"${ro}><option value="">—</option>${f.options.map(o => `<option${o === value ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`; break;
      case 'ref': case 'image': {
        const t = BY_KEY[targetOf(f)];
        const opts = store.list(t.key).map(o => `<option value="${o.id}"${o.id === value ? ' selected' : ''}>${esc(titleOf(t, o))}${o.status && o.status !== 'published' ? ` (${STATUS[o.status]})` : ''}</option>`).join('');
        input = `<select id="${id}" name="${f.key}" data-type="int"${ro}><option value="">—</option>${opts}</select>${value ? ` <a href="${eurl(t.key, value)}">deschide</a>` : ''}`;
        if (f.type === 'image' && value) { const m = store.read('media', value); if (m && /^image/.test(m.mime)) input += `<img class="preview" src="/media/${m.id}/${encodeURIComponent(m.name)}" alt="">`; }
        break;
      }
      case 'list': input = `<textarea id="${id}" name="${f.key}" data-type="list" rows="3"${ro}>${esc((value ?? []).join('\n'))}</textarea><small class="hint">Câte unul pe rând.</small>`; break;
      case 'links': input = `<textarea id="${id}" name="${f.key}" data-type="links" rows="6" class="mono"${ro}>${esc(linksToText(value))}</textarea><small class="hint">Câte un rând: <code>Etichetă | destinație</code>; destinația poate fi <code>ref:pagini:3</code>, <code>/blog/</code> sau o adresă externă. Copiii încep cu <code>- </code>; butonul se marchează cu <code>| buton</code>.</small>`; break;
      case 'table': case 'texts': case 'multiselect': input = `<textarea id="${id}" name="${f.key}" data-type="json" rows="4" class="mono"${ro}>${esc(value ? JSON.stringify(value, null, 1) : '')}</textarea>`; break;
      case 'int': case 'number': case 'money': input = `<input id="${id}" name="${f.key}" type="number" step="${f.type === 'int' ? 1 : 'any'}" value="${esc(value ?? '')}" data-type="number"${ro}>`; break;
      case 'date': input = `<input id="${id}" name="${f.key}" type="date" value="${esc(value ?? '')}"${ro}>`; break;
      default: input = `<input id="${id}" name="${f.key}" type="${f.type === 'email' ? 'email' : f.type === 'url' ? 'text' : 'text'}" value="${esc(value ?? '')}"${f.max ? ` maxlength="${f.max}"` : ''}${ro}>`;
    }
    const kinds = f.kinds ? ` data-kinds="${f.kinds.join(' ')}"` : '';
    return `<div class="field" data-field="${f.key}"${kinds}>${label}${input}</div>`;
  }

  function form(e, rec, {draftView} = {}) {
    const vals = draftView ?? rec ?? {};
    return `<form id="entity-form" data-key="${e.key}" data-id="${rec?.id ?? ''}" data-version="${rec?.version ?? ''}">
      ${e.fields.filter(f => f.type !== 'refs' && !f.intern).map(f => field(f, vals[f.key], rec)).join('')}</form>`;
  }

  function newEntity(user, key) {
    const e = entity(key);
    return layout(user, {title: `${e.one} nou`, active: key}, `<h1>${esc(e.one)} — înregistrare nouă</h1><div class="box">${form(e, null)}
      <div class="actions"><button class="btn" data-action="create">Salvează ca ciornă</button>${e.noStatus ? '' : `<button class="btn ghost" data-action="create-publish">Salvează și publică</button>`}</div><div id="result"></div></div>`);
  }

  // --- pagina unei entități -------------------------------------------------------------------
  function entityPage(user, key, id, tab = 'detalii', url) {
    const e = entity(key), rec = store.read(key, id);
    if (!rec) return null;
    const draft = store.read(key, id, {draft: true});
    const path = pathOf(e, rec) ?? pathOf(e, draft);
    const n = appearsIn(key, id);
    const tabs = [['detalii', 'Detalii'], ['relatii', 'Relații'], ['unde-apare', `Unde apare <small>${n}</small>`], ['surse', 'Surse'], ['istoric', 'Istoric']];
    let body = '';
    if (tab === 'detalii') body = detalii(e, rec, draft);
    else if (tab === 'relatii') body = relatii(e, rec);
    else if (tab === 'unde-apare') body = undeApare(e, rec);
    else if (tab === 'surse') body = surse(e, rec);
    else if (tab === 'istoric') body = istoric(e, rec);
    const head = `<div class="head"><div><p class="crumbs"><a href="/manage/entitati/${key}/">${esc(e.label)}</a></p>
      <h1>${esc(titleOf(e, draft))} ${e.noStatus ? '' : badge(rec.status)}${rec.draft ? ' <span class="badge s-draft">modificări în ciornă</span>' : ''}</h1>
      <p class="muted">${path ? `<a href="${esc(path)}" target="_blank">${esc(path)}</a> · ` : ''}Apare în <b>${n}</b> pagini · actualizat ${fmt(rec.updated_at)} de ${esc(rec.updated_by ?? '—')}
      ${e.approval ? ' · <span class="badge s-approval">publicarea cere aprobare</span>' : ''}</p></div>
      <div class="actions">${path ? `<a class="btn ghost" href="/manage/previzualizare${esc(path)}" target="_blank">Previzualizează</a>` : ''}
      ${e.noStatus ? '' : rec.status !== 'published' || rec.draft ? `<button class="btn" data-action="publish">Publică</button>` : ''}
      ${!e.noStatus && rec.status === 'published' ? `<button class="btn ghost" data-action="status" data-status="draft">Retrage</button>` : ''}
      ${!e.noStatus && rec.status !== 'archived' ? `<button class="btn ghost" data-action="status" data-status="archived">Arhivează</button>` : ''}
      <button class="btn danger" data-action="delete">Șterge</button></div></div>
      <nav class="tabs">${tabs.map(([t, l]) => `<a href="${eurl(key, id, t === 'detalii' ? '' : t)}"${t === tab ? ' class="on"' : ''}>${l}</a>`).join('')}</nav>`;
    return layout(user, {title: titleOf(e, rec), active: key}, `<div data-entity="${key}:${id}">${head}${body}<div id="result"></div></div>`);
  }

  function detalii(e, rec, draft) {
    const obs = todo(store).filter(t => t.key === e.key && t.id === rec.id);
    const note = !e.noStatus && rec.status === 'published' ? `<p class="note">Înregistrarea e publicată: „Salvează” scrie o ciornă, iar site-ul rămâne neschimbat până la „Publică”.${e.approval ? ' Publicarea cere dreptul de aprobare.' : ''}</p>` : '';
    return `${obs.length ? `<ul class="todo">${obs.map(t => `<li class="i-${t.impact}"><span class="impact">${t.impact}</span>${esc(t.text)}</li>`).join('')}</ul>` : ''}${note}
      <div class="box">${form(e, rec, {draftView: draft})}<div class="actions"><button class="btn" data-action="save">Salvează</button>
      ${!e.noStatus && rec.status === 'published' ? '<button class="btn ghost" data-action="save-publish">Salvează și publică</button>' : ''}</div></div>`;
  }

  function relatii(e, rec) {
    const own = relFields(e).map(f => {
      const t = BY_KEY[f.target], links = store.links(e.key, rec.id, f.key);
      const options = store.list(t.key).filter(o => !links.some(l => l.dst_id === o.id)).map(o => `<option value="${o.id}">${esc(titleOf(t, o))}</option>`).join('');
      return `<section class="box rel" data-field="${f.key}" data-ordered="${f.ordered ? 1 : 0}"><h3>${esc(f.label)} <small>${esc(f.rel ?? '')} → ${esc(t.label)}${f.sensitive ? ' · 🔒 sensibilă (cere aprobare)' : ''}</small></h3>
        <ol class="links">${links.map(l => `<li data-id="${l.dst_id}" data-status="${l.status}"${l.attrs ? ` data-attrs="${esc(JSON.stringify(l.attrs))}"` : ''}><a href="${eurl(t.key, l.dst_id)}">${esc(titleOf(t, l.target))}</a>
          ${badge(l.status, LINK_STATUS)}${l.target?.status && l.target.status !== 'published' && !t.noStatus ? ` ${badge(l.target.status)}` : ''}${l.attrs ? ` <code>${esc(Object.values(l.attrs).filter(Boolean).join(' · ').slice(0, 90))}</code>` : ''}
          ${l.note ? `<small class="muted">${esc(l.note)}</small>` : ''}
          <span class="ops">${l.status !== 'confirmed' ? `<button data-link-status="confirmed">Confirmă</button>` : ''}${f.ordered ? '<button data-move="-1">↑</button><button data-move="1">↓</button>' : ''}<button data-remove>Scoate</button></span></li>`).join('')}</ol>
        <div class="add"><select>${options}</select><button data-add>Adaugă</button></div></section>`;
    }).join('');
    const inv = store.inverse(e.key, rec.id).map(g => {
      const s = BY_KEY[g.relation.source];
      return `<section class="box"><h3>${esc(g.relation.inverseLabel)} <small>${esc(s.label)} care ${esc(g.relation.verb)} această înregistrare · stocat în <code>${esc(g.relation.storage)}</code></small></h3>
        <ul>${g.items.map(it => `<li><a href="${eurl(s.key, it.id)}">${esc(it.title)}</a> ${badge(it.link_status, LINK_STATUS)} ${it.status ? badge(it.status) : ''}</li>`).join('')}</ul>
        ${g.relation.cardinality === 'N:1' && !g.relation.required ? '<p class="muted">Adăugarea din acest capăt mută legătura de la ținta veche.</p>' : ''}</section>`;
    }).join('');
    const nb = graph.neighbors(e.key, rec.id);
    const mini = miniMap(nb);
    return `<div class="cols"><div>${own || '<p class="muted">Tipul nu are relații multiple proprii.</p>'}<h2>Văzute din celălalt capăt</h2>${inv || '<p class="muted">Nimic nu trimite spre această înregistrare.</p>'}</div>
      <div class="box"><h3>Mini-harta</h3>${mini}<p><a href="/manage/harta/?node=${e.key}:${rec.id}">Deschide pe hartă</a></p></div></div>`;
  }

  function miniMap(nb) {
    const items = [...nb.out.map(x => ({...x, dir: 'out'})), ...nb.in.map(x => ({...x, dir: 'in'}))].slice(0, 24);
    const W = 360, H = 360, cx = W / 2, cy = H / 2, R = 140;
    const nodes = items.map((x, i) => { const a = (i / Math.max(items.length, 1)) * 2 * Math.PI - Math.PI / 2; return {...x, x: cx + R * Math.cos(a), y: cy + R * Math.sin(a)}; });
    return `<svg viewBox="0 0 ${W} ${H}" class="mini" role="img" aria-label="Vecinii înregistrării">${nodes.map(n => `<line x1="${cx}" y1="${cy}" x2="${n.x}" y2="${n.y}" class="edge ${n.status}"/>`).join('')}
      <circle cx="${cx}" cy="${cy}" r="10" fill="${nb.node.color}"/><text x="${cx}" y="${cy - 16}" text-anchor="middle" class="lbl strong">${esc(nb.node.title.slice(0, 28))}</text>
      ${nodes.map(n => `<a href="${eurl(n.key, n.id)}"><circle cx="${n.x}" cy="${n.y}" r="7" fill="${BY_KEY[n.key].color}"/><text x="${n.x}" y="${n.y + (n.y > cy ? 18 : -10)}" text-anchor="middle" class="lbl">${esc(n.title.slice(0, 22))}</text></a>`).join('')}</svg>`;
  }

  function undeApare(e, rec) {
    const w = whereUsed(store, e.key, rec.id);
    const rel = w.direct.map(d => `<li>${d.dir === 'in' ? '←' : '→'} <b>${esc(d.label)}</b>: <a href="${eurl(d.key, d.id)}">${esc(d.title)}</a> ${badge(d.status, LINK_STATUS)}</li>`).join('');
    const pages = w.pages.map(p => `<li><a href="${esc(p.path)}" target="_blank">${esc(p.title)}</a> <code>${esc(p.path)}</code><ul>${p.uses.map(u => `<li>${esc(u.component || 'pagina')}${u.reason ? ` — ${esc(u.reason)}` : ''}${u.via ? ` <small class="muted">(${esc(u.via)})</small>` : ''}</li>`).join('')}</ul></li>`).join('');
    const lists = w.lists.map(l => `<li><code>${esc(l.path)}</code> — ${esc(l.component || '')} ${esc(l.reason ?? '')} ${l.scope ? `<small>scope ${esc(l.scope)}</small>` : `<small>filtrează după ${esc((l.fields ?? []).join(', '))}</small>`}</li>`).join('');
    const det = w.detected.map(d => `<li>${esc(d.why)}${d.key ? `: <a href="${eurl(d.key, d.id)}">${esc(d.title)}</a>` : d.field ? `: câmpul <code>${esc(d.field)}</code> (${esc(d.method ?? '')})` : ''}${d.excerpt ? `<br><small class="muted">„…${esc(d.excerpt)}…”</small>` : ''}</li>`).join('');
    return `<div class="levels">
      <section class="box"><h3>1. Relații directe <small>${w.direct.length}</small></h3>${rel ? `<ul>${rel}</ul>` : '<p class="muted">Niciuna.</p>'}</section>
      <section class="box"><h3>2. Utilizări efective în pagini <small>${w.pages.length}</small></h3><p class="muted">Din dependențele măsurate la randare: pagina, componenta și motivul.</p>${pages ? `<ul class="pages">${pages}</ul>` : '<p class="muted">Nu apare pe nicio pagină publică.</p>'}</section>
      ${w.pending.length ? `<section class="box"><h3>Legat deja: apare după publicare <small>${w.pending.length}</small></h3><ul>${w.pending.map(p => `<li><code>${esc(p.path)}</code> — ${esc(p.reason ?? '')}</li>`).join('')}</ul></section>` : ''}
      <section class="box"><h3>3. Dependențe indirecte <small>${w.lists.length}</small></h3><p class="muted">Listele în care intră sau din care ar ieși.</p>${lists ? `<ul>${lists}</ul>` : '<p class="muted">Niciuna.</p>'}</section>
      <section class="box"><h3>4. Detectate, neverificate <small>${w.detected.length}</small></h3>${det ? `<ul>${det}</ul>` : '<p class="muted">Nimic nesigur.</p>'}</section>
      ${w.autofill.length ? `<section class="box"><h3>Se completează automat în <small>${w.autofill.length}</small></h3><ul>${w.autofill.map(a => `<li><code>${esc(a.token)}</code> în <a href="${eurl(a.key, a.id)}">${esc(a.title)}</a></li>`).join('')}</ul></section>` : ''}</div>`;
  }

  function surse(e, rec) {
    const rows = store.provenance(e.key, rec.id);
    return `<section class="box"><h3>Surse <small>${rows.length}</small></h3><table class="t"><thead><tr><th>Câmp</th><th>Sursă</th><th>Metodă</th><th>Certitudine</th><th></th></tr></thead><tbody>
      ${rows.map(p => `<tr><td><code>${esc(p.field || '*')}</code></td><td>${/^https?:/.test(p.url) ? `<a href="${esc(p.url)}" target="_blank">${esc(p.source_title ?? p.url)}</a>` : esc(p.source_title ?? p.url)}${p.snapshot_file ? `<br><small class="muted">snapshot: ${esc(p.snapshot_file)}</small>` : ''}${p.excerpt ? `<br><small>„${esc(p.excerpt.slice(0, 160))}”</small>` : ''}</td>
      <td>${esc(p.method ?? '')}</td><td>${badge(p.certainty, CERTAINTY)}${p.verified_by ? `<br><small>${esc(p.verified_by)}, ${fmt(p.verified_at)}</small>` : ''}</td>
      <td>${p.certainty !== 'confirmed' ? `<button data-post="/api/manage/provenance/${p.id}/confirm">Confirmă</button>` : ''}</td></tr>`).join('')}</tbody></table></section>`;
  }

  function istoric(e, rec) {
    const rows = store.history(e.key, rec.id);
    return `<section class="box"><table class="t"><thead><tr><th>Când</th><th>Cine</th><th>Ce</th><th>Câmpuri</th><th></th></tr></thead><tbody>
      ${rows.map(a => { const ch = a.changes ? JSON.parse(a.changes) : {};
        return `<tr><td>${fmt(a.at)}</td><td>${esc(a.user_name)}</td><td>${esc(a.action)}${a.reverted_by ? ' <small>(readus)</small>' : ''}</td>
        <td>${Object.entries(ch).map(([k, [o, n]]) => `<details><summary><code>${esc(k)}</code></summary><div class="diff"><del>${esc(String(o ?? '').slice(0, 400))}</del><ins>${esc(String(n ?? '').slice(0, 400))}</ins></div>
        ${['update', 'publish', 'draft'].includes(a.action) && entity(e.key).fields.some(f => f.key === k) ? `<button data-post="/api/manage/history/${a.id}/revert" data-body='{"field":"${esc(k)}"}'>Readu acest câmp</button>` : ''}</details>`).join('')}</td>
        <td>${['update', 'publish'].includes(a.action) && Object.keys(ch).length ? `<button data-post="/api/manage/history/${a.id}/revert">Readu tot</button>` : ''}</td></tr>`; }).join('')}</tbody></table></section>`;
  }

  // --- Harta --------------------------------------------------------------------------------
  function map(user, url) {
    const node = url.searchParams.get('node');
    if (node) {
      const [k, i] = node.split(':'), nb = graph.neighbors(k, +i);
      if (!nb) return null;
      const col = (list, dir) => list.map(x => `<li><a href="?node=${x.key}:${x.id}"><i style="background:${BY_KEY[x.key].color}"></i>${esc(x.title)}</a> <small>${esc(x.verb)}</small> ${badge(x.status, LINK_STATUS)}${x.sensitive ? ' 🔒' : ''}</li>`).join('');
      const pagesBy = {};
      for (const p of nb.pages) (pagesBy[p.component || 'pagina proprie'] ??= new Set()).add(p.path);
      return layout(user, {title: 'Harta', active: 'harta'}, `<p class="crumbs"><a href="/manage/harta/">Harta</a> · <a href="/manage/harta/?type=${k}">${esc(BY_KEY[k].label)}</a></p>
        <h1>${esc(nb.node.title)}</h1><p><a href="${eurl(k, +i)}">Deschide în Entități</a> · <a href="${eurl(k, +i, 'unde-apare')}">Unde apare</a> · <a href="${eurl(k, +i, 'surse')}">Surse</a></p>
        <div class="map3"><section class="box"><h3>Intrări <small>${nb.in.length}</small></h3><ul class="nb">${col(nb.in)}</ul></section>
        <section class="box center"><div class="node" style="border-color:${nb.node.color}">${esc(nb.node.title)}</div>${miniMap(nb)}</section>
        <section class="box"><h3>Ieșiri <small>${nb.out.length}</small></h3><ul class="nb">${col(nb.out)}</ul></section></div>
        <section class="box"><h3>Paginile care o afișează</h3>${Object.entries(pagesBy).map(([c, ps]) => `<p><b>${esc(c)}</b>: ${[...ps].map(p => `<a href="${esc(p)}" target="_blank">${esc(p)}</a>`).join(', ')}</p>`).join('') || '<p class="muted">Niciuna.</p>'}</section>`);
    }
    const type = url.searchParams.get('type');
    if (type && BY_KEY[type]) {
      const e = BY_KEY[type], all = store.list(type).map(x => {
        const n = graph.neighbors(type, x.id);
        return {id: x.id, title: titleOf(e, x), deg: n.out.length + n.in.length};
      }).sort((a, b) => b.deg - a.deg);
      const page = +(url.searchParams.get('p') ?? 0);
      return layout(user, {title: e.label, active: 'harta'}, `<p class="crumbs"><a href="/manage/harta/">Harta</a></p><h1>${esc(e.label)} <small>${all.length}</small></h1>
        <p class="muted">Cei mai conectați primii, câte 40 pe pagină.</p><ul class="members">${all.slice(page * 40, page * 40 + 40).map(x => `<li><a href="?node=${type}:${x.id}">${esc(x.title)}</a> <small>${x.deg} legături</small></li>`).join('')}</ul>
        ${all.length > (page + 1) * 40 ? `<a href="?type=${type}&p=${page + 1}">Următoarele 40</a>` : ''}`);
    }
    const ov = graph.overview(), h = graph.health();
    const cats = Object.keys(CATEGORIES), colW = 200, rowH = 54;
    const pos = {};
    cats.forEach((c, ci) => ov.nodes.filter(n => n.category === c).forEach((n, ri) => { pos[n.key] = {x: 20 + ci * colW, y: 40 + ri * rowH, ...n}; }));
    const W = cats.length * colW + 20, H = 40 + Math.max(...cats.map(c => ov.nodes.filter(n => n.category === c).length)) * rowH + 20;
    const edges = ov.edges.filter(e => e.target !== 'media').map(ed => {
      const a = pos[ed.source], b = pos[ed.target];
      if (!a || !b) return '';
      const x1 = a.x + 160, y1 = a.y + 20, x2 = b.x, y2 = b.y + 20, mx = (x1 + x2) / 2;
      const d = a.key === b.key ? `M${x1} ${y1} C${x1 + 40} ${y1 - 40}, ${x1 + 40} ${y1 + 40}, ${x1} ${y1 + 5}` : `M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
      const cls = ed.n === 0 ? 'possible' : ed.inferred || ed.unverified ? 'inferred' : 'confirmed';
      return `<path d="${d}" class="edge ${cls}${ed.sensitive ? ' sensitive' : ''}" data-src="${ed.source}" data-dst="${ed.target}" style="stroke-width:${Math.max(1, Math.sqrt(ed.n))}"><title>${esc(BY_KEY[ed.source].label)} ${esc(ed.verb)} ${esc(BY_KEY[ed.target].label)}: ${ed.n} legături${ed.inferred ? `, ${ed.inferred} deduse` : ''}${ed.sensitive ? ' · sensibilă' : ''}</title></path>`;
    }).join('');
    const nodes = Object.values(pos).map(n => `<a href="?type=${n.key}"><g class="tnode" data-key="${n.key}"><rect x="${n.x}" y="${n.y}" width="160" height="40" rx="8" style="stroke:${n.color}"/><rect x="${n.x}" y="${n.y}" width="6" height="40" rx="3" fill="${n.color}"/>
      <text x="${n.x + 14}" y="${n.y + 25}">${esc(n.label)} <tspan class="n">${n.count}</tspan></text></g></a>`).join('');
    const healthRow = (label, list, fmtItem) => `<li>${esc(label)}: ${list.length ? `<b class="err">${list.length}</b><ul>${list.slice(0, 12).map(x => `<li>${fmtItem(x)}</li>`).join('')}</ul>` : '<b class="ok">0</b>'}</li>`;
    return layout(user, {title: 'Harta', active: 'harta'}, `<h1>Harta legăturilor</h1>
      <p class="muted">Tipurile pe coloane, după categorie. Grosimea liniei ∝ √(numărul de legături); linie plină = confirmate, întreruptă = are legături deduse, punctată = relație declarată dar nefolosită. Media e ascunsă.</p>
      <div class="box scroll"><svg viewBox="0 0 ${W} ${H}" class="overview" style="min-width:${W}px">${cats.map((c, i) => `<text x="${20 + i * colW}" y="24" class="cat">${CATEGORIES[c]}</text>`).join('')}${edges}${nodes}</svg></div>
      <div class="cols"><section class="box"><h2>Traseul dintre două entități</h2><form class="path-form"><input name="from" placeholder="recenzii:1" required> → <input name="to" placeholder="pagini:1" required><button>Caută</button></form><div id="path-result"></div></section>
      <section class="box"><h2>Sănătatea hărții</h2><ul class="health">
        ${healthRow('Tipuri izolate', h.isolated, k => esc(BY_KEY[k].label))}
        ${healthRow('Relații declarate, nefolosite', h.unused, id => `<code>${esc(id)}</code>`)}
        ${healthRow('Trimiteri spre înregistrări care nu mai există', h.broken, b => `<code>${esc(b.from)}</code> → <code>${esc(b.to)}</code>`)}
        ${healthRow('Relații obligatorii goale', h.emptyRequired, x => `<code>${esc(x.relation)}</code>: ${x.n}`)}
        ${healthRow('Înregistrări orfane', h.orphans, o => `<a href="${eurl(o.key, o.id)}">${esc(o.title)}</a> <small>${esc(BY_KEY[o.key].one)}</small>`)}</ul></section></div>
      <section class="box"><h2>Toate legăturile</h2><input class="filter-table" placeholder="Filtrează…"><table class="t" id="edges"><thead><tr><th>Relație</th><th>Stocare</th><th>Card.</th><th>Legături</th><th>Deduse</th><th>Surse → ținte</th><th>Exemple</th><th>La ștergere</th></tr></thead><tbody>
      ${RELATION_TYPES.map(r => { const d = graph.relation(r.id); return `<tr><td>${esc(BY_KEY[r.source].label)} <b>${esc(r.verb)}</b> ${esc(BY_KEY[r.target].label)}${r.sensitive ? ' 🔒' : ''}${r.required ? ' <small>oblig.</small>' : ''}</td><td><code>${esc(r.storage)}</code></td><td>${r.cardinality}</td><td>${d.n}</td><td>${(d.inferred ?? 0) + (d.unverified ?? 0) || ''}</td><td>${d.srcs} → ${d.dsts}</td>
        <td><small>${d.examples.map(x => `${esc(x.from)} → ${esc(x.to)}`).join('<br>')}</small></td><td><small>${esc(d.onDelete)}</small></td></tr>`; }).join('')}</tbody></table></section>`);
  }

  // --- Surse și legături de verificat --------------------------------------------------------------
  function sources(user) {
    const rows = q(`SELECT s.*, COUNT(p.id) n, SUM(p.certainty != 'confirmed') unsure FROM sources s LEFT JOIN provenance p ON p.source_id = s.id GROUP BY s.id ORDER BY s.kind, s.url`).all();
    return layout(user, {title: 'Surse', active: 'surse'}, `<h1>Surse <small>${rows.length}</small></h1><table class="t"><thead><tr><th>Tip</th><th>Sursă</th><th>Descărcată</th><th>Metodă</th><th>Informații</th><th>Nesigure</th></tr></thead><tbody>
      ${rows.map(s => `<tr><td>${esc(s.kind)}</td><td>${/^https?:/.test(s.url) ? `<a href="${esc(s.url)}" target="_blank">${esc(s.title ?? s.url)}</a>` : esc(s.title ?? s.url)}<br><small class="muted">${esc(s.snapshot_file ?? '')}</small></td>
      <td>${fmt(s.fetched_at)}</td><td>${esc(s.method ?? '')}</td><td>${s.n}</td><td>${s.unsure ? `<b class="err">${s.unsure}</b>` : ''}</td></tr>`).join('')}</tbody></table>`);
  }

  function inferred(user) {
    const groups = inferredGroups(store);
    return layout(user, {title: 'Legături de verificat', active: 'legaturi'}, `<h1>Legături de verificat <small>${groups.reduce((s, g) => s + g.items.length, 0)}</small></h1>
      <p class="muted">Legăturile deduse sau neverificate nu apar pe site. Confirmarea sau scoaterea în masă e o singură tranzacție, cu un singur eveniment; ce se scoate nu mai e propus din aceeași dovadă.</p>
      ${groups.map(g => `<section class="box inferred" data-relation="${g.relation}"><h2>${esc(g.label)}${g.sensitive ? ' 🔒' : ''} <small>dovadă: ${esc(g.evidence)} · recomandare: <b>${esc(g.recommendation)}</b></small></h2>
        <table class="t"><tbody>${g.items.map(it => `<tr data-pair="${it.src}:${it.dst}"><td><input type="checkbox" checked></td><td><a href="${eurl(g.relation.split('.')[0], it.src, 'relatii')}">${esc(it.srcTitle)}</a></td><td>→</td><td>${esc(it.dstTitle)}</td><td>${badge(it.status, LINK_STATUS)}</td><td><small>${esc(it.note ?? '')}</small></td><td>${it.confidence ?? ''}</td></tr>`).join('')}</tbody></table>
        <div class="actions"><button class="btn" data-bulk="confirmed">Confirmă selectatele</button><button class="btn ghost" data-bulk="dismissed">Scoate selectatele</button></div></section>`).join('') || '<p class="ok">Nimic de verificat.</p>'}`);
  }

  function propagation(user, id) {
    if (id) {
      const ev = q('SELECT * FROM change_events WHERE id = ?').get(id);
      if (!ev) return null;
      const log = q('SELECT * FROM sync_log WHERE event_id = ? ORDER BY id').all(id);
      const p = JSON.parse(ev.payload ?? '{}');
      return layout(user, {title: `Eveniment ${id}`, active: 'propagare'}, `<p class="crumbs"><a href="/manage/propagare/">Propagare</a></p><h1>Eveniment ${id}: ${esc(ev.action)} ${esc(ev.label ?? '')}</h1>
        <p>${fmt(ev.at)} · ${esc(ev.user_name)} · ${badge(ev.status, {pending: 'în așteptare', done: 'propagat', failed: 'eșuat'})} · ${ev.affected ?? 0} pagini${ev.last_error ? ` · <span class="err">${esc(ev.last_error)}</span>` : ''}
        ${ev.status === 'failed' ? ` <button data-post="/api/manage/sync/retry/${ev.id}">Reia</button>` : ''}</p>
        ${p.changed ? `<p>Câmpuri schimbate: ${p.changed.map(c => `<code>${esc(c)}</code>`).join(' ')}</p>` : ''}
        <table class="t"><thead><tr><th>Pagina</th><th>Acțiune</th><th>De ce</th></tr></thead><tbody>${log.map(l => `<tr><td><a href="${esc(l.path)}" target="_blank">${esc(l.path)}</a></td><td>${esc(l.action)}</td><td>${esc(l.detail ?? '')}</td></tr>`).join('')}</tbody></table>`);
    }
    const rows = q('SELECT * FROM change_events ORDER BY id DESC LIMIT 200').all();
    return layout(user, {title: 'Propagare', active: 'propagare'}, `<div class="head"><h1>Propagare</h1><button class="btn ghost" data-post="/api/manage/sync/scan">Scanează tot site-ul</button></div>
      <table class="t"><thead><tr><th>#</th><th>Când</th><th>Cine</th><th>Ce</th><th>Înregistrarea</th><th>Stare</th><th>Pagini</th></tr></thead><tbody>
      ${rows.map(ev => `<tr><td><a href="/manage/propagare/${ev.id}/">${ev.id}</a></td><td>${fmt(ev.at)}</td><td>${esc(ev.user_name)}</td><td>${esc(ev.action)}</td><td>${ev.entity && ev.entity_id ? `<a href="${eurl(ev.entity, ev.entity_id)}">${esc(ev.label ?? '')}</a>` : esc(ev.label ?? '')}</td>
      <td>${badge(ev.status, {pending: 'în așteptare', done: 'propagat', failed: 'eșuat'})}</td><td>${ev.affected ?? ''}</td></tr>`).join('')}</tbody></table>`);
  }

  function history(user) {
    const rows = q('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200').all();
    return layout(user, {title: 'Istoric', active: 'istoric'}, `<h1>Istoric</h1><table class="t"><thead><tr><th>Când</th><th>Cine</th><th>Ce</th><th>Înregistrarea</th><th>Câmpuri</th></tr></thead><tbody>
      ${rows.map(a => `<tr><td>${fmt(a.at)}</td><td>${esc(a.user_name)}</td><td>${esc(a.action)}</td><td>${a.entity && a.entity_id && a.action !== 'delete' && BY_KEY[a.entity] ? `<a href="${eurl(a.entity, a.entity_id, 'istoric')}">${esc(a.label ?? `${a.entity}:${a.entity_id}`)}</a>` : esc(a.label ?? '')}</td>
      <td><small>${a.changes ? Object.keys(JSON.parse(a.changes)).map(esc).join(', ') : ''}</small></td></tr>`).join('')}</tbody></table>`);
  }

  function search(user, url) {
    const s = url.searchParams.get('q') ?? '';
    const out = [];
    if (s.length >= 2) for (const e of ENTITIES) for (const r of store.list(e.key, {search: s, limit: 10})) out.push(`<li><a href="${eurl(e.key, r.id)}">${esc(titleOf(e, r))}</a> <small>${esc(e.one)}</small></li>`);
    return layout(user, {title: 'Căutare'}, `<h1>Căutare: „${esc(s)}”</h1>${out.length ? `<ul>${out.join('')}</ul>` : '<p class="muted">Niciun rezultat.</p>'}`);
  }

  const login = error => `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Intrare · Brain NIXODOR</title><link rel="stylesheet" href="/manage/assets/manage.css"></head>
    <body class="login"><form method="post" action="/manage/login/" class="box"><h1>Brain <b>NIXODOR</b></h1>${error ? `<p class="err">${esc(error)}</p>` : ''}
    <label>Email<input name="email" type="email" required autofocus></label><label>Parolă<input name="password" type="password" required></label><button class="btn">Intră</button></form></body></html>`;

  return {dashboard, entitiesHome, entityList, entityPage, newEntity, map, sources, inferred, propagation, history, search, login};
}
