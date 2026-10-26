// Site-ul public, randat pe server din Brain, numai prin contextul urmărit.
import {ENTITIES, BY_KEY, titleOf, pathOf, LINK_REF} from '../registry/entities.mjs';
import {createContext} from './context.mjs';
import {icon} from './icons.mjs';
import {esc, stripTags} from '../core/content.mjs';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Versiunea foii de stil: se schimbă odată cu conținutul, deci browserele nu țin o versiune veche.
const CSS_V = createHash('sha1').update(readFileSync(new URL('./assets/site.css', import.meta.url))).digest('hex').slice(0, 10);

export const CANONICAL = 'https://www.nixodor.ro';
const ACCENT = {verde: 'green', portocaliu: 'orange', albastru: 'blue'};
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('ro-RO', {day: 'numeric', month: 'long', year: 'numeric'}) : '';

// Adresa → ce o randează. Rutele fixe întâi, apoi entitățile cu pagină publică.
export function resolve(store, path) {
  if (path === '/blog/') return {kind: 'blog'};
  if (path === '/sitemap.xml') return {kind: 'sitemap'};
  if (path === '/robots.txt') return {kind: 'robots'};
  for (const e of ENTITIES) {
    const m = e.public?.match(path);
    if (!m) continue;
    const row = store.db.prepare(`SELECT id FROM ${e.table} WHERE "${m.field}" = ?`).get(m.value);
    if (row) return {kind: 'entity', key: e.key, id: row.id};
  }
  return null;
}

export function render(store, path, {preview = false} = {}) {
  const ctx = createContext(store, {path, preview});
  const target = resolve(store, path);
  let out;
  if (!target) out = {status: 404, html: layout(ctx, {title: 'Pagina nu există'}, notFound())};
  else if (target.kind === 'blog') out = {status: 200, html: blogIndex(ctx)};
  else if (target.kind === 'sitemap') out = {status: 200, html: sitemap(ctx), type: 'application/xml'};
  else if (target.kind === 'robots') out = {status: 200, html: `User-agent: *\nDisallow: /manage/\nDisallow: /api/\nSitemap: ${CANONICAL}/sitemap.xml\n`, type: 'text/plain'};
  else {
    const rec = ctx.page(target.key, target.id);
    if (!rec) out = {status: 404, html: layout(ctx, {title: 'Pagina nu există'}, notFound())};
    else {
      out = {status: 200, owner: target, title: titleOf(BY_KEY[target.key], rec),
        html: ({pagini: pagina, game: gama, articole: articol, 'categorii-blog': categorie, utilizari: utilizare})[target.key](ctx, rec)};
      // adresa reală a înregistrării poate diferi (de exemplu ciorna din previzualizare)
    }
  }
  return {...out, deps: ctx.deps, layoutDeps: ctx.layoutDeps};
}

