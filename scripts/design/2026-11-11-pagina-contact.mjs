// Pagina de contact refăcută (11.11.2026): date complete ale firmei + formular de contact.
// Adresa completă vine din subsolul portalia.ro (aceeași firmă, Instant SoftNet SRL): „Intrarea Poiana nr 9”,
// iar codul poștal 014136 (Sectorul 1) din profilul public al firmei. De confirmat cu clientul, împreună cu CUI-ul
// și numărul de la Registrul Comerțului, pe care nu le-am găsit în surse (câmpurile rămân goale și nu apar pe site).
// Formularul e deocamdată doar de prezentare: validează și arată confirmarea, dar nu trimite mesajul nicăieri.
import {createApp} from '../../src/app.mjs';
import {PERMS} from '../../src/registry/entities.mjs';

const DESIGN = {name: 'Claude (design)', role: 'admin', perms: new Set(PERMS.admin)};
const app = createApp({live: false});
const {store, db, sync} = app;
const id = (table, legacy) => db.prepare(`SELECT id FROM ${table} WHERE legacy_ref = ?`).get(legacy)?.id;

store.update(DESIGN, 'firma', 1, {address: 'Intrarea Poiana nr. 9, Sector 1, București 014136'});

const page = id('pages', 'pagina:contact');
store.update(DESIGN, 'pagini', page, {
  title: 'Contact NIXODOR',
  meta_title: 'Contact',
  meta_description: 'Ai o întrebare despre produsele NIXODOR? Scrie-ne prin formular, sună-ne la 0760 759 889 sau trimite un email. Îți răspundem cât mai curând.'
});
const section = db.prepare(`SELECT s.id FROM sections s JOIN rel_pages_sections r ON r.dst_id = s.id WHERE r.src_id = ? AND s.kind = 'contact'`).get(page).id;
store.update(DESIGN, 'sectiuni', section, {
  eyebrow: 'Contact',
  title: 'Vorbește cu noi',
  body: '<p>Ai o întrebare despre un produs, vrei să afli care variantă ți se potrivește sau te interesează o colaborare? Scrie-ne și îți răspundem cât mai curând. Orice sugestie e binevenită.</p>'
});

// pagina e făcută pentru prezentarea la client: se publică direct
store.publish(DESIGN, 'pagini', page);
store.publish(DESIGN, 'sectiuni', section);

const done = sync.process();
console.log(JSON.stringify({events: done.length, pages: [...new Set(done.flatMap(d => [...d.targets.keys()]))].length}));
app.stop();
