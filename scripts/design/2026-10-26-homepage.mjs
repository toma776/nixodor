// Redesign homepage (26.10.2026): structura și textele scurte ale paginii de acasă, scrise prin store
// (istoric, proveniență „manual”, eveniment de propagare). Reimportul nu le suprascrie (§1.3).
// Textele noi (supratitluri, titluri, fraze scurte) sunt marcate în docs/design-homepage.md, de aprobat.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createApp, ROOT} from '../../src/app.mjs';
import {PERMS} from '../../src/registry/entities.mjs';

const DESIGN = {name: 'Claude (design)', role: 'admin', perms: new Set(PERMS.admin)};
const app = createApp({live: false});
const {store, media, db, sync} = app;
const id = (table, legacy) => db.prepare(`SELECT id FROM ${table} WHERE legacy_ref = ?`).get(legacy)?.id;
const snap = rel => join(ROOT, 'reference/snapshot/site', rel);
const addMedia = (rel, alt) => media.add(DESIGN, readFileSync(snap(rel)), {name: rel.split('/').pop(), alt, legacy_ref: `url:/${rel}`}).id;

const bio = id('product_lines', 'gama:bioactivator'), fel = id('product_lines', 'gama:felina'), pets = id('product_lines', 'gama:aer-curat-pets');
const producer = id('producers', 'nourivit'), portalia = id('stores', 'magazin:portalia');
const pages = Object.fromEntries(['acasa', 'despre', 'de-unde-cumpar', 'contact', 'termeni', 'confidentialitate', 'cookies'].map(k => [k, id('pages', `pagina:${k}`)]));
const sec = k => id('sections', `sectiune:acasa:${k}`);

// 1. Imagini: fotografia de fundal a eroului și logo-urile la rezoluție dublă (din CSS-ul site-ului vechi)
const heroBg = addMedia('continut/main-banner.png', 'Casă tradițională la țară, cu gospodărie');
const logo = addMedia('img/logo-2x.png', 'NIXODOR');
const logoLight = addMedia('img/logo-w-2x.png', 'NIXODOR');
store.update(DESIGN, 'firma', 1, {logo_id: logo, logo_light_id: logoLight, tagline: 'NIXODOR - Bioactivatorul care te scapă de mirosul neplăcut'});

// 2. Diacritice pe textele scurte afișate pe homepage (fără schimbare de sens)
const benefits = {'beneficiu:curatat': 'Ușor de curățat', 'beneficiu:miros': 'Absoarbe mirosurile neplăcute', 'beneficiu:ingrasamant': 'Utilizabil ca îngrășământ',
  'beneficiu:namol': 'Reduce producerea de nămol', 'beneficiu:durata': 'Prelungește durata de viață a stației de epurare', 'beneficiu:descompune': 'Degradează și descompune eficient substanțele organice'};
for (const [legacy, text] of Object.entries(benefits)) store.update(DESIGN, 'beneficii', id('benefits', legacy), {text}, {publish: true});
// gamele au aprobare; scriem direct (live) ca ciorna Bioactivatorului (eticheta, neaprobată) să rămână în așteptare
store.update(DESIGN, 'game', bio, {name: 'Bioactivator fosă septică', tagline: 'Bioactivatorul care te scapă de mirosul neplăcut de fosă septică'}, {live: true});
store.update(DESIGN, 'game', fel, {name: 'Felina, nisip pentru pisici', tagline: 'Nisip natural pentru pisici, absoarbe mirosurile neplăcute'}, {live: true});
store.update(DESIGN, 'game', pets, {tagline: 'Soluție pentru mirosurile neplăcute de la animalele de companie'}, {live: true});

