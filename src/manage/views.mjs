// Panourile /manage: randate la fiecare cerere, fără cache (§3.1), deci arată starea curentă.
import {ENTITIES, BY_KEY, entity, titleOf, pathOf, relFields, relTable, RELATION_TYPES, targetOf} from '../registry/entities.mjs';
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
// „acum 5 min”, „ieri, 14:20”: pentru listele scurte; data completă rămâne în title
const ago = iso => {
  if (!iso) return '—';
  const d = new Date(iso), min = Math.round((Date.now() - d) / 60000);
  if (min < 1) return 'acum';
  if (min < 60) return `acum ${min} min`;
  if (min < 24 * 60) return `acum ${Math.round(min / 60)} h`;
  return d.toLocaleDateString('ro-RO', {day: 'numeric', month: 'short'});
};
const ACTIONS = {create: 'a creat', update: 'a modificat', publish: 'a publicat', unpublish: 'a retras', draft: 'a salvat în ciornă', delete: 'a șters', archive: 'a arhivat', merge: 'a unit', links: 'a schimbat legăturile', status: 'a schimbat starea', revert: 'a readus', media: 'a urcat'};
const action = a => ACTIONS[a] ?? a;

// iconițe line style, 24×24, culoarea textului
const ICONS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  map: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="8" r="2.5"/><circle cx="10" cy="18" r="2.5"/><path d="M8.3 7l7.3.7M7 8.3l2.2 7.4M16.4 10l-4.7 6.3"/>',
  check: '<path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>',
  source: '<path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M14 3v5h5M8 13h8M8 17h5"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
};
const icon = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] ?? ''}</svg>`;

export function createViews(app) {
  const {store, sync} = app;
  const graph = createGraph(store);
  const q = sql => store.db.prepare(sql);

  // Meniul: conținutul (tipurile, pe categorii, cu numărul lor) și, separat, instrumentele Brain-ului.
  // Tipurile cu o singură înregistrare (Date firmă) duc direct la ea.
  function typeHref(e) {
    if (e.singleton) { const r = store.list(e.key)[0]; if (r) return eurl(e.key, r.id); }
    return `/manage/entitati/${e.key}/`;
  }
  function layout(user, {title, active = ''}, body) {
    const st = sync.status();
    let unsure = 0;
    for (const e of ENTITIES) for (const rf of relFields(e)) unsure += q(`SELECT COUNT(*) n FROM ${relTable(e, rf)} WHERE status != 'confirmed'`).get().n;
    const tools = [['/manage/harta/', 'Harta legăturilor', 'harta', 'map'],
      ['/manage/surse/legaturi/', 'Legături de verificat', 'legaturi', 'check', unsure],
      ['/manage/surse/', 'Surse', 'surse', 'source'], ['/manage/propagare/', 'Propagare', 'propagare', 'sync', st.failed, 'err'],
      ['/manage/istoric/', 'Istoric', 'istoric', 'clock']];
    const initials = String(user.name ?? '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Brain NIXODOR</title><link rel="stylesheet" href="/manage/assets/manage.css"><link rel="icon" href="/assets/favicon.png"></head>
<body data-user="${esc(user.name)}"><header class="top"><a class="brand" href="/manage/"><span class="mark" aria-hidden="true"></span>NIXODOR <span>Brain</span></a>
<form class="search" action="/manage/cautare/" role="search">${icon('search')}<input name="q" placeholder="Caută produse, pagini, articole…" aria-label="Caută în Brain"></form>
<a class="site" href="/" target="_blank" rel="noopener">Vezi site-ul ${icon('external')}</a>
<span class="who" title="${esc(user.name)} · ${esc(user.role)}"><span class="avatar">${esc(initials)}</span>${user.local ? '' : `<a href="/manage/logout/">Ieșire</a>`}</span></header>
<div class="shell"><nav class="side" aria-label="Meniu">
<a href="/manage/" class="home${active === 'panou' ? ' on' : ''}">${icon('home')}Panou</a>
${Object.entries(CATEGORIES).map(([c, l]) => { const types = ENTITIES.filter(e => e.category === c && e.hub !== false); return types.length ? `<p>${l}</p>${types.map(e => `<a href="${typeHref(e)}"${active === e.key ? ' class="on"' : ''}><i style="background:${e.color}"></i><span>${esc(e.label)}</span>${e.singleton ? '' : `<small>${store.count(e.key)}</small>`}</a>`).join('')}` : ''; }).join('')}
<p>Instrumente</p>${tools.map(([h, l, k, ic, n, cls]) => `<a href="${h}"${k === active ? ' class="on"' : ''}>${icon(ic)}<span>${l}</span>${n ? `<b class="pill ${cls ?? ''}">${n}</b>` : ''}</a>`).join('')}
</nav>
<main class="main"><div id="live-banner" hidden></div>${body}</main></div>
<script src="/manage/assets/manage.js" defer></script></body></html>`;
  }

  // --- Panou ----------------------------------------------------------------------------
  // starea site-ului într-o propoziție: detaliile tehnice stau în Propagare
  function siteState(st) {
    if (st.failed) return `<a class="state err" href="/manage/propagare/"><i></i>${st.failed} ${st.failed === 1 ? 'pagină nu s-a putut actualiza' : 'actualizări au eșuat'}</a>`;
    if (st.pending || st.stale) return `<a class="state warn" href="/manage/propagare/"><i></i>Site-ul se actualizează…</a>`;
    return `<a class="state ok" href="/manage/propagare/" title="Ultima actualizare: ${esc(fmt(st.last?.processed_at))}"><i></i>Site-ul e la zi · ${st.pages} pagini</a>`;
  }

  function dashboard(user) {
    const st = sync.status(), items = todo(store);
    const recent = q(`SELECT * FROM change_events ORDER BY id DESC LIMIT 8`).all();
    // ciornele care așteaptă au secțiunea lor; restul observațiilor se grupează pe înregistrare (un card, nu un rând pe problemă)
    const approvals = items.filter(t => t.kind === 'aprobare');
    const general = items.filter(t => t.kind !== 'aprobare' && !(t.key && t.id));
    const byRec = new Map();
    for (const t of items.filter(t => t.kind !== 'aprobare' && t.key && t.id)) {
      const k = `${t.key}:${t.id}`;
      if (!byRec.has(k)) byRec.set(k, {key: t.key, id: t.id, title: t.title, impact: t.impact, list: []});
      byRec.get(k).list.push(t);
    }
    const generalLink = t => t.kind === 'legături' ? '/manage/surse/legaturi/' : t.kind === 'propagare' ? '/manage/propagare/' : null;
    const todoHtml = general.map(t => `<a class="task i-${t.impact}" href="${generalLink(t) ?? '#'}"><span class="dot"></span><span><b>${esc(t.text)}</b></span>${icon('arrow')}</a>`).join('')
      + [...byRec.values()].map(r => `<div class="task-group i-${r.impact}"><a class="task-head" href="${eurl(r.key, r.id)}"><span class="dot"></span><b>${esc(r.title ?? `${r.key}:${r.id}`)}</b><small>${esc(BY_KEY[r.key].one)}</small></a>
        <ul>${r.list.map(t => `<li class="i-${t.impact}"><a href="${eurl(r.key, r.id)}${t.field ? `?camp=${t.field}` : ''}">${esc(t.text)}</a></li>`).join('')}</ul></div>`).join('');
    const count = general.length + byRec.size;
    return layout(user, {title: 'Panou', active: 'panou'}, `<div class="page-head"><div><h1>Panou</h1><p class="lead">Ce e de făcut în Brain și ce s-a schimbat pe site.</p></div>${siteState(st)}</div>
      ${approvals.length ? `<section class="card accent"><h2>Așteaptă publicarea <small>${approvals.length}</small></h2><ul class="plain">${approvals.map(t => `<li><a href="${eurl(t.key, t.id)}">${esc(t.title)}</a> <span class="muted">${esc(BY_KEY[t.key].one)} · ${esc(t.text)}</span></li>`).join('')}</ul></section>` : ''}
      <div class="cols"><section class="card"><h2>De făcut <small>${count}</small></h2>${count ? `<div class="tasks">${todoHtml}</div>` : '<p class="empty">Totul e în ordine. Nimic de făcut.</p>'}</section>
      <section class="card"><h2>Ultimele modificări</h2><ol class="feed">${recent.map(ev => `<li><span class="when" title="${esc(fmt(ev.at))}">${esc(ago(ev.at))}</span>
        <span><b>${esc(ev.user_name)}</b> ${esc(action(ev.action))} ${ev.entity && ev.entity_id && BY_KEY[ev.entity] ? `<a href="${eurl(ev.entity, ev.entity_id)}">${esc(ev.label ?? '')}</a>` : esc(ev.label ?? '')}</span></li>`).join('')}</ol>
        <p class="more-link"><a href="/manage/istoric/">Tot istoricul ${icon('arrow')}</a></p></section></div>`);
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
    // o coloană care repetă doar ce scrie deja în nume (ex. cantitatea din „Felina, 10 kg”) nu se mai afișează
    const inTitle = f => f.type !== 'ref' && f.type !== 'image' && rows.every(r => r[f.key] == null || r[f.key] === '' || titleOf(e, r).includes(String(r[f.key])));
    const cols = e.fields.filter(f => f.list && !(rows.length && inTitle(f))).slice(0, 4);
    const cell = (f, r) => {
      const v = r[f.key];
      if (v == null || v === '') return '<span class="muted">—</span>';
      if (f.type === 'ref' || f.type === 'image') { const t = BY_KEY[targetOf(f)]; return `<a href="${eurl(t.key, v)}">${esc(titleOf(t, store.read(t.key, v)))}</a>`; }
      return esc(String(v).slice(0, 80));
    };
    const cat = CATEGORIES[e.category];
    return layout(user, {title: e.label, active: key}, `<div class="page-head"><div>${cat === e.label ? '' : `<p class="crumbs">${esc(cat)}</p>`}<h1>${esc(e.label)} <small>${rows.length}</small></h1></div>
      ${e.singleton && rows.length ? '' : `<a class="btn" href="/manage/entitati/${key}/nou/">${icon('plus')}${e.one} nou${e.one.endsWith('ă') ? 'ă' : ''}</a>`}</div>
      <form class="filters" role="search"><label class="field-search">${icon('search')}<input name="q" value="${esc(search)}" placeholder="Caută în ${esc(e.label.toLowerCase())}" aria-label="Caută"></label>${e.noStatus ? '' : `<select name="status" aria-label="Starea" data-autosubmit><option value="">Toate stările</option>${Object.entries(STATUS).map(([k, l]) => `<option value="${k}"${status === k ? ' selected' : ''}>${l}</option>`).join('')}</select>`}<button class="btn ghost">Caută</button></form>
      ${rows.length ? '' : `<p class="empty">${search || status ? 'Nimic nu corespunde căutării.' : 'Nicio înregistrare încă.'}</p>`}
      <div class="table-card"${rows.length ? '' : ' hidden'}><table class="t list"><thead><tr>${e.thumb ? '<th class="th-thumb"></th>' : ''}<th>Nume</th>${cols.filter(f => f.key !== e.title).map(f => `<th>${esc(f.label)}</th>`).join('')}${e.noStatus ? '' : '<th>Stare</th>'}<th class="num">Pagini</th></tr></thead><tbody>
      ${rows.map(r => {
        const thumbId = e.thumb === 'id' ? r.id : e.thumb ? r[e.thumb] : null, m = thumbId && store.read('media', thumbId);
        return `<tr data-href="${eurl(key, r.id)}">${e.thumb ? `<td class="td-thumb">${m && /^image/.test(m.mime) ? `<img class="thumb" src="/media/${m.id}/${encodeURIComponent(m.name)}" alt="" loading="lazy">` : '<span class="thumb none"></span>'}</td>` : ''}<td class="td-name"><a href="${eurl(key, r.id)}">${esc(titleOf(e, r))}</a>${r.draft ? ' <span class="badge s-draft">ciornă nepublicată</span>' : ''}</td>
        ${cols.filter(f => f.key !== e.title).map(f => `<td>${cell(f, r)}</td>`).join('')}${e.noStatus ? '' : `<td>${badge(r.status)}</td>`}<td class="num">${appearsIn(key, r.id) || '<span class="muted">—</span>'}</td></tr>`;
      }).join('')}</tbody></table></div>`);
  }

  // --- formularul ------------------------------------------------------------------------
  const linksToText = (items, depth = 0) => (items ?? []).map(it => `${'- '.repeat(depth)}${it.label ?? ''} | ${it.to ?? ''}${it.button ? ' | buton' : ''}\n${linksToText(it.children, depth + 1)}`).join('');

  const WIDE = new Set(['textarea', 'richtext', 'list', 'links', 'table', 'texts', 'multiselect']);
  // câmpurile de imagine arată doar fișierele potrivite: imagini sau, pentru etichete, PDF-uri
  const mediaFits = (f, m) => /pdf/i.test(f.key) ? m.mime === 'application/pdf' : /^image\//.test(m.mime);

  function field(f, value, rec) {
    const id = `f_${f.key}`, ro = f.readonly ? ' readonly' : '';
    const label = `<label for="${id}">${esc(f.label)}${f.required ? ' <b class="req" title="obligatoriu">*</b>' : ''}</label>`;
    let input, after = '';
    switch (f.type) {
      case 'textarea': input = `<textarea id="${id}" name="${f.key}" rows="4"${ro}>${esc(value ?? '')}</textarea>`; break;
      case 'richtext': input = `<textarea id="${id}" name="${f.key}" rows="10" class="rich"${ro}>${esc(value ?? '')}</textarea>`; break;
      case 'boolean': input = `<label class="switch"><input type="checkbox" id="${id}" name="${f.key}" data-type="boolean"${value ? ' checked' : ''}${f.readonly ? ' disabled' : ''}><span></span></label>`; break;
      case 'select': input = `<select id="${id}" name="${f.key}"${ro}><option value="">—</option>${f.options.map(o => `<option${o === value ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`; break;
      case 'ref': case 'image': {
        const t = BY_KEY[targetOf(f)];
        const list = store.list(t.key).filter(o => t.key !== 'media' || o.id === value || mediaFits(f, o));
        const opts = list.map(o => `<option value="${o.id}"${o.id === value ? ' selected' : ''}>${esc(titleOf(t, o))}${o.status && o.status !== 'published' ? ` (${STATUS[o.status]})` : ''}</option>`).join('');
        input = `<div class="with-link"><select id="${id}" name="${f.key}" data-type="int"${ro}><option value="">—</option>${opts}</select>${value ? `<a class="open" href="${eurl(t.key, value)}" title="Deschide ${esc(t.one.toLowerCase())}">${icon('external')}</a>` : ''}</div>`;
        if (f.type === 'image' && value) { const m = store.read('media', value); if (m && /^image/.test(m.mime)) after = `<img class="preview" src="/media/${m.id}/${encodeURIComponent(m.name)}" alt="">`; }
        break;
      }
      case 'list': input = `<textarea id="${id}" name="${f.key}" data-type="list" rows="3" placeholder="Câte unul pe rând"${ro}>${esc((value ?? []).join('\n'))}</textarea>`; break;
      case 'links': input = `<textarea id="${id}" name="${f.key}" data-type="links" rows="6" class="mono"${ro}>${esc(linksToText(value))}</textarea>`; after = '<small class="hint">Câte un rând: <code>Etichetă | destinație</code>. Destinația poate fi <code>ref:pagini:3</code>, <code>/blog/</code> sau o adresă externă. Copiii încep cu <code>- </code>, iar butonul se marchează cu <code>| buton</code>.</small>'; break;
      case 'table': case 'texts': case 'multiselect': input = `<textarea id="${id}" name="${f.key}" data-type="json" rows="4" class="mono"${ro}>${esc(value ? JSON.stringify(value, null, 1) : '')}</textarea>`; break;
      case 'int': case 'number': case 'money': input = `<input id="${id}" name="${f.key}" type="number" step="${f.type === 'int' ? 1 : 'any'}" value="${esc(value ?? '')}" data-type="number"${ro}>`; break;
      case 'date': input = `<input id="${id}" name="${f.key}" type="date" value="${esc(value ?? '')}"${ro}>`; break;
      default: input = `<input id="${id}" name="${f.key}" type="${f.type === 'email' ? 'email' : 'text'}" value="${esc(value ?? '')}"${f.max ? ` maxlength="${f.max}"` : ''}${ro}>`;
    }
    const kinds = f.kinds ? ` data-kinds="${f.kinds.join(' ')}"` : '';
    return `<div class="field${WIDE.has(f.type) ? ' wide' : ''}${f.type === 'boolean' ? ' inline' : ''}" data-field="${f.key}"${kinds}>${label}${input}${after}</div>`;
  }

  // ajutorul pentru textele formatate apare o dată, deasupra formularului, nu sub fiecare câmp
  const richHelp = `<details class="help"><summary>${icon('info')}Cum formatez textele</summary><p>Textul se curăță la salvare. Rămân titlurile, paragrafele, listele, citatele, tabelele, linkurile (<code>data-ref="tip:id"</code>) și imaginile (<code>data-media="id"</code>).</p><p>Se completează singure din Date firmă: <code>{telefon}</code> <code>{email}</code> <code>{firma}</code> <code>{an}</code>.</p></details>`;

  function form(e, rec, {draftView} = {}) {
    const vals = draftView ?? rec ?? {};
    const fields = e.fields.filter(f => f.type !== 'refs' && !f.intern);
    return `${fields.some(f => f.type === 'richtext') ? richHelp : ''}<form id="entity-form" class="form-grid" data-key="${e.key}" data-id="${rec?.id ?? ''}" data-version="${rec?.version ?? ''}">
      ${fields.map(f => field(f, vals[f.key], rec)).join('')}</form>`;
  }

  function newEntity(user, key) {
    const e = entity(key);
    return layout(user, {title: `${e.one} nou`, active: key}, `<div class="page-head"><div><p class="crumbs"><a href="/manage/entitati/${key}/">${esc(e.label)}</a></p><h1>${esc(e.one)} nou${e.one.endsWith('ă') ? 'ă' : ''}</h1></div></div>
      <div class="card">${form(e, null)}</div><div id="result"></div>
      <div class="savebar"><span class="muted">${e.noStatus ? '' : 'O ciornă nu apare pe site până o publici.'}</span>${e.noStatus ? '<button class="btn" data-action="create">Salvează</button>' : `<button class="btn ghost" data-action="create">Salvează ca ciornă</button><button class="btn" data-action="create-publish">Salvează și publică</button>`}</div>`);
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
    // „Publică” stă în antet doar pe celelalte file: pe Detalii, bara de salvare are deja „Salvează și publică”
    const canPublish = !e.noStatus && (rec.status !== 'published' || rec.draft);
    const menu = [!e.noStatus && rec.status === 'published' ? `<button data-action="status" data-status="draft">Retrage de pe site</button>` : '',
      !e.noStatus && rec.status !== 'archived' ? `<button data-action="status" data-status="archived">Arhivează</button>` : '',
      `<button class="danger" data-action="delete">Șterge</button>`].join('');
    const head = `<div class="page-head"><div><p class="crumbs">${CATEGORIES[e.category] === e.label ? '' : `${esc(CATEGORIES[e.category])} › `}<a href="${typeHref(e) === eurl(key, id) ? '#' : `/manage/entitati/${key}/`}">${esc(e.label)}</a></p>
      <h1>${esc(titleOf(e, draft))} ${e.noStatus ? '' : badge(rec.status)}${rec.draft ? ' <span class="badge s-draft">ciornă nepublicată</span>' : ''}</h1>
      <p class="meta">${path ? `<a href="${esc(path)}" target="_blank" rel="noopener">${esc(path)} ${icon('external')}</a><span>·</span>` : ''}<span title="${esc(fmt(rec.updated_at))}">Actualizat ${esc(ago(rec.updated_at))} de ${esc(rec.updated_by ?? '—')}</span></p></div>
      <div class="actions">${path ? `<a class="btn ghost" href="/manage/previzualizare${esc(path)}" target="_blank">${icon('eye')}Previzualizează</a>` : ''}
      ${canPublish && tab !== 'detalii' ? `<button class="btn" data-action="publish">Publică</button>` : ''}
      <details class="menu"><summary class="btn ghost icon-only" aria-label="Alte acțiuni">${icon('more')}</summary><div>${menu}</div></details></div></div>
      <nav class="tabs">${tabs.map(([t, l]) => `<a href="${eurl(key, id, t === 'detalii' ? '' : t)}"${t === tab ? ' class="on" aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;
    return layout(user, {title: titleOf(e, rec), active: key}, `<div data-entity="${key}:${id}">${head}${body}<div id="result"></div></div>`);
  }

  function detalii(e, rec, draft) {
    const obs = todo(store).filter(t => t.key === e.key && t.id === rec.id);
    const hint = e.noStatus ? 'Modificările apar pe site imediat după salvare.'
      : rec.status === 'published' ? `Site-ul se schimbă doar la „Salvează și publică”.${e.approval ? ' Publicarea cere aprobare.' : ''}`
      : 'Înregistrarea nu e pe site până o publici.';
    return `${obs.length ? `<div class="callout"><b>De rezolvat aici</b><ul>${obs.map(t => `<li class="i-${t.impact}"><a href="?camp=${esc(t.field ?? '')}">${esc(t.text)}</a></li>`).join('')}</ul></div>` : ''}
      <div class="card">${form(e, rec, {draftView: draft})}</div>
      <div class="savebar"><span class="muted">${esc(hint)}</span>${e.noStatus ? '<button class="btn" data-action="save">Salvează</button>'
        : `<button class="btn ghost" data-action="save">Salvează${rec.status === 'published' ? ' ciorna' : ''}</button><button class="btn" data-action="save-publish">Salvează și publică</button>`}</div>`;
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
    const st = sync.status();
    const failed = q(`SELECT * FROM change_events WHERE status = 'failed' ORDER BY id DESC LIMIT 20`).all();
    return layout(user, {title: 'Propagare', active: 'propagare'}, `<div class="page-head"><div><h1>Propagare</h1><p class="lead">Cum ajung modificările din Brain pe paginile site-ului.</p></div><div class="actions">${siteState(st)}<button class="btn ghost" data-post="/api/manage/sync/scan">Verifică tot site-ul</button></div></div>
      <div class="stats">${[['În așteptare', st.pending], ['Eșuate', st.failed], ['Pagini pe site', st.pages], ['De refăcut', st.stale], ['Dependențe urmărite', st.deps]].map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('')}
        <div class="stat"><b>${esc(ago(st.lastScan))}</b><span>Ultima verificare completă</span></div></div>
      ${failed.map(f => `<p class="err-row">Eveniment ${f.id} (${esc(action(f.action))} ${esc(f.label ?? '')}): ${esc(f.last_error)} <button data-post="/api/manage/sync/retry/${f.id}">Reia</button></p>`).join('')}
      <table class="t"><thead><tr><th>#</th><th>Când</th><th>Cine</th><th>Ce</th><th>Înregistrarea</th><th>Stare</th><th>Pagini</th></tr></thead><tbody>
      ${rows.map(ev => `<tr><td><a href="/manage/propagare/${ev.id}/">${ev.id}</a></td><td>${fmt(ev.at)}</td><td>${esc(ev.user_name)}</td><td>${esc(action(ev.action))}</td><td>${ev.entity && ev.entity_id ? `<a href="${eurl(ev.entity, ev.entity_id)}">${esc(ev.label ?? '')}</a>` : esc(ev.label ?? '')}</td>
      <td>${badge(ev.status, {pending: 'în așteptare', done: 'propagat', failed: 'eșuat'})}</td><td>${ev.affected ?? ''}</td></tr>`).join('')}</tbody></table>`);
  }

  function history(user) {
    const rows = q('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200').all();
    return layout(user, {title: 'Istoric', active: 'istoric'}, `<h1>Istoric</h1><table class="t"><thead><tr><th>Când</th><th>Cine</th><th>Ce</th><th>Înregistrarea</th><th>Câmpuri</th></tr></thead><tbody>
      ${rows.map(a => `<tr><td>${fmt(a.at)}</td><td>${esc(a.user_name)}</td><td>${esc(action(a.action))}</td><td>${a.entity && a.entity_id && a.action !== 'delete' && BY_KEY[a.entity] ? `<a href="${eurl(a.entity, a.entity_id, 'istoric')}">${esc(a.label ?? `${a.entity}:${a.entity_id}`)}</a>` : esc(a.label ?? '')}</td>
      <td><small>${a.changes ? Object.keys(JSON.parse(a.changes)).map(esc).join(', ') : ''}</small></td></tr>`).join('')}</tbody></table>`);
  }

  function search(user, url) {
    const s = url.searchParams.get('q') ?? '';
    const out = [];
    if (s.length >= 2) for (const e of ENTITIES) for (const r of store.list(e.key, {search: s, limit: 10})) out.push(`<li><a href="${eurl(e.key, r.id)}">${esc(titleOf(e, r))}</a> <small>${esc(e.one)}</small></li>`);
    return layout(user, {title: 'Căutare'}, `<h1>Căutare: „${esc(s)}”</h1>${out.length ? `<ul>${out.join('')}</ul>` : '<p class="muted">Niciun rezultat.</p>'}`);
  }

  const login = error => `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Intrare · Brain NIXODOR</title><link rel="stylesheet" href="/manage/assets/manage.css"></head>
    <body class="login"><form method="post" action="/manage/login/" class="card"><h1><span class="mark" aria-hidden="true"></span>NIXODOR Brain</h1>${error ? `<p class="err">${esc(error)}</p>` : ''}
    <label>Email<input name="email" type="email" required autofocus></label><label>Parolă<input name="password" type="password" required></label><button class="btn">Intră</button></form></body></html>`;

  return {dashboard, entitiesHome, entityList, entityPage, newEntity, map, sources, inferred, propagation, history, search, login};
}