// --- machete --------------------------------------------------------------------
const SOCIAL_SVG = {
  facebook: '<path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.6 1.6-1.6h1.7V4.3c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.4H7.4V14h2.8v8z"/>',
  instagram: '<path d="M12 7.3A4.7 4.7 0 1 0 12 16.7 4.7 4.7 0 0 0 12 7.3zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM17 5.8a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zM16.5 2h-9A5.5 5.5 0 0 0 2 7.5v9A5.5 5.5 0 0 0 7.5 22h9a5.5 5.5 0 0 0 5.5-5.5v-9A5.5 5.5 0 0 0 16.5 2zm3.8 14.5a3.8 3.8 0 0 1-3.8 3.8h-9a3.8 3.8 0 0 1-3.8-3.8v-9a3.8 3.8 0 0 1 3.8-3.8h9a3.8 3.8 0 0 1 3.8 3.8z"/>',
  youtube: '<path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8c1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3z"/>'
};
const QUOTE = '<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M13 8C7.5 9.6 4 13.9 4 19.4 4 23.2 6.3 25 9 25c2.7 0 4.7-2 4.7-4.6 0-2.5-1.8-4.3-4.2-4.3-.4 0-.9.1-1.1.2.6-2.7 3-5.3 5.6-6.4zm14 0c-5.5 1.6-9 5.9-9 11.4 0 3.8 2.3 5.6 5 5.6 2.7 0 4.7-2 4.7-4.6 0-2.5-1.8-4.3-4.2-4.3-.4 0-.9.1-1.1.2.6-2.7 3-5.3 5.6-6.4z"/></svg>';
const fmtMonth = iso => iso ? new Date(iso).toLocaleDateString('ro-RO', {month: 'long', year: 'numeric'}) : '';
const initials = name => String(name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const isExternal = href => /^https?:/.test(href) && !/^https?:\/\/(www\.)?nixodor\.ro/.test(href);
// Un mic script, doar unde e un clip: încarcă playerul YouTube abia la clic (fără cookie-uri și fără greutate la încărcare).
const PLAYER_JS = `<script>document.addEventListener('click',function(e){var a=e.target.closest('a[data-yt]');if(!a)return;e.preventDefault();var f=document.createElement('iframe');f.src='https://www.youtube-nocookie.com/embed/'+a.dataset.yt+'?autoplay=1&rel=0';f.title=a.dataset.title||'Video';f.allow='autoplay; encrypted-media; picture-in-picture';f.allowFullscreen=true;a.replaceWith(Object.assign(document.createElement('div'),{className:'player'}));document.querySelector('.player:not(a)').appendChild(f);});</script>`;

function layout(ctx, {title, description, image, accent = 'green', bodyClass = '', scripts = ''}, main) {
  const firma = ctx.layout('Antet', () => ctx.one('firma', 'numele și logo-ul'));
  const header = ctx.layout('Antet', () => {
    const logo = ctx.media(firma?.logo_id);
    const menu = ctx.query('meniuri', {where: {code: 'antet'}, fields: ['code', 'items'], reason: 'meniul principal'})[0];
    return `<header class="site-header"><div class="wrap">
      <a class="logo" href="/" aria-label="${esc(firma?.brand ?? 'NIXODOR')} — pagina principală">${logo ? `<img src="${esc(logo.url)}" alt="${esc(firma?.brand ?? 'NIXODOR')}" width="150" height="26">` : esc(firma?.brand ?? 'NIXODOR')}</a>
      <input type="checkbox" id="nav-toggle" class="nav-toggle visually-hidden"><label for="nav-toggle" class="nav-burger"><span></span><b class="visually-hidden">Meniu</b></label>
      <nav class="nav" aria-label="Meniul principal">${menuItems(ctx, menu?.items)}</nav></div></header>`;
  });
  const footer = ctx.layout('Subsol', () => {
    const f = ctx.one('firma', 'datele firmei din subsol');
    const logo = ctx.media(f?.logo_light_id ?? f?.logo_id);
    const menu = ctx.query('meniuri', {where: {code: 'subsol'}, fields: ['code', 'items'], reason: 'meniul din subsol'})[0];
    const socials = (f?.socials ?? []).map(s => {
      const svg = SOCIAL_SVG[(s.label ?? '').toLowerCase()];
      return `<a href="${esc(s.to)}" target="_blank" rel="noopener" class="social" aria-label="${esc(s.label)} (se deschide într-o filă nouă)">${svg ? `<svg viewBox="0 0 24 24" aria-hidden="true">${svg}</svg>` : esc(s.label)}</a>`;
    }).join('');
    return `<footer class="site-footer on-dark"><div class="wrap">
      <div class="ft-cols">
        <div class="ft-brand">${logo ? `<img src="${esc(logo.url)}" alt="${esc(f?.brand)}" width="150" height="26" loading="lazy">` : `<strong>${esc(f?.brand)}</strong>`}<p>${esc(f?.tagline ?? '')}</p><div class="socials">${socials}</div></div>
        <div><h2>Contact</h2><address>${f?.legal_name ? `<span>${esc(f.legal_name)}</span>` : ''}${f?.address ? `<span>${esc(f.address)}</span>` : ''}
          ${f?.phone ? `<a href="tel:${esc(f.phone.replace(/\s/g, ''))}">${esc(f.phone)}</a>` : ''}
          ${f?.email ? `<a href="mailto:${esc(f.email)}">${esc(f.email)}</a>` : ''}</address></div>
        <div><h2>Informații</h2>${menuItems(ctx, menu?.items, 'ft-menu')}</div>
      </div>
      <div class="ft-bottom"><span>© ${esc(ctx.tokens('{an}'))} ${esc(f?.brand)}. Toate drepturile rezervate.</span>${f?.legal_name ? `<span>${esc(f.legal_name)}</span>` : ''}</div></div></footer>`;
  });
  const site = firma?.brand ?? 'NIXODOR';
  const fullTitle = title ? `${title} | ${site}` : site;
  const desc = description ?? firma?.tagline ?? '';
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title><meta name="description" content="${esc(desc)}"><meta name="theme-color" content="#004054">
<link rel="canonical" href="${CANONICAL}${esc(ctx.path)}"><meta property="og:title" content="${esc(fullTitle)}"><meta property="og:description" content="${esc(desc)}">
${image ? `<meta property="og:image" content="${CANONICAL}${esc(image.split('?')[0])}">` : ''}<meta property="og:url" content="${CANONICAL}${esc(ctx.path)}">
<link rel="preload" href="/assets/fonts/poppins-latin-400.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/assets/fonts/poppins-latin-700.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css?v=${CSS_V}"><link rel="icon" href="/assets/favicon.png"></head>
<body class="accent-${accent} ${bodyClass}"><a class="skip" href="#continut">Sari la conținut</a>${ctx.preview ? '<div class="preview-bar">Previzualizare — conținut nepublicat</div>' : ''}
${header}<main id="continut">${main}</main>${footer}${scripts}</body></html>`;
}

function menuItems(ctx, items, cls = 'menu') {
  if (!items?.length) return '';
  const li = items.map(it => {
    // un element fără etichetă proprie ia numele entității (trimitere, nu copie)
    const ref = LINK_REF.exec(it.to ?? '');
    const link = ref && !it.label && !['media', 'magazine'].includes(ref[1]) ? ctx.link(ref[1], +ref[2], 'meniu') : null;
    const href = link ? link.href + (ref[3] ?? '') : ctx.href(it.to, `meniu: ${it.label}`);
    const kids = it.children?.length ? menuItems(ctx, it.children, 'sub') : '';
    if (!href && !kids) return '';                                // dintr-un meniu dispare cu tot cu copiii lui
    const label = esc(it.label || (link ? link.rec.short_name ?? link.label : ''));
    return `<li${kids ? ' class="has-sub"' : ''}>${href ? `<a href="${esc(href)}"${it.button ? ' class="btn"' : ''}${ctx.path === href ? ' aria-current="page"' : ''}>${label}</a>` : `<span>${label}</span>`}${kids}</li>`;
  }).join('');
  return `<ul class="${cls}">${li}</ul>`;
}

const notFound = () => `<section class="section"><div class="wrap narrow"><h1>Pagina nu există</h1><p>Adresa nu mai e valabilă. <a href="/">Mergi la pagina principală</a>.</p></div></section>`;

// Primul buton e acțiunea principală; celelalte sunt secundare.
const buttons = (ctx, list, {first = 'btn', rest = 'btn secondary'} = {}) => (list ?? []).map((b, i) => {
  const href = ctx.href(b.to, `buton: ${b.label}`);
  if (!href) return '';
  const ext = isExternal(href);
  return `<a class="${i === 0 ? first : rest}" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${esc(b.label)}${ext ? '<span class="visually-hidden"> (se deschide într-o filă nouă)</span>' : ''} <span class="arr" aria-hidden="true">→</span></a>`;
}).join('');

const img = (m, cls = '', {eager = false, alt} = {}) => m ? `<img${cls ? ` class="${cls}"` : ''} src="${esc(m.url)}" alt="${esc(alt ?? m.alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"${m.width ? ` width="${m.width}" height="${m.height}"` : ''}>` : '';

const sectionHead = (ctx, s, h, extra = '') => (s.eyebrow || s.title || s.body || extra) ? `<div class="section-head"><div>${s.eyebrow ? `<p class="eyebrow">${esc(s.eyebrow)}</p>` : ''}${s.title ? `<${h}>${esc(s.title)}</${h}>` : ''}${s.body ? ctx.rich(s.body) : ''}</div>${extra}</div>` : '';

function video(ctx, id, title) {
  if (!id) return '';
  return `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${esc(id)}" title="${esc(title ?? 'Video')}" loading="lazy" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
}

function reviewCards(ctx, list) {
  return list.map(r => {
    const store = ctx.get('magazine', r.store_id, 'magazinul recenziei');
    return `<li class="review"><figure>${QUOTE}<blockquote>${esc(r.text)}</blockquote><figcaption><span class="avatar" aria-hidden="true">${esc(initials(r.author))}</span>
      <span><strong>${esc(r.author)}</strong><span>${store ? `${esc(store.name)} · ` : ''}${esc(fmtMonth(r.date))}</span></span></figcaption></figure></li>`;
  }).join('');
}

// Butonul de pauză al benzii de recenzii (mișcarea se oprește și la hover/focus, doar din CSS).
const MARQUEE_JS = `<script>document.addEventListener('click',function(e){var b=e.target.closest('.marquee-toggle');if(!b)return;var m=document.getElementById(b.getAttribute('aria-controls'));var p=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',p);m.classList.toggle('paused',p);b.querySelector('.t').textContent=p?'Pornește':'Pauză';});</script>`;

function reviews(ctx, lineId, title, {limit, eyebrow} = {}) {
  const all = ctx.query('recenzii', {where: {line_id: lineId}, order: 'date DESC', scope: `game:${lineId}`, reason: 'recenziile gamei'});
  if (!all.length) return '';
  const list = limit ? all.slice(0, limit) : all;
  const cards = reviewCards(ctx, list), id = `recenzii-${lineId}`;
  // banda are două copii ale listei, ca derularea să fie continuă; a doua e ascunsă pentru cititoarele de ecran
  return `<section class="section soft"><div class="wrap"><div class="section-head"><div>${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}<h2>${esc(title ?? 'Ce spun clienții')}</h2></div>
    <button type="button" class="marquee-toggle" aria-controls="${id}" aria-pressed="false"><span class="i" aria-hidden="true"></span><span class="t">Pauză</span><span class="visually-hidden"> derularea recenziilor</span></button></div>
    <div class="marquee" id="${id}" style="--dur: ${list.length * 9}s"><div class="marquee-track"><ul class="marquee-list">${cards}</ul><ul class="marquee-list" aria-hidden="true">${cards}</ul></div></div></div></section>${MARQUEE_JS}`;
}

function benefitsRow(ctx, lineId) {
  const list = ctx.links('game', lineId, 'benefits', 'beneficiile gamei');
  if (!list.length) return '';
  return `<ul class="benefits" role="list">${list.map(b => `<li><span class="bi">${icon(b.icon ?? 'check')}</span><span>${esc(b.text)}</span></li>`).join('')}</ul>`;
}

function lineCards(ctx) {
  const lines = ctx.query('game', {order: 'position, id', fields: ['status', 'position', 'name', 'short_name', 'card_text', 'card_image_id', 'hero_image_id', 'tagline', 'slug', 'accent'], reason: 'cardurile gamelor'});
  return `<div class="lines">${lines.map(l => {
    const link = ctx.link('game', l.id, 'card de gamă');
    if (!link) return '';
    return `<article class="line-card accent-${ACCENT[l.accent] ?? 'green'}"><div class="pic">${img(ctx.media(l.card_image_id ?? l.hero_image_id), '', {alt: ''})}</div>
      <div class="body"><h3><a href="${esc(link.href)}">${esc(l.short_name ?? l.name)}</a></h3><p>${esc(l.card_text ?? l.tagline ?? '')}</p>
      <span class="link-arrow" aria-hidden="true">Descoperă <span class="arr">→</span></span></div></article>`;
  }).join('')}</div>`;
}

// Reperele de sub erou: fiecare vine dintr-o entitate (producător, magazine, recenzii, beneficii), nu e text scris de mână.
function trustStrip(ctx, line, producerId) {
  const items = [];
  const benefit = line ? ctx.links('game', line.id, 'benefits', 'reperele de sub erou')[0] : null;
  if (benefit) items.push([benefit.icon ?? 'leaf', benefit.text, line.short_name ?? line.name]);
  const pr = ctx.get('producatori', producerId ?? line?.producer_id, 'reperele de sub erou');
  if (pr) items.push(['lab', `Tehnologie ${pr.technology ?? pr.name}`, `${pr.name.replace(/ GmbH$/, '')}, ${pr.country}`]);
  const stores = ctx.query('magazine', {order: 'position, id', fields: ['status', 'name', 'position'], reason: 'reperele de sub erou'});
  if (stores.length) items.push(['bag', 'Disponibil online', stores.map(s => s.name).join(' și ')]);
  if (line) {
    const n = ctx.query('recenzii', {where: {line_id: line.id}, scope: `game:${line.id}`, reason: 'numărul de recenzii'}).length;
    if (n) items.push(['talk', `${n} păreri de la clienți`, 'de pe ' + [...new Set(ctx.query('recenzii', {where: {line_id: line.id}, scope: `game:${line.id}`, reason: 'sursele recenziilor'}).map(r => ctx.get('magazine', r.store_id)?.name).filter(Boolean))].join(' și ')]);
  }
  if (!items.length) return '';
  return `<div class="trust"><div class="wrap"><ul>${items.map(([ic, strong, small]) => `<li><span class="ico">${icon(ic)}</span><span><strong>${esc(strong)}</strong>${esc(small)}</span></li>`).join('')}</ul></div></div>`;
}

// --- tipuri de pagini ---------------------------------------------------------------
function pagina(ctx, p) {
  const sections = ctx.links('pagini', p.id, 'sections', 'secțiunile paginii');
  let first = true, ogImage = null, scripts = '';
  const body = sections.map(s => ctx.within(`Secțiunea „${s.title ?? s.kind}”`, s.kind, () => {
    const h = first ? 'h1' : 'h2'; first = false;
    switch (s.kind) {
      case 'hero': {
        const line = ctx.get('game', s.line_id, 'gama prezentată');
        const bg = ctx.media(s.image_id);
        const pack = ctx.media(line?.hero_image_id ?? line?.card_image_id);
        ogImage ??= (pack ?? bg)?.url;
        return `<section class="hero on-dark">${bg ? `<div class="hero-bg">${img(bg, '', {eager: true, alt: ''})}</div>` : ''}
          <div class="wrap hero-grid"><div>${s.eyebrow ? `<p class="eyebrow">${esc(s.eyebrow)}</p>` : ''}<${h}>${esc(s.title ?? line?.tagline)}</${h}>
          ${s.body ? `<div class="lead">${ctx.rich(s.body)}</div>` : ''}<div class="actions">${buttons(ctx, s.buttons, {first: 'btn big', rest: 'btn big secondary'})}</div></div>
          ${pack ? `<div class="hero-pack">${img(pack, '', {eager: true})}</div>` : ''}</div></section>${trustStrip(ctx, line, s.producer_id)}`;
      }
      case 'beneficii': {
        const line = ctx.get('game', s.line_id, 'gama ale cărei beneficii le arătăm');
        const list = line ? ctx.links('game', line.id, 'benefits', 'beneficiile gamei') : [];
        if (!list.length) return '';
        return `<section class="section"><div class="wrap benefits-wrap">${sectionHead(ctx, s, h)}
          <ul class="benefit-grid" role="list">${list.map(b => `<li class="benefit"><span class="ico">${icon(b.icon ?? 'check')}</span><span class="num" aria-hidden="true"></span><h3>${esc(b.text)}</h3></li>`).join('')}</ul></div></section>`;
      }
      case 'carduri-game': return `<section class="section soft"><div class="wrap">${sectionHead(ctx, s, h, s.buttons?.length ? `<div class="actions">${buttons(ctx, s.buttons, {first: 'btn secondary'})}</div>` : '')}${lineCards(ctx)}</div></section>`;
      case 'video': {
        const line = ctx.get('game', s.line_id, 'clipul gamei');
        const id = s.video_id ?? line?.video_id;
        if (!id) return '';
        scripts = PLAYER_JS;
        const pack = ctx.media(s.image_id ?? line?.hero_image_id ?? line?.card_image_id);
        return `<section class="section dark on-dark"><div class="wrap video-block"><div>${s.eyebrow ? `<p class="eyebrow">${esc(s.eyebrow)}</p>` : ''}${s.title ? `<${h}>${esc(s.title)}</${h}>` : ''}${ctx.rich(s.body)}</div>
          <a class="player" href="https://www.youtube.com/watch?v=${esc(id)}" data-yt="${esc(id)}" data-title="${esc(s.title ?? 'Video')}" target="_blank" rel="noopener">
          ${pack ? img(pack, '', {alt: ''}) : ''}<span class="play"><span class="visually-hidden">Pornește clipul</span></span><span class="cap" aria-hidden="true">Vezi clipul</span></a></div></section>`;
      }
      case 'recenzii': return s.line_id ? reviews(ctx, s.line_id, s.title, {limit: s.limit, eyebrow: s.eyebrow}) : '';
      case 'magazine': {
        const stores = ctx.query('magazine', {order: 'position, id', fields: ['name', 'url', 'phone', 'address', 'pickup_url', 'position', 'logo_id'], reason: 'lista magazinelor'});
        return `<section class="section"><div class="wrap">${sectionHead(ctx, s, h)}
          <div class="grid g2 stores">${stores.map(m => `<div class="store"><h3>${esc(m.name)}</h3>${m.address ? `<p>${esc(m.address)}</p>` : ''}
          ${m.phone ? `<p><a href="tel:${esc(m.phone.replace(/\s/g, ''))}">${esc(m.phone)}</a></p>` : ''}
          ${m.pickup_url ? `<p><a href="${esc(m.pickup_url)}" target="_blank" rel="noopener">Puncte de ridicare</a></p>` : ''}
          ${m.url ? `<p><a class="btn" href="${esc(m.url)}" target="_blank" rel="noopener">Cumpără de la ${esc(m.name)} <span class="arr" aria-hidden="true">→</span></a></p>` : ''}</div>`).join('')}</div></div></section>`;
      }
      case 'contact': {
        const f = ctx.one('firma', 'datele de contact');
        return `<section class="section"><div class="wrap narrow">${s.title ? `<${h}>${esc(s.title)}</${h}>` : ''}${ctx.rich(s.body)}
          <dl class="contact"><dt>Firma</dt><dd>${esc(f?.legal_name)}</dd><dt>Sediu</dt><dd>${esc(f?.address)}</dd>
          ${f?.phone ? `<dt>Telefon</dt><dd><a href="tel:${esc(f.phone.replace(/\s/g, ''))}">${esc(f.phone)}</a></dd>` : ''}
          ${f?.email ? `<dt>Email</dt><dd><a href="mailto:${esc(f.email)}">${esc(f.email)}</a></dd>` : ''}</dl></div></section>`;
      }
      case 'insigna-producator': {
        const pr = ctx.get('producatori', s.producer_id, 'producătorul');
        if (!pr) return '';
        return `<section class="section"><div class="wrap"><div class="tech">${img(ctx.media(pr.badge_id), '', {alt: pr.technology ?? pr.name})}
          <div>${s.eyebrow ? `<p class="eyebrow">${esc(s.eyebrow)}</p>` : ''}<${h}>${esc(s.title ?? `Tehnologia ${pr.technology}`)}</${h}>${ctx.rich(s.body)}</div>
          <p class="meta"><strong>${esc(pr.name)}</strong>${esc(pr.country)}</p></div></div></section>`;
      }
      case 'cta': return `<section class="section"><div class="wrap"><div class="cta-card on-dark"><div>${s.eyebrow ? `<p class="eyebrow">${esc(s.eyebrow)}</p>` : ''}${s.title ? `<${h}>${esc(s.title)}</${h}>` : ''}${ctx.rich(s.body)}</div>
        <div class="actions">${buttons(ctx, s.buttons, {first: 'btn big', rest: 'btn big light'})}</div></div></div></section>`;
      case 'articole': {
        const posts = ctx.query('articole', {order: 'published_at DESC', fields: ['status', 'published_at'], reason: 'ultimele articole'}).slice(0, s.limit ?? 3);
        if (!posts.length) return '';
        const more = (s.buttons ?? []).map(b => { const href = ctx.href(b.to, `buton: ${b.label}`); return href ? `<a class="link-arrow" href="${esc(href)}">${esc(b.label)} <span class="arr" aria-hidden="true">→</span></a>` : ''; }).join('');
        return `<section class="section"><div class="wrap">${sectionHead(ctx, s, h, more)}<div class="grid g3">${posts.map(a => articleCard(ctx, a)).join('')}</div></div></section>`;
      }
      default: return `<section class="section"><div class="wrap narrow prose">${s.title ? `<${h}>${esc(s.title)}</${h}>` : ''}${ctx.rich(s.body)}</div></section>`;
    }
  })).join('\n');
  const intro = !sections.length || p.body ? `<section class="section"><div class="wrap narrow prose">${sections.length ? '' : `<h1>${esc(p.title)}</h1>`}${ctx.rich(p.intro)}${ctx.rich(p.body)}</div></section>` : '';
  return layout(ctx, {title: p.slug === '' ? null : (p.meta_title ?? p.title), description: p.meta_description, image: ogImage, scripts}, body + intro);
}

// Pagina unei game: un singur șablon pentru toate gamele. O secțiune fără date nu apare.
const DETAILS = [['composition', 'Compoziție'], ['application', 'Mod de utilizare'], ['dosage', 'Dozare'], ['storage', 'Păstrare și valabilitate'], ['safety', 'Instrucțiuni de siguranță']];

// Variantele diferă doar prin cantitate, parfum sau ambalaj: pe pagină apar ca o listă generată, nu drept carduri.
const qty = v => (v.size ?? 0) * (v.unit === 'ml' ? 0.001 : 1);
const sizeOf = v => [[v.size != null ? String(v.size).replace('.', ',') : null, v.unit].filter(Boolean).join(' '), v.pack].filter(Boolean).join(', ');

function availability(variants) {
  if (!variants.length) return '';
  const groups = new Map();
  for (const v of [...variants].sort((x, y) => qty(x) - qty(y))) {
    const k = v.scent ?? '', list = groups.get(k) ?? [];
    const label = sizeOf(v);
    if (label && !list.includes(label)) list.push(label);
    groups.set(k, list);
  }
  const rows = [...groups].filter(([, list]) => list.length);
  if (!rows.length) return '';
  const many = rows.length > 1;
  return `<div class="variants"><h3>Variante disponibile</h3><dl>${rows.map(([scent, list]) =>
    `<div>${many ? `<dt>${esc(scent || 'Fără parfum')}</dt>` : ''}<dd>${list.map(esc).join(' · ')}</dd></div>`).join('')}</dl></div>`;
}

function buyButtons(buy, cls) {
  return buy.map((b, i) => `<a class="btn ${cls}${i ? ' secondary' : ''}" href="${esc(b.url)}" target="_blank" rel="noopener">Cumpără de la ${esc(b.store.name)} <span class="arr" aria-hidden="true">→</span><span class="visually-hidden"> (se deschide într-o filă nouă)</span></a>`).join('');
}

function gama(ctx, g) {
  const accent = ACCENT[g.accent] ?? 'green';
  // eroul paginii de produs arată mereu ambalajul gamei (la fel pe toate gamele)
  const hero = ctx.media(g.card_image_id ?? g.hero_image_id);
  const name = g.short_name ?? g.name;
  const variants = ctx.within('Variante', 'variantele gamei', () =>
    ctx.query('produse', {where: {line_id: g.id}, order: 'scent, unit, size, pack', scope: `game:${g.id}`, reason: 'variantele gamei'}));
  const buy = ctx.within('Cumpără', 'magazinele gamei', () => ctx.links('game', g.id, 'listings', 'unde se vinde gama'))
    .map(st => ({store: st, url: st._attrs?.url ?? st.url})).filter(b => b.url);
  const avail = availability(variants);

  const details = DETAILS.filter(([k]) => g[k]).map(([k, t], i) => `<details${i === 0 ? ' open' : ''}><summary>${t}</summary><div class="prose">${ctx.rich(g[k])}</div></details>`).join('');
  const about = g.description || details || avail ? `<section class="section soft" id="despre"><div class="wrap"><div class="section-head"><div><p class="eyebrow">Despre produs</p><h2>${esc(g.name)}</h2></div></div>
    <div class="about${details ? '' : ' single'}">${g.description || avail ? `<div class="prose">${ctx.rich(g.description)}${avail}</div>` : ''}${details ? `<div class="details">${details}</div>` : ''}</div></div></section>` : '';

  let scripts = '';
  const clip = g.video_id ? (scripts = PLAYER_JS, `<section class="section dark on-dark"><div class="wrap video-block"><div><p class="eyebrow">Video</p><h2>${esc(name)}, pe scurt</h2></div>
    <a class="player" href="https://www.youtube.com/watch?v=${esc(g.video_id)}" data-yt="${esc(g.video_id)}" data-title="${esc(g.name)}" target="_blank" rel="noopener">${hero ? img(hero, 'pack', {alt: ''}) : ''}<span class="play"><span class="visually-hidden">Pornește clipul</span></span><span class="cap" aria-hidden="true">Vezi clipul</span></a></div></section>`) : '';

  const articles = ctx.within('Articole despre gamă', 'articolele care recomandă gama', () => ctx.inverse('articole', 'lines', 'game', g.id, 'articolele care recomandă gama'));
  const producer = ctx.get('producatori', g.producer_id, 'producătorul gamei');
  const pdf = ctx.media(g.label_pdf_id);
  const stores = ctx.query('magazine', {order: 'position, id', fields: ['status', 'name', 'position'], reason: 'magazinele din apelul final'});
  const allStores = ctx.internal('/de-unde-cumpar/', 'pagina magazinelor');

  const main = `<section class="product-hero"><div class="wrap hero-split"><div>
      <h1>${esc(g.name)}</h1>${g.tagline ? `<p class="lead">${esc(g.tagline)}</p>` : ''}${benefitsRow(ctx, g.id)}
      <div class="actions">${buyButtons(buy, 'big')}
      ${pdf ? `<a class="btn big secondary" href="${esc(pdf.url)}" target="_blank" rel="noopener">Eticheta (PDF)<span class="visually-hidden"> (se deschide într-o filă nouă)</span></a>` : about ? `<a class="btn big secondary" href="#despre">Despre produs</a>` : ''}</div></div>
      ${hero ? `<div class="hero-pack">${img(hero, '', {eager: true})}</div>` : ''}</div></section>
    ${about}${clip}
    ${reviews(ctx, g.id, `Ce spun clienții despre ${name}`, {eyebrow: 'Recenzii'})}
    ${articles.length ? `<section class="section"><div class="wrap"><div class="section-head"><div><p class="eyebrow">Blog</p><h2>Articole despre ${esc(name)}</h2></div></div><div class="grid g3">${articles.map(a => articleCard(ctx, a)).join('')}</div></div></section>` : ''}
    ${producer ? `<section class="section"><div class="wrap"><div class="tech">${img(ctx.media(producer.badge_id), '', {alt: producer.technology ?? producer.name})}
      <div><p class="eyebrow">Tehnologia din spate</p><h2>${esc(producer.technology ? `Tehnologia ${producer.technology}` : producer.name)}</h2><p>${esc(name)} este produs de ${esc(producer.name)}, ${esc(producer.country)}.</p></div>
      <p class="meta"><strong>${esc(producer.name)}</strong>${esc(producer.country)}</p></div></div></section>` : ''}
    ${stores.length ? `<section class="section"><div class="wrap"><div class="cta-card on-dark"><div><p class="eyebrow">De unde cumpăr</p><h2>Găsești ${esc(name)} online</h2>
      <p>${esc(`Comandă de la ${stores.map(s => s.name).join(' sau ')}.`)}</p></div>
      <div class="actions">${buyButtons(buy, 'big')}${allStores ? `<a class="btn big light" href="${esc(allStores)}">Toate magazinele <span class="arr" aria-hidden="true">→</span></a>` : ''}</div></div></div></section>` : ''}`;
  return layout(ctx, {title: g.meta_title ?? g.name, description: g.meta_description ?? g.tagline, image: hero?.url, accent, scripts}, main);
}

function articleCard(ctx, a) {
  const link = ctx.link('articole', a.id, 'card de articol');
  if (!link) return '';
  return `<a class="post-card" href="${esc(link.href)}"><span class="pic">${img(ctx.media(a.featured_image_id), '', {alt: ''})}</span><span class="date">${esc(fmtDate(a.published_at))}</span><strong>${esc(a.title)}</strong><span class="excerpt">${esc(a.excerpt ?? '')}</span></a>`;
}


function blogIndex(ctx) {
  const posts = ctx.query('articole', {order: 'published_at DESC', fields: ['status', 'published_at'], reason: 'lista articolelor'});
  const cats = ctx.query('categorii-blog', {order: 'name', fields: ['status', 'name'], reason: 'categoriile blogului'});
  const main = `<section class="section"><div class="wrap"><h1>Blog</h1>
    <nav class="chips">${cats.map(c => { const l = ctx.link('categorii-blog', c.id); return l ? `<a href="${esc(l.href)}">${esc(c.name)}</a>` : ''; }).join('')}</nav>
    <div class="grid g3">${posts.map(p => articleCard(ctx, p)).join('')}</div></div></section>`;
  return layout(ctx, {title: 'Blog', description: 'Articole despre îngrijirea animalelor de companie, fose septice și soluții naturale împotriva mirosurilor.'}, main);
}

function categorie(ctx, c) {
  const posts = ctx.inverse('articole', 'categories', 'categorii-blog', c.id, 'articolele categoriei');
  const main = `<section class="section"><div class="wrap"><p class="crumbs"><a href="/blog/">Blog</a></p><h1>${esc(c.name)}</h1>${c.description ? `<p class="lead">${esc(c.description)}</p>` : ''}
    <div class="grid g3">${posts.map(p => articleCard(ctx, p)).join('')}</div></div></section>`;
  return layout(ctx, {title: `${c.name} — Blog`, description: c.description}, main);
}

function articol(ctx, a) {
  const author = ctx.get('autori', a.author_id, 'autorul');
  const cats = ctx.links('articole', a.id, 'categories', 'categoriile articolului');
  const lines = ctx.links('articole', a.id, 'lines', 'gamele recomandate');
  const image = ctx.media(a.featured_image_id);
  const main = `<article class="section"><div class="wrap narrow prose">
    <p class="crumbs"><a href="/blog/">Blog</a>${cats.map(c => { const l = ctx.link('categorii-blog', c.id); return l ? ` · <a href="${esc(l.href)}">${esc(c.name)}</a>` : ''; }).join('')}</p>
    <h1>${esc(a.title)}</h1><p class="muted">${esc(fmtDate(a.published_at))}${author ? ` · ${esc(author.name)}` : ''}</p>
    ${img(image, 'feature')}${ctx.rich(a.content)}
    ${lines.length ? `<aside class="related"><h2>Produse recomandate</h2><div class="grid g2">${lines.map(l => { const k = ctx.link('game', l.id, 'gamă recomandată'); return k ? `<a class="card" href="${esc(k.href)}">${img(ctx.media(l.card_image_id ?? l.hero_image_id))}<strong>${esc(l.short_name ?? l.name)}</strong><span>${esc(l.tagline ?? '')}</span></a>` : ''; }).join('')}</div></aside>` : ''}
  </div></article>`;
  return layout(ctx, {title: a.meta_title ?? a.title, description: a.meta_description ?? a.excerpt ?? stripTags(a.content).slice(0, 155), image: image?.url}, main);
}

function utilizare(ctx, u) {
  const lines = ctx.inverse('game', 'uses', 'utilizari', u.id, 'gamele pentru această utilizare');
  const main = `<section class="section"><div class="wrap narrow prose"><h1>${esc(u.name)}</h1>${ctx.rich(u.description)}</div></section>
    ${lines.length ? `<section class="section"><div class="wrap"><h2>Produse</h2><div class="grid g3 cards">${lines.map(l => { const k = ctx.link('game', l.id); return k ? `<a class="card" href="${esc(k.href)}">${img(ctx.media(l.card_image_id ?? l.hero_image_id))}<strong>${esc(l.short_name ?? l.name)}</strong></a>` : ''; }).join('')}</div></div></section>` : ''}`;
  return layout(ctx, {title: u.name}, main);
}

function sitemap(ctx) {
  const urls = ['/', '/blog/'];
  for (const e of ENTITIES.filter(e => e.public)) {
    for (const r of ctx.query(e.key, {fields: ['status', 'slug'], reason: 'sitemap'})) { const p = pathOf(e, r); if (p && !urls.includes(p)) urls.push(p); }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${CANONICAL}${esc(u)}</loc></url>`).join('\n')}\n</urlset>\n`;
}
