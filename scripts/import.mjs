// Importul din snapshot-ul site-ului vechi (standard §1.3, etapa 3), urmat de scanare (etapa 4).
//   node scripts/import.mjs                    import + scan
//   node scripts/import.mjs --overwrite-edits  suprascrie și înregistrările modificate de oameni
// Reluabil și determinist: fiecare înregistrare are o cheie din sistemul vechi (legacy_ref), deci un import
// repetat actualizează aceleași ID-uri. O înregistrare modificată în /manage nu se atinge fără --overwrite-edits.
import {readFileSync, existsSync} from 'node:fs';
import {join, basename} from 'node:path';
import {createApp, ROOT} from '../src/app.mjs';
import {PERMS} from '../src/registry/entities.mjs';
import {sanitizeContent, stripTags} from '../src/core/content.mjs';
import {tx, nowIso} from '../src/core/db.mjs';

const SNAP = join(ROOT, 'reference/snapshot'), ANALYSIS = join(ROOT, 'reference/analysis');
const OVERWRITE = process.argv.includes('--overwrite-edits');
const IMPORT = {name: 'Import', role: 'admin', perms: new Set(PERMS.admin), import: true};
const report = {created: {}, updated: {}, skipped: [], roundtrip: [], warnings: []};

const app = createApp({live: false, ...(process.env.NIXODOR_DB ? {dbFile: process.env.NIXODOR_DB, mediaDir: process.env.NIXODOR_MEDIA} : {})});
const {store, media, sync, db} = app;
const q = sql => db.prepare(sql);
const read = p => readFileSync(join(SNAP, p), 'utf8');
const json = p => JSON.parse(readFileSync(join(p.startsWith('analysis') ? ANALYSIS : SNAP, p.replace(/^analysis\//, '')), 'utf8'));
const manifest = existsSync(join(SNAP, 'manifest.json')) ? json('manifest.json') : {files: []};
const fetchedAt = url => manifest.files.find(f => f.url === url)?.fetched_at ?? manifest.crawled_at ?? nowIso();

// --- surse și proveniență (§1.4) ------------------------------------------------------
function source(url, kind, {file, title, method} = {}) {
  q(`INSERT INTO sources (kind, url, title, fetched_at, method, snapshot_file, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 200, ?)
     ON CONFLICT(url) DO UPDATE SET title = excluded.title, snapshot_file = excluded.snapshot_file, method = excluded.method`)
    .run(kind, url, title ?? null, fetchedAt(url), method ?? 'crawl', file ?? null, nowIso());
  return q('SELECT id FROM sources WHERE url = ?').get(url).id;
}
const S = {
  home: source('https://www.nixodor.ro/', 'site', {file: 'site/index.html', title: 'Homepage (Bioactivator)'}),
  despre: source('https://www.nixodor.ro/despre-nixodor.html', 'site', {file: 'site/despre-nixodor.html', title: 'Despre NIXODOR'}),
  felina: source('https://www.nixodor.ro/nixodor-felina.html', 'site', {file: 'site/nixodor-felina.html', title: 'NIXODOR Felina'}),
  cumpar: source('https://www.nixodor.ro/de-unde-cumpar.html', 'site', {file: 'site/de-unde-cumpar.html', title: 'De unde cumpăr'}),
  contact: source('https://www.nixodor.ro/contact.html', 'site', {file: 'site/contact.html', title: 'Contact'}),
  termeni: source('https://www.nixodor.ro/termeni-si-conditii.html', 'site', {file: 'site/termeni-si-conditii.html', title: 'Termeni și condiții'}),
  pdf: source('https://www.nixodor.ro/continut/bioactivator_nixodor.pdf', 'document', {file: 'site/continut/bioactivator_nixodor.pdf', title: 'Eticheta Bioactivator 1 L', method: 'transcriere din imagine'}),
  portalia: source('https://www.portalia.ro/brand/nixodor/', 'external', {file: 'external/portalia-brand-nixodor.html', title: 'Catalogul Nixodor pe Portalia'}),
  wpApi: source('https://nixodor.ro/blog/wp-json/wp/v2/', 'endpoint', {file: 'blog-api/', title: 'WordPress REST API (index, taxonomii, autori)'}),
  decision: source('docs/entitati.md#6', 'document', {file: '../../docs/entitati.md', title: 'Presupuneri de lucru (de confirmat)', method: 'decizie'})
};

function prov(key, id, fields, sourceId, {certainty = 'confirmed', method = 'import', excerpt = null, confidence = null} = {}) {
  const ins = q(`INSERT INTO provenance (entity, entity_id, field, source_id, excerpt, method, certainty, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(entity, entity_id, field, source_id) DO UPDATE SET excerpt = excluded.excerpt, method = excluded.method, certainty = CASE WHEN provenance.verified_at IS NOT NULL THEN provenance.certainty ELSE excluded.certainty END`);
  for (const f of fields) ins.run(key, id, f, sourceId, excerpt ? String(excerpt).slice(0, 400) : null, method, certainty, confidence, nowIso());
}

// --- upsert după cheia veche --------------------------------------------------------
function upsert(key, legacy, data, {status, source: sid, certainty, method, excerpt, draft} = {}) {
  const e = key;
  const found = q(`SELECT id, updated_by FROM ${tableOf(key)} WHERE legacy_ref = ?`).get(legacy);
  let rec;
  if (found) {
    if (found.updated_by && found.updated_by !== IMPORT.name && !OVERWRITE) {
      report.skipped.push(`${key}:${found.id} (${legacy}) — modificat de ${found.updated_by}`);
      return store.read(key, found.id);
    }
    const links = {}, values = {};
    for (const [k, v] of Object.entries(data)) (Array.isArray(v) && isRefs(key, k) ? links : values)[k] = v;
    rec = store.update(IMPORT, key, found.id, {...values, ...links}, {live: true, system: true});
    if (status && rec.status !== status && rec.status !== undefined) rec = store.setStatus(IMPORT, key, found.id, status);
    report.updated[key] = (report.updated[key] ?? 0) + 1;
  } else {
    rec = store.create(IMPORT, key, data, {status, legacy_ref: legacy});
    report.created[key] = (report.created[key] ?? 0) + 1;
  }
  if (draft) store.update(IMPORT, key, rec.id, draft);       // pe o înregistrare publicată ajunge în ciornă
  if (sid) prov(key, rec.id, Object.keys(data).filter(k => !isRefs(key, k)), sid, {certainty, method, excerpt});
  return store.read(key, rec.id);
}
import {BY_KEY} from '../src/registry/entities.mjs';
const tableOf = key => BY_KEY[key].table;
const isRefs = (key, f) => BY_KEY[key].fields.find(x => x.key === f)?.type === 'refs';

// --- media -------------------------------------------------------------------------
function addMedia(rel, {alt = '', legacy} = {}) {
  const file = join(SNAP, rel);
  if (!existsSync(file)) { report.warnings.push(`fișier lipsă: ${rel}`); return null; }
  const rec = media.add(IMPORT, readFileSync(file), {name: basename(rel).replace(/^\d{4}_\d{2}_/, ''), alt, legacy_ref: legacy ?? `snapshot:${rel}`});
  if (!rec._existing) prov('media', rec.id, ['name', 'sha1'], rel.startsWith('blog/') ? source(`https://nixodor.ro${legacy?.replace(/^url:/, '') ?? ''}`, 'site', {file: rel}) : S.home, {method: 'descărcare'});
  return rec.id;
}
const siteImg = (name, alt) => addMedia(`site/continut/${name}`, {alt, legacy: `url:/continut/${name}`});

// --- text ---------------------------------------------------------------------------
const between = (html, a, b) => { const i = html.indexOf(a); if (i < 0) return ''; const j = html.indexOf(b, i + a.length); return html.slice(i, j < 0 ? undefined : j); };
// Paragrafele „→ a<br>→ b” devin liste; textul rămâne exact.
const arrowsToList = html => html.replace(/<p>\s*(&#8594;[\s\S]*?)<\/p>/g, (m, inner) =>
  '<ul>' + inner.split(/<br\s*\/?>/).map(s => s.replace(/&#8594;\s*/, '').trim()).filter(Boolean).map(s => `<li>${s}</li>`).join('') + '</ul>');
const clean = html => sanitizeContent(arrowsToList(html.replace(/<div class="heading[^"]*">[\s\S]*?<\/div>/g, '')))
  .replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').replace(/<p>\s+/g, '<p>').replace(/\s+<\/p>/g, '</p>').trim();

// Varianta care păstrează titlurile din blocurile .heading (pagini de text lung, de exemplu Termenii).
const cleanKeep = html => clean(html.replace(/<div class="heading[^"]*">\s*(<h[1-4][\s\S]*?<\/h[1-4]>)\s*<\/div>/g, '$1'));

// Verificarea dus-întors (§1.3): textul convertit, citit înapoi, trebuie să dea același text și aceleași blocuri.
function roundtrip(where, original, imported) {
  const words = h => stripTags(String(h).replace(/&#8594;/g, ' ').replace(/<\/?(li|p|h\d|ul)>/g, ' ')).replace(/[“”"]/g, '"').replace(/\s+/g, ' ').trim();
  const again = sanitizeContent(imported);
  const blocks = h => (String(h).match(/<(p|h[2-4]|li|blockquote|table)\b/g) ?? []).length;
  const ok = words(original) === words(imported) && again === sanitizeContent(again) && blocks(again) === blocks(imported);
  if (!ok) report.roundtrip.push({where, original: words(original).slice(0, 160), imported: words(imported).slice(0, 160)});
  return ok;
}

// =================================================================================
tx(db, () => {
  // Date firmă
  const contact = read('site/contact.html');
  const logo = addMedia('site/img/logo.png', {alt: 'NIXODOR', legacy: 'url:/img/logo.png'});
  const firma = upsert('firma', 'firma', {
    brand: 'NIXODOR', legal_name: 'Instant SoftNet SRL', address: 'Bucuresti, Sector 1', phone: '0760 759 889', email: 'office@portalia.ro',
    tagline: 'NIXODOR - Bioactivatorul care te scapa de mirosul neplacut', logo_id: logo,
    socials: [{label: 'Facebook', to: 'https://www.facebook.com/nixodor-107459884182614/'}, {label: 'Instagram', to: 'https://www.instagram.com/nixodor/'},
      {label: 'YouTube', to: 'https://www.youtube.com/channel/UC2CpUXd6VLPMnTkcDaOT-qw/'}]
  }, {source: S.contact, excerpt: stripTags(between(contact, 'Date de contact', '</ul>'))});
  prov('firma', firma.id, ['email'], S.decision, {certainty: 'unverified', method: 'presupunere 3: office@portalia.ro, nu support@nixodor.net (Termeni)'});
  prov('firma', firma.id, ['phone', 'legal_name'], S.pdf, {method: 'eticheta: Distribuitor Instant SoftNet SRL, tel 0760 759 889'});

  // Producător
  const badge = siteImg('badge_nourivit.png', 'Nourivit Plus');
  const producer = upsert('producatori', 'nourivit', {
    name: 'Nourivit Technologies GmbH', address: 'Wienersdorferstraße 20-24/M33/5, 2514 Traiskirchen', country: 'Austria', technology: 'Nourivit Plus',
    badge_id: badge, aliases: ['Nourivit']
  }, {status: 'published', source: S.pdf, method: 'transcriere din imagine', excerpt: 'Producător: Nourivit Technologies GmbH, Wienersdorferstraße 20-24/M33/5, 2514 Traiskirchen, Austria'});

  // Magazine
  const portalia = upsert('magazine', 'magazin:portalia', {name: 'Portalia', url: 'https://www.portalia.ro/brand/nixodor/', phone: '0760 759 889', address: 'Bucuresti, Sector 1', position: 1,
    logo_id: null}, {status: 'published', source: S.cumpar});
  const emag = upsert('magazine', 'magazin:emag', {name: 'eMAG', url: 'https://www.emag.ro/', phone: '021 200 52 00', pickup_url: 'https://www.emag.ro/info/pickup', position: 2}, {status: 'published', source: S.cumpar});

  // Beneficii: textul era ars în imagini, citit vizual → de confirmat
  const B = {};
  for (const [k, text, icon] of [['natural', '100% natural', 'badge-1.png'], ['curatat', 'Usor de curatat', 'badge-2.png'],
    ['miros', 'Absoarbe mirosurile neplacute', 'badge-3.png'], ['ingrasamant', 'Utilizabil ca ingrasamant', 'badge-4.png']])
    B[k] = upsert('beneficii', `beneficiu:${k}`, {text, icon_id: siteImg(icon, text)}, {status: 'published', source: S.felina, certainty: 'unverified', method: 'text citit din imagine'});
  for (const [k, text] of [['namol', 'Reduce producerea de namol'], ['durata', 'Prelungeste durata de viata a statiei de epurare'], ['descompune', 'Degradeaza si descompune eficient substantele organice']])
    B[k] = upsert('beneficii', `beneficiu:${k}`, {text}, {status: 'published', source: S.pdf, certainty: 'unverified', method: 'transcriere din imagine'});

  // Utilizări (presupunerea 4): pagini publice, dar create ca ciorne, fără text
  const U = {};
  for (const [k, name] of [['fosa', 'Fosa septica'], ['statie', 'Statie de epurare'], ['hazna', 'Hazna'], ['litiera', 'Litiera pentru pisici'],
    ['animale', 'Miros de animale in casa'], ['grasimi', 'Grasimi in conducte si chiuvete'], ['compost', 'Compost'], ['grajd', 'Miros de grajd']])
    U[k] = upsert('utilizari', `utilizare:${k}`, {name}, {status: 'draft', source: S.decision, certainty: 'inferred', method: 'presupunere 4'});

  // Game
  const home = read('site/index.html'), despre = read('site/despre-nixodor.html'), felinaHtml = read('site/nixodor-felina.html');
  const bioDesc = clean(between(despre, '<strong>Nixodor Bioactivator</strong> este', '<div class="heading v2">').replace(/^/, '<p>'));
  const felDespre = clean(between(despre, '<strong>Nixodor Felina nisip pentru pisici</strong>', '<p>\n\t\t\t\t\t\t\t\t\t<strong>Nourivit').replace(/^/, '<p>'));
  const felPage = clean(`<p>${between(felinaHtml, 'Nixodor Felina este un produs', '</p>')}</p>`);
  roundtrip('game:bioactivator (Despre)', between(despre, '<strong>Nixodor Bioactivator</strong> este', '<div class="heading v2">'), bioDesc);

  const lines = {
    bio: upsert('game', 'gama:bioactivator', {
      name: 'Bioactivator fosa septica', short_name: 'Bioactivator', slug: 'bioactivator-fosa-septica', position: 1, accent: 'verde',
      tagline: 'Bioactivatorul care te scapa de mirosul neplacut de fosa septica', card_text: 'Elimină mirosul de fosă septică. Soluție naturală.',
      description: bioDesc, video_id: '0X2T_3UG4iE', producer_id: producer.id, aliases: ['NIXODOR Bioactivator', 'Nixodor Bioactivator', 'bioactivatorul'],
      hero_image_id: siteImg('bioactivator.png', 'NIXODOR Bioactivator pentru fose septice'), card_image_id: siteImg('bioactivator.png', 'NIXODOR Bioactivator pentru fose septice'),
      label_pdf_id: addMedia('site/continut/bioactivator_nixodor.pdf', {alt: 'Eticheta NIXODOR Bioactivator 1 L', legacy: 'url:/continut/bioactivator_nixodor.pdf'}),
      benefits: [B.natural.id, B.namol.id, B.durata.id, B.descompune.id].map(id => ({id})),
      uses: [U.fosa, U.statie, U.hazna].map(u => ({id: u.id, status: 'inferred', note: 'din textul Despre: „fosele septice, instalatiile de epurare si haznale”'}))
    }, {status: 'published', source: S.home, excerpt: 'Bioactivatorul care te scapa de mirosul neplacut de fosa septica',
      // Câmpurile transcrise de pe etichetă intră în ciornă: ajung pe site doar după aprobare (§0.4, §1.9).
      draft: {
        composition: '<p>NIXODOR Bioactivator este un produs de fermentație din microorganisme (culturi de Lactobacillus, Saccharomyces, Bifidobacterii și Rhodopseudomonas), melasă din trestie de zahăr și apă. NIXODOR Bioactivator nu conține organisme modificate genetic.</p>',
        dosage: '<ul><li>Gospodării unifamiliale: 200 ml NIXODOR Bioactivator / săptămână.</li><li>Gospodării multifamiliale: 500 ml NIXODOR Bioactivator / săptămână.</li><li>Doză inițială: în prima săptămână în care se folosește NIXODOR Bioactivator, se folosește o cantitate triplă.</li></ul><p>La o încărcătură crescută a apelor reziduale sau la gospodării mari se recomandă creșterea dozajului astfel încât să se obțină efectul dorit.</p>',
        application: '<p>Turnați NIXODOR Bioactivator direct în stațiile de epurare sau o dată cu apa de la toaletă ori chiuvetă în fosele septice.</p>',
        storage: '<p>A se păstra în locuri răcoroase și ferite de lumină (+8°–+23°C). Valabilitate minim 12 luni de la data fabricației, iar după deschiderea recipientului consumați produsul cât mai repede.</p>',
        safety: '<p>A nu se lăsa la îndemâna copiilor și a animalelor de companie. NIXODOR Bioactivator este un lichid de culoare maro-gălbui și miros dulce-acrișor. Dacă observați modificări ale culorii și al mirosului, nu mai folosiți Nourivit Plus BB. Nourivit Plus are un pH de 3,3 până la 3,6. Dacă nivelul pH-ului depășește 3,8, nu mai utilizați produsul. Nu ingerați NIXODOR Bioactivator, nu turnați în ochi și evitați contactul cu mucoasele. La ingerare sau contact nu sunt necesare măsuri speciale.</p>'
      }}),
    felina: upsert('game', 'gama:felina', {
      name: 'Felina nisip pentru pisici', short_name: 'Felina', slug: 'felina', position: 2, accent: 'portocaliu',
      tagline: 'Nisip natural pentru pisici, absoarbe mirosurile neplacute', card_text: 'Elimină mirosul de litieră. Devine îngrășământ.',
      description: felDespre + felPage, producer_id: producer.id, aliases: ['NIXODOR Felina', 'Nixodor Felina', 'nisip pentru pisici'],
      hero_image_id: siteImg('main-banner-felina.png', 'NIXODOR Felina, nisip natural pentru pisici'), card_image_id: siteImg('felina.png', 'NIXODOR Felina'),
      benefits: [B.natural, B.curatat, B.miros, B.ingrasamant].map(b => ({id: b.id})),
      uses: [{id: U.litiera.id, status: 'inferred', note: 'din numele gamei'}]
    }, {status: 'published', source: S.felina}),
    pets: upsert('game', 'gama:aer-curat-pets', {
      name: 'Aer Curat Pets', short_name: 'Aer Curat Pets', slug: 'aer-curat-pets', position: 3, accent: 'albastru',
      tagline: 'Solutie pentru mirosurile neplacute de la animalele de companie', card_text: 'Fără miros de animale în gospodărie sau apartament.',
      producer_id: producer.id, card_image_id: siteImg('aer-curat.png', 'NIXODOR Aer Curat Pets'), hero_image_id: siteImg('aer-curat.png', 'NIXODOR Aer Curat Pets'),
      aliases: ['Nixodor Aer Curat Pets'], uses: [{id: U.animale.id, status: 'inferred', note: 'din textul cardului'}]
    }, {status: 'published', source: S.home, excerpt: 'cardul „Aer Curat” trimite la Portalia p649: Aer Curat Pets'})
  };
  prov('game', lines.pets.id, ['tagline'], S.portalia, {method: 'din denumirea Portalia'});
  // Presupunerea 2: celelalte game sunt în Brain, dar fără text → ciorne.
  for (const [k, name, slug, pos, use] of [['aer-curat', 'Aer Curat', 'aer-curat', 4, 'animale'], ['aer-curat-industrial', 'Aer Curat industrial', 'aer-curat-industrial', 5, null],
    ['aer-curat-cai', 'Aer Curat cai', 'aer-curat-cai', 6, 'grajd'], ['degresor', 'Degresor bioenzimatic', 'degresor', 7, 'grasimi'], ['accelerator-compost', 'Accelerator de compost', 'accelerator-de-compost', 8, 'compost']])
    lines[k] = upsert('game', `gama:${k}`, {name, short_name: name, slug, position: pos, producer_id: producer.id, accent: 'verde',
      uses: use ? [{id: U[use].id, status: 'inferred', note: 'din denumirea Portalia'}] : []}, {status: 'draft', source: S.portalia});
  for (const l of Object.values(lines)) if (l.id !== lines.bio.id && l.id !== lines.felina.id)
    prov('game', l.id, ['producer_id'], S.home, {certainty: 'inferred', method: 'subsol: „Produse realizate cu ajutorul tehnologiei Nourivit Plus”'});

  // Produse (variante) din catalogul Portalia + cutiile Felina de pe site
  const lineOf = {'bioactivator-fosa-septica': lines.bio, felina: lines.felina, 'aer-curat-pets': lines.pets, 'aer-curat': lines['aer-curat'],
    'aer-curat-industrial': lines['aer-curat-industrial'], 'aer-curat-cai': lines['aer-curat-cai'], degresor: lines.degresor, 'accelerator-compost': lines['accelerator-compost']};
  const catalog = json('analysis/portalia-catalog.json').products.concat([
    {portalia_id: 269, url: 'https://www.portalia.ro/nisip-pentru-pisici-5kg-nixodor-felina-p269/', name: 'Nisip pentru pisici 5kg, cutie de carton, Nixodor Felina', line: 'felina', size: '5 kg', pack: 'cutie carton', image: 'nixodor_felina_5kg.png'},
    {portalia_id: 270, url: 'https://www.portalia.ro/nisip-pentru-pisici-10kg-nixodor-felina-p270/', name: 'Nisip pentru pisici 10kg, cutie de carton, Nixodor Felina', line: 'felina', size: '10 kg', pack: 'cutie carton', image: 'nixodor_felina_10kg.png'}]);
  for (const p of catalog) {
    const line = lineOf[p.line];
    if (!line) { report.warnings.push(`gamă necunoscută pentru ${p.name}`); continue; }
    const [size, unit] = (p.size ?? '').split(' ');
    const isBio1L = p.line === 'bioactivator-fosa-septica' && p.size === '1 L';
    upsert('produse', `portalia:p${p.portalia_id}`, {
      line_id: line.id, name: line.short_name, size: size ? Number(size) : (/5L/.test(p.url) ? 5 : null), unit: unit ?? (/5L/i.test(p.url) ? 'L' : null),
      scent: p.scent === 'lavanda' ? 'Lavandă' : p.scent === 'pin' ? 'Pin' : null, pack: p.pack ?? null, ean: isBio1L ? '9120063040063' : null,
      image_id: p.image ? siteImg(p.image, p.name) : null,
      listings: [{id: portalia.id, attrs: {url: p.url, external_id: `p${p.portalia_id}`}}]
    }, {status: 'published', source: p.image ? S.felina : S.portalia, excerpt: p.name});
  }

  // Linkul „Cumpără” al gamei: produsul de pe site-ul vechi (are imagine), altfel cea mai mică variantă fără parfum.
  const qty = p => { const [n, u] = (p.size ?? '').split(' '); return Number(n || 0) * (u === 'ml' ? 0.001 : 1); };
  for (const [k, line] of Object.entries(lineOf)) {
    const own = catalog.filter(p => p.line === k);
    const pick = own.find(p => p.image) ?? own.filter(p => !p.scent).sort((a, b) => qty(a) - qty(b))[0] ?? own[0];
    if (pick) upsert('game', line.legacy_ref, {listings: [{id: portalia.id, attrs: {url: pick.url}}]});
  }

  // Recenzii (citate: textul exact, sursa neverificată până o confirmă un om)
  const storeBy = {'Portalia.ro': portalia, 'eMAG.ro': emag};
  for (const r of json('analysis/reviews.json')) {
    const line = r.page === '/' ? lines.bio : lines.felina;
    upsert('recenzii', `recenzie:${r.page}:${r.author}`, {author: r.author, text: r.text, date: r.date, line_id: line.id, store_id: storeBy[r.source]?.id ?? null},
      {status: 'published', source: r.page === '/' ? S.home : S.felina, certainty: 'unverified', method: 'copiată în HTML, fără link spre recenzia originală'});
  }

  // Blog: autori, categorii, etichete, articole
  const wpUsers = json('blog-api/users.json'), wpCats = json('blog-api/categories.json'), wpTags = json('blog-api/tags.json');
  const A = {}, C = {}, T = {};
  for (const u of wpUsers) A[u.id] = upsert('autori', `wp:user:${u.id}`, {name: u.name, slug: u.slug}, {status: 'published', source: S.wpApi});
  for (const c of wpCats.filter(c => c.count > 0)) C[c.id] = upsert('categorii-blog', `wp:category:${c.id}`, {name: c.name, slug: c.slug, description: stripTags(c.description) || null}, {status: 'published', source: S.wpApi});
  for (const t of wpTags) T[t.id] = upsert('etichete', `wp:tag:${t.id}`, {name: t.name, slug: t.slug}, {status: 'published', source: S.wpApi});

  const posts = json('blog-api/posts-index.json');
  const bySlug = Object.fromEntries(posts.map(p => [p.slug, p]));
  const articleIds = {};
  const unwayback = u => u.replace(/^https?:\/\/web\.archive\.org\/web\/\d+\w*\//, '');
  // primul pas: toate articolele (ca linkurile între ele să poată deveni data-ref)
  for (const p of posts) articleIds[p.slug] = upsert('articole', `wp:${p.id}`, {title: stripTags(p.title.rendered), slug: p.slug}, {}).id;
  for (const p of posts) {
    const file = `blog/posts/${p.slug}.html`;
    if (!existsSync(join(SNAP, file))) { report.warnings.push(`articol nerecuperabil: ${p.slug}`); continue; }
    const page = read(file);
    const ts = manifest.files.find(f => f.file?.replace(/\\/g, '/') === file)?.url?.match(/\/web\/(\d+)/)?.[1];
    const sid = source(p.link, 'archive', {file, title: stripTags(p.title.rendered), method: `Wayback Machine ${ts ?? ''}`.trim()});
    let body = page.split('<div class="entry-content">')[1]?.split(/<\/div><!-- \.entry-content -->/)[0] ?? '';
    body = body.replace(/(href|src)="([^"]+)"/g, (m, a, u) => `${a}="${unwayback(u)}"`);
    body = body.replace(/<a\b([^>]*?)href="https?:\/\/(?:www\.)?nixodor\.ro\/blog\/([^/"?#]+)\/?"([^>]*)>/g,
      (m, pre, slug, post) => articleIds[slug] ? `<a data-ref="articole:${articleIds[slug]}">` : m);
    const content = sanitizeContent(body);
    roundtrip(`articole:${p.slug}`, body, content);
    const og = page.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    const ogPath = og ? new URL(unwayback(og)).pathname.replace(/-\d+x\d+(\.\w+)$/, '$1') : null;
    const featured = ogPath ? addMedia(`blog/media/${ogPath.split('/').slice(-3).join('_')}`, {alt: stripTags(p.title.rendered), legacy: `url:${ogPath}`}) : null;
    const desc = page.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? null;
    upsert('articole', `wp:${p.id}`, {
      title: stripTags(p.title.rendered), slug: p.slug, content, excerpt: desc ?? stripTags(content).slice(0, 180).replace(/\s\S*$/, '') + '…',
      meta_description: desc, featured_image_id: featured, author_id: A[p.author]?.id ?? null,
      categories: p.categories.filter(c => C[c]).map(c => ({id: C[c].id})), tags: p.tags.filter(t => T[t]).map(t => ({id: T[t].id}))
    }, {status: 'published', source: sid, method: 'Wayback Machine (serverul blogului nu mai randează conținutul)'});
    q('UPDATE articles SET published_at = ?, created_at = ?, updated_at = ? WHERE id = ?').run(new Date(p.date + 'Z').toISOString(), p.date, p.modified, articleIds[p.slug]);
  }

  // Pagini și secțiunile lor
  const section = (legacy, data) => upsert('sectiuni', legacy, data, {status: 'published', source: S.home});
  const page = (legacy, data, sections, sid, status = 'published') =>
    upsert('pagini', legacy, {...data, sections: sections.map(s => ({id: s.id}))}, {status, source: sid});

  const hero = section('sectiune:acasa:hero', {kind: 'hero', title: 'Bioactivatorul care te scapa de mirosul neplacut de fosa septica', line_id: lines.bio.id,
    image_id: siteImg('bg-sat-o.png', 'Casa cu fosa septica la tara'), buttons: [{label: 'Afla mai multe', to: `ref:game:${lines.bio.id}`}]});
  const cards = section('sectiune:acasa:carduri', {kind: 'carduri-game', title: 'Produsele noastre'});
  const vid = section('sectiune:acasa:video', {kind: 'video', title: 'Bioactivatorul care te scapa de mirosul neplacut de fosa septica', line_id: lines.bio.id});
  const rev = section('sectiune:acasa:recenzii', {kind: 'recenzii', title: 'Ce spun clientii despre Bioactivatorul NIXODOR', line_id: lines.bio.id});
  const cta1 = section('sectiune:acasa:cumpara', {kind: 'cta', title: 'De unde pot cumpara?', buttons: [{label: 'Vreau sa cumpar bioactivatorul nixodor', to: `ref:magazine:${portalia.id}`}]});
  const cta2 = section('sectiune:acasa:articole', {kind: 'cta', title: 'Articole despre bioactivatori si fose septice', buttons: [{label: 'Citeste articolele Nixodor', to: '/blog/'}]});
  const ins = section('sectiune:acasa:producator', {kind: 'insigna-producator', title: 'Produse realizate cu ajutorul tehnologiei Nourivit Plus', producer_id: producer.id});
  const acasa = page('pagina:acasa', {title: 'Acasa', slug: '', meta_title: 'NIXODOR Bioactivator', meta_description: 'NIXODOR - Bioactivatorul care te scapa de mirosul neplacut'}, [hero, cards, vid, rev, cta1, cta2, ins], S.home);

  const cine = section('sectiune:despre:cine', {kind: 'text', title: 'Cine suntem noi?',
    body: clean(between(despre, '<p>\n                  Suntem o comunitate', '<div class="heading v2">\n\t\t\t\t\t\t\t\t\t<h2><span class="green">'))});
  const desp = page('pagina:despre', {title: 'Despre NIXODOR', slug: 'despre', meta_description: 'NIXODOR - Bioactivatorul care te scapa de mirosul neplacut'},
    [cine, section('sectiune:despre:game', {kind: 'carduri-game', title: 'Gamele noastre'}), section('sectiune:despre:producator', {kind: 'insigna-producator',
      title: 'Nourivit Technologies GmbH Austria este dezvoltatorul si producatorul compozitiei bacteriene.', producer_id: producer.id})], S.despre);
  const cumparHtml = read('site/de-unde-cumpar.html');
  const cump = page('pagina:de-unde-cumpar', {title: 'De unde cumpar NIXODOR', slug: 'de-unde-cumpar'},
    [section('sectiune:cumpar:magazine', {kind: 'magazine', title: 'Afla de unde poti cumpara produsele NIXODOR',
      body: `<p>${stripTags(between(cumparHtml, 'Produsele noastre sunt', '</'))}</p>`})], S.cumpar);
  const cont = page('pagina:contact', {title: 'Contact NIXODOR', slug: 'contact'},
    [section('sectiune:contact', {kind: 'contact', title: 'Vorbeste cu noi', body: `<p>${stripTags(between(contact, 'Va multumim pentru interesul', '</li>'))}</p>`})], S.contact);
  const termHtml = read('site/termeni-si-conditii.html');
  const termBody = between(termHtml, '<div class="continut" style="width: 100%">', '<div id="footer"');
  const termClean = '<p>[[de-validat:text copiat dintr-un magazin online; trimite la o politică de cookie-uri care nu există]]</p>' + cleanKeep(termBody);
  roundtrip('pagini:termeni', termBody.split(/Fii la curent/)[0], cleanKeep(termBody));
  const term = page('pagina:termeni', {title: 'Termeni si conditii de utilizare', slug: 'termeni-si-conditii', body: termClean}, [], S.termeni);
  const conf = page('pagina:confidentialitate', {title: 'Politica de confidentialitate', slug: 'politica-de-confidentialitate',
    body: '<p>[[de-validat:pagina lipsește pe site-ul vechi; textul trebuie scris și aprobat]]</p>'}, [], S.decision, 'draft');
  const cook = page('pagina:cookies', {title: 'Politica de cookie-uri', slug: 'politica-cookie',
    body: '<p>[[de-validat:pagina lipsește pe site-ul vechi; textul trebuie scris și aprobat]]</p>'}, [], S.decision, 'draft');

  // Meniuri
  upsert('meniuri', 'meniu:antet', {name: 'Antet', code: 'antet', items: [
    {label: 'Acasa', to: `ref:pagini:${acasa.id}`}, {label: 'Despre', to: `ref:pagini:${desp.id}`},
    {label: 'Produsele noastre', to: null, children: Object.values(lines).sort((a, b) => a.position - b.position).map(l => ({label: '', to: `ref:game:${l.id}`}))},
    {label: 'Blog', to: '/blog/'}, {label: 'Contact', to: `ref:pagini:${cont.id}`}, {label: 'De unde cumpar', to: `ref:pagini:${cump.id}`, button: true}]}, {source: S.home});
  upsert('meniuri', 'meniu:subsol', {name: 'Subsol', code: 'subsol', items: [
    {label: 'De unde cumpar', to: `ref:pagini:${cump.id}`}, {label: 'Termeni si conditii', to: `ref:pagini:${term.id}`},
    {label: 'Politica de confidentialitate', to: `ref:pagini:${conf.id}`}, {label: 'Politica de cookie-uri', to: `ref:pagini:${cook.id}`}]}, {source: S.home});

  // Redirecționări de la adresele vechi (§3.8), spre entități
  const R = [
    ['/index.html', `ref:pagini:${acasa.id}`], ['/despre-nixodor.html', `ref:pagini:${desp.id}`], ['/nixodor-felina.html', `ref:game:${lines.felina.id}`],
    ['/de-unde-cumpar.html', `ref:pagini:${cump.id}`], ['/contact.html', `ref:pagini:${cont.id}`], ['/termeni-si-conditii.html', `ref:pagini:${term.id}`],
    ['/continut/bioactivator_nixodor.pdf', `ref:media:${lines.bio.label_pdf_id}`], ['/blog/page/2/', null, '/blog/'], ['/blog/feed/', null, '/blog/'],
    ...Object.values(C).map(c => [`/blog/category/${c.slug}/`, `ref:categorii-blog:${c.id}`]),
    ['/blog/category/uncategorized/', null, '/blog/'],
    ...Object.values(T).map(t => [`/blog/tag/${t.slug}/`, null, '/blog/']),
    ...wpUsers.map(u => [`/blog/author/${u.slug}/`, null, '/blog/'])
  ];
  for (const [from, ref, to] of R) upsert('redirecturi', `redirect:${from}`, {from_path: from, to_ref: ref ?? null, to_path: to ?? null, code: 301}, {source: S.decision});
});

// Scanarea: randează tot, scrie dependențele; evenimentele importului sunt acoperite (§1.3 pas 4).
const scan = sync.scan();
const counts = Object.fromEntries(['game', 'produse', 'articole', 'recenzii', 'pagini', 'media', 'redirecturi'].map(k => [k, store.count(k)]));
console.log(JSON.stringify({created: report.created, updated: report.updated, counts, scan,
  skipped: report.skipped, roundtripFailures: report.roundtrip, warnings: report.warnings}, null, 1));
app.stop();
