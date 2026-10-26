// Eroul de brand (26.10.2026): homepage-ul nu mai prezintă un singur produs. Mesajul NIXODOR în stânga,
// gamele publicate în dreapta (le randează render.mjs din game). Salvat ca ciornă, de aprobat și publicat din panou.
import {createApp} from '../../src/app.mjs';
import {PERMS} from '../../src/registry/entities.mjs';

const DESIGN = {name: 'Claude (design)', role: 'admin', perms: new Set(PERMS.admin)};
const app = createApp({live: false});
const {store, db, sync} = app;
const id = (table, legacy) => db.prepare(`SELECT id FROM ${table} WHERE legacy_ref = ?`).get(legacy)?.id;

const hero = id('sections', 'sectiune:acasa:hero');
const page = k => id('pages', `pagina:${k}`);
store.update(DESIGN, 'sectiuni', hero, {
  line_id: null, image_id: null,
  eyebrow: 'Produse bioenzimatice NIXODOR',
  title: 'Scapă natural de mirosurile neplăcute',
  body: '<p>Bacterii și enzime active care descompun sursa mirosului, nu doar îl acoperă. Pentru fosa septică, litiera pisicii și locul unde stau animalele tale.</p>',
  buttons: [{label: 'De unde cumpăr', to: `ref:pagini:${page('de-unde-cumpar')}`}, {label: 'Despre NIXODOR', to: `ref:pagini:${page('despre')}`}]
});   // ciornă: site-ul rămâne neschimbat până la „Publică”

const done = sync.process();
console.log(JSON.stringify({events: done.length, pages: [...new Set(done.flatMap(d => [...d.targets.keys()]))].length}));
app.stop();
