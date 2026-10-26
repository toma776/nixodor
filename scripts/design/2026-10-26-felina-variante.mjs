// Pagina Felina (26.10.2026): doar produsele care apăreau pe site-ul vechi (cutiile de 5 și 10 kg).
// Variantele nu au carduri (diferă doar prin cantitate), deci nici textele cardurilor vechi.
// Sacii din catalogul Portalia rămân în Brain ca ciorne (nu apar pe site, nu se șterg).
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createApp, ROOT} from '../../src/app.mjs';
import {PERMS} from '../../src/registry/entities.mjs';

const DESIGN = {name: 'Claude (design)', role: 'admin', perms: new Set(PERMS.admin)};
const app = createApp({live: false});
const {store, db} = app;
const prod = legacy => db.prepare('SELECT id FROM products WHERE legacy_ref = ?').get(legacy).id;

// Textele exacte din cardurile paginii vechi (fără „lorem ipsum”-ul ascuns în alb).
const html = readFileSync(join(ROOT, 'reference/snapshot/site/nixodor-felina.html'), 'utf8');
const cards = [...html.matchAll(/class="col w50 felina">[\s\S]*?href="[^"]*-p(\d+)\/"[\s\S]*?<p>([\s\S]*?)<\/p>/g)]
  .map(([, pid, p]) => ({pid, text: p.replace(/<span[^>]*>lorem ipsum[\s\S]*?<\/span>/i, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}));
if (cards.length !== 2) throw new Error(`am găsit ${cards.length} carduri, nu 2`);

// Sacii nu erau pe site-ul vechi: îi retragem (rămân ciorne).
for (const pid of ['p663', 'p664', 'p675']) store.setStatus(DESIGN, 'produse', prod(`portalia:${pid}`), 'draft');

// Textele cardurilor repetă primul paragraf al descrierii („100% natural”, „nu provoacă alergii”), deci nu le mai afișăm.
// Paragraful cutiei de 10 kg intrase la import și în descrierea gamei: îl scoatem de acolo.
const fel = db.prepare(`SELECT id, description FROM product_lines WHERE legacy_ref = 'gama:felina'`).get();
const desc = cards.reduce((d, c) => d.replace(`<p>${c.text}</p>`, ''), fel.description ?? '');
if (desc !== fel.description) store.update(DESIGN, 'game', fel.id, {description: desc}, {live: true});

const done = app.sync.process();
console.log(JSON.stringify({cards: cards.map(c => `p${c.pid}: ${c.text.slice(0, 50)}…`), events: done.length,
  pages: [...new Set(done.flatMap(d => [...d.targets.keys()]))].sort()}));
app.stop();
