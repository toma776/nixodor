// Crawl nixodor.ro into reference/snapshot/ (static site + WordPress blog via REST API).
// Usage: node scripts/crawl.mjs   — reluabil: fișierele existente nu se descarcă din nou.
import {mkdir, writeFile, readFile, access} from 'node:fs/promises';
import {dirname, join} from 'node:path';

const ROOT = new URL('../reference/snapshot/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const SITE = 'https://www.nixodor.ro/';
const BLOG_API = 'https://nixodor.ro/blog/wp-json/wp/v2/';
const UA = {'user-agent': 'Mozilla/5.0 (Nixodor Brain crawl)'};
const manifest = [];

const exists = p => access(p).then(() => true, () => false);

async function get(url, {timeout = 120000, tries = 3} = {}) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, {headers: UA, signal: AbortSignal.timeout(timeout), redirect: 'follow'});
      return {status: res.status, type: res.headers.get('content-type') || '', body: Buffer.from(await res.arrayBuffer()), url: res.url};
    } catch (e) {
      if (i >= tries) return {status: 0, error: String(e.message || e)};
      await new Promise(r => setTimeout(r, 2000 * i));
    }
  }
}

async function save(rel, url, opts) {
  const file = join(ROOT, rel);
  if (await exists(file)) { manifest.push({url, file: rel, status: 'cached'}); return readFile(file); }
  const r = await get(url, opts);
  manifest.push({url, file: rel, status: r.status, type: r.type, error: r.error, fetched_at: new Date().toISOString()});
  console.log(r.status, url, r.error ?? '');
  if (r.status !== 200) return null;
  await mkdir(dirname(file), {recursive: true});
  await writeFile(file, r.body);
  return r.body;
}

// 1. Site static: pornim de la homepage, urmărim linkurile .html interne și colectăm resursele.
const pages = new Set(['index.html']), assets = new Set(), external = new Set();
for (const page of pages) {
  const html = (await save(join('site', page), SITE + page))?.toString('utf8');
  if (!html) continue;
  for (const [, attr] of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
    const u = new URL(attr, SITE + page);
    if (!/(^|\.)nixodor\.ro$/.test(u.hostname)) { external.add(u.href); continue; }
    const path = u.pathname.replace(/^\//, '');
    if (path === '' ) continue;
    if (/\.html$/.test(path)) pages.add(path);
    else if (/\.(png|jpe?g|gif|svg|webp|pdf|css|js|json|ico)$/i.test(path)) assets.add(path);
  }
}
for (const a of assets) await save(join('site', a), SITE + a);

// imaginile din CSS (fundaluri, logo)
for (const css of [...assets].filter(a => a.endsWith('.css'))) {
  const txt = (await readFile(join(ROOT, 'site', css)).catch(() => ''))?.toString();
  for (const [, ref] of txt.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)) {
    if (ref.startsWith('data:') || /^https?:/.test(ref)) continue;
    const path = new URL(ref, SITE + css).pathname.replace(/^\//, '');
    await save(join('site', path), SITE + path);
  }
}

// 2. Blog: indexul și taxonomiile vin din API. Conținutul nu: orice câmp randat (content, excerpt,
//    feed-ul) blochează serverul, așa că paginile articolelor se iau din Wayback Machine (mod id_ = HTML brut).
// indexul articolelor: doar câmpurile care nu cer randarea conținutului (acelea răspund repede)
await save('blog-api/posts-index.json', `${BLOG_API}posts?per_page=100&_fields=id,slug,link,title,date,modified,categories,tags,featured_media,author`);
const index = JSON.parse(await readFile(join(ROOT, 'blog-api/posts-index.json'), 'utf8'));
for (const t of ['categories', 'tags', 'users']) await save(`blog-api/${t}.json`, `${BLOG_API}${t}?per_page=100`);
const cdx = JSON.parse((await save('blog/wayback-cdx.json',
  'https://web.archive.org/cdx/search/cdx?url=nixodor.ro/blog/*&output=json&fl=timestamp,original&filter=statuscode:200&collapse=urlkey&limit=500')).toString());
const archived = new Map(cdx.slice(1).map(([ts, url]) => [url.replace(/^http:/, 'https:'), ts]));
const uploads = new Set();
for (const p of index) {
  const ts = archived.get(p.link);
  if (!ts) { manifest.push({url: p.link, status: 'unrecoverable', note: 'nu e în Wayback'}); continue; }
  const html = (await save(`blog/posts/${p.slug}.html`, `https://web.archive.org/web/${ts}id_/${p.link}`))?.toString('utf8');
  for (const [, src] of html?.matchAll(/(?:src|content)="(https?:\/\/nixodor\.ro\/blog\/wp-content\/uploads\/[^"?]+)/g) ?? [])
    uploads.add(src.replace(/-\d+x\d+(\.\w+)$/, '$1'));   // originalul, nu variantele redimensionate
}
for (const src of uploads) await save(`blog/media/${new URL(src).pathname.split('/').slice(-3).join('_')}`, src, {timeout: 60000, tries: 2});

await writeFile(join(ROOT, 'manifest.json'), JSON.stringify({crawled_at: new Date().toISOString(), pages: [...pages], external: [...external].sort(), files: manifest}, null, 1));
console.log(`gata: ${pages.size} pagini, ${assets.size} resurse, ${index.length} articole, ${external.size} linkuri externe`);
