// Aer Curat Pets (26.10.2026): descrierea și detaliile de pe pagina produsului de la Portalia (p649),
// cu textul exact; etichetele („Compoziție:”, „Dozare…”) devin titlurile acordeonului de pe pagina gamei.
import {createApp} from '../../src/app.mjs';
import {PERMS} from '../../src/registry/entities.mjs';
import {nowIso} from '../../src/core/db.mjs';

const DESIGN = {name: 'Claude (design)', role: 'admin', perms: new Set(PERMS.admin)};
const URL_P649 = 'https://www.portalia.ro/nixodor-aer-curat-pets-solutie-pentru-mirosurile-neplacute-de-la-animalele-de-companie-1l-p649/';
const app = createApp({live: false});
const {store, db} = app;

const content = {
  description: '<p>Nixodor Aer Curat este un bioactivator natural, pe bază de bacterii, utilizat pentru eliminarea mirosurilor neplăcute provenite de la animalele de companie, precum caini, pisici, iepuri sau hamsteri. Acest produs poate fi folosit pentru igienizarea spațiilor în care acestea stau, precum și pentru a accelera procesul de descompunere a fecalelor și pregătirea resturilor organice pentru a fi adăugate într-un compostor.</p>'
    + '<p><strong>Nu se aplica pe materiale textile!</strong> Produsul are o culoare maro.</p>',
  composition: '<p>Microorganisme (bacterii de acid lactic (Bifidobacterium animalis, Bifidobacterium bifidum, Lactobacillus fermentum, Lactobacillus casei, Lactobacillus plantarum), Rhodopseudomonas palustris și Saccharomyces cerevisiae, extract de mentă, salvie, nalbă, melasă din trestie de zahăr și apă.</p>',
  application: '<p>Este un produs cu dublă acțiune: 1. igienizează spațiile în care stau animalele de companie (cuști, căsuțe, țarcuri, etc.); 2. trateaza fecalele (ajută la accelerarea procesulul de descompunere). Nota: poate fi pulverizat și peste blana animalelor, în cazul în care a intrat în contact cu fecalele și reduce mirosul neplăcut.</p>',
  dosage: '<p><strong>Dozare pentru procesul de igienizare:</strong></p><ul><li>Câini, pisici: 50-100 ml/metru pătrat prin pulverizare, o dată la 7-10 zile (a se lua în calcul și numărul de animale care locuiesc în spațiul respectiv)</li><li>Iepuri, hamsteri: 25-50 ml/metru pătrat prin pulverizare, o dată la 7-10 zile (a se lua în calcul și numărul de animale care locuiesc în spațiul respectiv)</li></ul>'
    + '<p><strong>Dozare pentru accelerarea procesului de degradare a fecalelor:</strong></p><ul><li>Câini, pisici: 1 litru de Nixodor Aer Curat la fiecare 3-4 metri cubi de fecale</li><li>Iepuri, hamsteri: 0,5 litri la fiecare 3-4 metri cubi de fecale</li></ul>'
    + '<p>Este important să se respecte dozajul recomandat pentru fiecare tip de animal și situație, pentru a obține cele mai bune rezultate.</p>',
  storage: '<p>A se păstra în locuri răcoroase și ferite de lumină (+8 - +23 grade Celsius). Valabilitate minimum 18 luni de la data de fabricație.</p>',
  safety: '<p>A nu se lăsa la îndemâna copiilor și a animalelor de companie. Nu ingerați Nixodor Aer Curat, nu turnați în ochi și evitați contactul și mucoasele. La ingerare sau contact nu sunt necesare măsuri speciale.</p>'
};

const pets = db.prepare(`SELECT id FROM product_lines WHERE legacy_ref = 'gama:aer-curat-pets'`).get().id;
store.update(DESIGN, 'game', pets, content, {publish: true});
const p649 = db.prepare(`SELECT id FROM products WHERE legacy_ref = 'portalia:p649'`).get().id;
store.update(DESIGN, 'produse', p649, {ean: '5065000398446'}, {publish: true});

// sursa: pagina produsului de la Portalia (descărcată în reference/snapshot/external/portalia-p649.html)
db.prepare(`INSERT INTO sources (kind, url, title, fetched_at, method, snapshot_file, status, created_at) VALUES ('external', ?, ?, ?, 'crawl', 'external/portalia-p649.html', 200, ?)
  ON CONFLICT(url) DO NOTHING`).run(URL_P649, 'Portalia — Aer Curat Pets 1 L (descrierea produsului)', nowIso(), nowIso());
const sid = db.prepare('SELECT id FROM sources WHERE url = ?').get(URL_P649).id;
const ins = db.prepare(`INSERT INTO provenance (entity, entity_id, field, source_id, method, certainty, created_at) VALUES (?, ?, ?, ?, ?, 'confirmed', ?)
  ON CONFLICT(entity, entity_id, field, source_id) DO NOTHING`);
for (const f of Object.keys(content)) ins.run('game', pets, f, sid, 'copiat din „Descriere produs”', nowIso());
ins.run('produse', p649, 'ean', sid, 'GTIN din datele structurate ale paginii', nowIso());

const done = app.sync.process();
console.log(JSON.stringify({events: done.length, pages: [...new Set(done.flatMap(d => [...d.targets.keys()]))].sort()}));
app.stop();