// 3. Secțiunile paginii de acasă, în ordinea drumului vizitatorului
const pub = {publish: true};
store.update(DESIGN, 'sectiuni', sec('hero'), {
  eyebrow: 'Bioactivator natural pentru fose septice',
  title: 'Bioactivatorul care te scapă de mirosul neplăcut de fosă septică',
  body: '<p>Bacterii și enzime naturale care elimină mirosul, reduc nămolul și descompun grăsimile din fosa septică sau din stația de epurare.</p>',
  image_id: heroBg, producer_id: producer,
  buttons: [{label: 'Descoperă Bioactivatorul', to: `ref:game:${bio}`}, {label: 'De unde cumpăr', to: `ref:pagini:${pages['de-unde-cumpar']}`}]
}, pub);
const existingBenefits = db.prepare(`SELECT id FROM sections WHERE legacy_ref = 'sectiune:acasa:beneficii'`).get()?.id;
const benefitsSec = existingBenefits ?? store.create(DESIGN, 'sectiuni', {kind: 'beneficii', eyebrow: 'De ce Bioactivator', title: 'O fosă septică sănătoasă, fără mirosuri', line_id: bio},
  {status: 'published', legacy_ref: 'sectiune:acasa:beneficii'}).id;
store.update(DESIGN, 'sectiuni', benefitsSec, {body: '<p>Folosit regulat, bioactivatorul ajută fosa septică, stația de epurare sau hazna să funcționeze mai bine și mai mult timp.</p>'}, pub);
store.update(DESIGN, 'firma', 1, {address: 'București, Sector 1'});
store.update(DESIGN, 'magazine', portalia, {address: 'București, Sector 1'}, pub);
store.update(DESIGN, 'sectiuni', sec('carduri'), {eyebrow: 'Gama NIXODOR', title: 'Soluții naturale pentru fiecare miros',
  body: '<p>Fiecare produs folosește bacterii active, fără parfumuri care doar acoperă mirosul.</p>'}, pub);
const villageId = db.prepare(`SELECT id FROM media WHERE legacy_ref = 'url:/continut/bg-sat-o.png'`).get().id;
store.update(DESIGN, 'sectiuni', sec('video'), {image_id: villageId, eyebrow: 'Vezi cum funcționează', title: 'Bioactivatorul NIXODOR, pe scurt',
  body: '<p>Un clip scurt despre cum lucrează bacteriile active în fosa septică.</p>'}, pub);
store.update(DESIGN, 'sectiuni', sec('recenzii'), {eyebrow: 'Recenzii', title: 'Ce spun clienții despre Bioactivatorul NIXODOR', limit: 6}, pub);
store.update(DESIGN, 'sectiuni', sec('producator'), {eyebrow: 'Tehnologia din spate', title: 'Produse realizate cu tehnologia Nourivit Plus',
  body: '<p>Nourivit Technologies GmbH, din Austria, este dezvoltatorul și producătorul compoziției bacteriene.</p>'}, pub);
store.update(DESIGN, 'sectiuni', sec('articole'), {kind: 'articole', eyebrow: 'Blog', title: 'Articole și sfaturi', limit: 3,
  buttons: [{label: 'Toate articolele', to: '/blog/'}]}, pub);
store.update(DESIGN, 'sectiuni', sec('cumpara'), {eyebrow: 'De unde cumpăr', title: 'Găsești produsele NIXODOR online',
  body: '<p>Comandă de la Portalia sau vezi toate magazinele care au produsele noastre.</p>',
  buttons: [{label: 'Cumpără de la Portalia', to: `ref:magazine:${portalia}`}, {label: 'Toate magazinele', to: `ref:pagini:${pages['de-unde-cumpar']}`}]}, pub);
store.setLinks(DESIGN, 'pagini', pages.acasa, 'sections',
  ['hero', null, 'carduri', 'video', 'recenzii', 'producator', 'articole', 'cumpara'].map(k => ({id: k ? sec(k) : benefitsSec})));

// 4. Meniurile, cu diacritice
const menu = code => db.prepare('SELECT id, items FROM menus WHERE code = ?').get(code);
const fix = items => items.map(it => ({...it, label: ({'Acasa': 'Acasă', 'De unde cumpar': 'De unde cumpăr', 'Termeni si conditii': 'Termeni și condiții',
  'Politica de confidentialitate': 'Politica de confidențialitate'})[it.label] ?? it.label, ...(it.children ? {children: fix(it.children)} : {})}));
for (const code of ['antet', 'subsol']) { const m = menu(code); store.update(DESIGN, 'meniuri', m.id, {items: fix(JSON.parse(m.items))}); }

const done = sync.process();
console.log(JSON.stringify({events: done.length, pages: [...new Set(done.flatMap(d => [...d.targets.keys()]))].length}));
app.stop();
