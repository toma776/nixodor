// Analiza snapshot-ului nixodor.ro → reference/analysis/*.json (etapa „analyze” din standard, §1.3).
// Nu scrie în nicio bază: doar rapoarte, ca deciziile să se poată discuta înainte de import.
import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises';
import {join} from 'node:path';

const BASE = new URL('../reference/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const SNAP = join(BASE, 'snapshot'), OUT = join(BASE, 'analysis');
await mkdir(OUT, {recursive: true});

const text = s => s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
  .replace(/&#8594;/g, '→').replace(/&copy;/g, '©').replace(/&#8211;/g, '–').replace(/&#8217;/g, '’')
  .replace(/&#8222;|&#8221;|&#8220;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const write = (name, data) => writeFile(join(OUT, name), JSON.stringify(data, null, 1));

// --- Pagini statice ---------------------------------------------------------
const files = (await readdir(join(SNAP, 'site'))).filter(f => f.endsWith('.html'));
const pages = [], reviews = [], products = [], links = [], issues = [];
for (const f of files) {
  const h = (await readFile(join(SNAP, 'site', f), 'utf8')).replace(/<!--(?!\[if)[\s\S]*?-->/g, '');   // fără comentariile HTML (cod vechi dezactivat)
  const path = f === 'index.html' ? '/' : '/' + f;
  const main = h.slice(Math.max(0, h.indexOf('<div id="header-2"')), h.indexOf('<div id="footer"') > 0 ? h.indexOf('<div id="footer"') : undefined);
  pages.push({
    path, file: f,
    title: text(h.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ''),
    description: h.match(/name="description" content="([^"]*)"/)?.[1] ?? null,
    h1: [...main.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map(m => text(m[1])),
    h2: [...main.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map(m => text(m[1])),
    images: [...main.matchAll(/<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/g)].map(m => ({src: m[1], alt: m[2]})),
    videos: [...main.matchAll(/youtube\.com\/embed\/([\w-]+)/g)].map(m => m[1]),
    words: text(main).split(' ').length
  });

  // recenzii: autor + text + „dată - sursă”
  for (const m of main.matchAll(/class="autor[^"]*">([\s\S]*?)<\/div>[\s\S]*?class="review">([\s\S]*?)<\/div>[\s\S]*?class="data">([\s\S]*?)<\/p>/g)) {
    const [date, source] = text(m[3]).split(/\s+-\s+/);
    const [d, mo, y] = date.split('.');
    reviews.push({page: path, author: text(m[1]), text: text(m[2]), date: `${y}-${mo}-${d}`, source});
  }

  // carduri de produs (homepage: .product, Felina: .felina)
  for (const m of main.matchAll(/<div class="col w\d+ (?:product|felina)">([\s\S]*?)(?=<div class="col w\d+ |<\/div>\s*<\/div>\s*<\/div>\s*<\/div>)/g)) {
    const card = m[1];
    products.push({
      page: path,
      name: text(card.match(/class="nume[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? ''),
      buy_url: card.match(/href="([^"]+)"/)?.[1] ?? null,
      image: card.match(/<img src="([^"]+)"/)?.[1] ?? null,
      claim: text(card.match(/class="product-text">([\s\S]*?)<\/div>/)?.[1] ?? card.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? '')
    });
  }

  for (const m of h.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g))
    links.push({page: path, href: m[1], label: text(m[2]) || null});

  if (/lorem ipsum/i.test(h)) issues.push({page: path, impact: 'mare', issue: 'text „lorem ipsum” ascuns (alb pe alb) în conținut'});
  if (/<img[^>]+alt=""/.test(main)) issues.push({page: path, impact: 'mediu', issue: `${(main.match(/<img[^>]+alt=""/g) || []).length} imagini fără text alternativ`});
}

// --- Blog (WordPress) -------------------------------------------------------
const cats = JSON.parse(await readFile(join(SNAP, 'blog-api/categories.json'), 'utf8'));
const tags = JSON.parse(await readFile(join(SNAP, 'blog-api/tags.json'), 'utf8'));
const users = JSON.parse(await readFile(join(SNAP, 'blog-api/users.json'), 'utf8'));
// Indexul (ID-uri, date, taxonomii) vine din API; conținutul din paginile arhivate în Wayback (vezi crawl.mjs).
const index = JSON.parse(await readFile(join(SNAP, 'blog-api/posts-index.json'), 'utf8'));
const posts = [];
for (const p of index) {
  const page = await readFile(join(SNAP, 'blog/posts', `${p.slug}.html`), 'utf8').catch(() => null);
  const html = page?.split(/<div class="entry-content">/)[1]?.split(/<\/div><!-- \.entry-content -->|<div class="section-inner">\s*<div class="author-bio|<nav class="pagination-single/)[0] ?? '';
  const meta = n => page?.match(new RegExp(`<meta (?:name|property)="${n}" content="([^"]*)"`))?.[1] ?? null;
  posts.push({
    wp_id: p.id, slug: p.slug, link: p.link, title: text(p.title.rendered), date: p.date, modified: p.modified,
    author: users.find(u => u.id === p.author)?.name ?? p.author,
    categories: p.categories.map(id => cats.find(c => c.id === id)?.name),
    tags: p.tags.map(id => tags.find(t => t.id === id)?.name),
    featured_media: p.featured_media,
    certainty: page ? 'confirmed' : 'unrecoverable',
    meta: {title: page?.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? null, description: meta('description'), og_image: meta('og:image')},
    words: text(html).split(' ').filter(Boolean).length,
    headings: [...html.matchAll(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/g)].map(m => text(m[1])),
    links: [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(m => ({href: m[1].replace(/^https?:\/\/web\.archive\.org\/web\/\d+\w*\//, ''), label: text(m[2])})),
    images: [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map(m => m[1].replace(/^https?:\/\/web\.archive\.org\/web\/\d+\w*\//, '')),
    text: text(html)
  });
}
posts.sort((a, b) => b.date.localeCompare(a.date));

// --- Mențiuni de produse în texte (cu granițe de cuvânt, §1.6 b) ------------
const NAMES = {
  nixodor: ['nixodor'],
  bioactivator: ['bioactivator', 'bioactivatorul', 'fosa septica', 'fosă septică'],
  felina: ['felina', 'nisip pentru pisici'],
  probiotic: ['probiotic', 'probioticul'],
  'aer-curat': ['aer curat'],
  nourivit: ['nourivit'],
  portalia: ['portalia'],
  emag: ['emag']
};
const mentions = [];
const corpus = [...pages.map(p => ({where: p.path, body: p.h1.concat(p.h2).join(' ')})),
  ...posts.map(p => ({where: `/blog/${p.slug}/`, body: p.text}))];
for (const {where, body} of corpus)
  for (const [key, names] of Object.entries(NAMES))
    for (const n of names) {
      const re = new RegExp(`(^|[^a-z0-9])${norm(n)}([^a-z0-9]|$)`, 'g');
      const hits = [...norm(body).matchAll(re)];
      if (hits.length) mentions.push({where, entity: key, name: n, count: hits.length,
        excerpt: body.slice(Math.max(0, hits[0].index - 60), hits[0].index + n.length + 60)});
    }

// --- Valori de contact (candidate pentru jetoane, §1.6 a) -------------------
const contact = {};
const allHtml = (await Promise.all(files.map(f => readFile(join(SNAP, 'site', f), 'utf8')))).join('\n') + posts.map(p => p.text).join('\n');
for (const [k, re] of Object.entries({
  // granițe de cifre: altfel ID-ul paginii de Facebook (…107459884182614) „conține” un telefon
  phone: /(?<!\d)(?:(?:\+40|0)7\d{2}[ .]?\d{3}[ .]?\d{3}|021[ .]?\d{3}[ .]?\d{2}[ .]?\d{2})(?!\d)/g,
  email: /[\w.-]+@[\w-]+\.[a-z.]+/gi,
  company: /(?:SC\s+)?Instant\s+Soft\s?Net\s+SRL/gi
})) contact[k] = Object.entries([...allHtml.matchAll(re)].reduce((a, [m]) => (a[m] = (a[m] || 0) + 1, a), {})).map(([value, count]) => ({value, count}));

// --- Linkuri: interne / externe / rupte -------------------------------------
const linkSummary = Object.values(links.reduce((a, l) => {
  const k = l.href; (a[k] ??= {href: k, labels: new Set(), pages: new Set()}); a[k].labels.add(l.label); a[k].pages.add(l.page); return a;
}, {})).map(l => ({href: l.href, labels: [...l.labels].filter(Boolean), pages: [...l.pages].length}));

await write('pages.json', pages);
await write('products.json', products);
await write('reviews.json', reviews);
await write('posts.json', posts.map(({text, ...p}) => p));
await write('mentions.json', mentions);
await write('contact-values.json', contact);
await write('links.json', linkSummary.sort((a, b) => b.pages - a.pages));
await write('issues.json', issues);
console.log({pages: pages.length, products: products.length, reviews: reviews.length, posts: posts.length, mentions: mentions.length, links: linkSummary.length, issues: issues.length});
