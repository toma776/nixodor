// Testele de propagare din standard §5 (1–14). Un test pică și când se refac MAI MULTE pagini decât trebuie.
import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {freshApp, ADMIN, propagate, sorted, byLegacy, indexed} from './helpers.mjs';
import {createSync} from '../src/core/sync.mjs';
import {render} from '../src/site/render.mjs';
import {ROOT} from '../src/app.mjs';

const apps = [];
const make = () => { const a = freshApp(); apps.push(a); return a; };
after(() => apps.forEach(a => a.cleanup()));
const html = (app, path) => app.sync.get(path).html;
const LAYOUT_PAGES = app => indexed(app).filter(p => p !== '/sitemap.xml');

test('1. Telefonul din Date firmă: se refac toate paginile cu antet/subsol, numărul vechi dispare', () => {
  const app = make();
  app.store.update(ADMIN, 'firma', 1, {phone: '0711 222 333'});
  const done = propagate(app);
  assert.deepEqual(sorted(done), LAYOUT_PAGES(app));
  for (const p of LAYOUT_PAGES(app)) {
    const h = html(app, p);
    assert.ok(h.includes('0711 222 333') && h.includes('tel:0711222333'), `${p}: numărul nou`);
    // Excepție documentată: Portalia are propriul telefon (același număr azi), afișat pe „De unde cumpăr”.
    if (p !== '/de-unde-cumpar/') assert.ok(!/0760[ .]?759[ .]?889/.test(h), `${p}: numărul vechi a rămas`);
  }
});

test('2. Schimb o variantă de produs: se reface DOAR pagina gamei ei', () => {
  const app = make();
  const id = byLegacy(app, 'produse', 'portalia:p10');            // Bioactivator 5 L
  app.store.update(ADMIN, 'produse', id, {ean: '5940000000001'}, {publish: true});
  assert.deepEqual(sorted(propagate(app)), ['/bioactivator-fosa-septica/']);
});

test('3. Mut o recenzie de la o gamă la alta: dispare din lista veche, apare în cea nouă', () => {
  const app = make();
  const bio = byLegacy(app, 'game', 'gama:bioactivator'), fel = byLegacy(app, 'game', 'gama:felina');
  const rid = app.db.prepare(`SELECT id FROM reviews WHERE author = 'Toth Istvan'`).get().id;
  app.store.update(ADMIN, 'recenzii', rid, {line_id: fel}, {publish: true});
  assert.deepEqual(sorted(propagate(app)), ['/', '/bioactivator-fosa-septica/', '/felina/']);
  assert.ok(!html(app, '/bioactivator-fosa-septica/').includes('Toth Istvan'));
  assert.ok(!html(app, '/').includes('Toth Istvan'));
  assert.ok(html(app, '/felina/').includes('Toth Istvan'));
  void bio;
});

test('4. Schimb doar descrierea unei game spre care trimit meniuri: paginile care au doar linkul NU se refac', () => {
  const app = make();
  const bio = byLegacy(app, 'game', 'gama:bioactivator');
  app.store.update(ADMIN, 'game', bio, {description: '<p>Text nou de test.</p>'}, {publish: true});
  // pagina proprie + homepage (secțiunile care citesc gama direct); nu blogul, contactul etc.
  assert.deepEqual(sorted(propagate(app)), ['/', '/bioactivator-fosa-septica/']);
});

test('5. Schimb numele scurt al aceleiași game: meniurile și cardurile se refac', () => {
  const app = make();
  const bio = byLegacy(app, 'game', 'gama:bioactivator');
  app.store.update(ADMIN, 'game', bio, {short_name: 'BioNix'}, {publish: true});
  // toate paginile (meniul din antet), mai puțin sitemap-ul, care nu afișează numele
  assert.deepEqual(sorted(propagate(app)), LAYOUT_PAGES(app));
  assert.ok(html(app, '/contact/').includes('>BioNix</a>'), 'meniul arată numele nou');
});

test('6. Schimb adresa unei pagini publicate: 301 fără lanț, linkuri noi, adresa veche își pierde dependențele', () => {
  const app = make();
  const fel = byLegacy(app, 'game', 'gama:felina');
  app.store.update(ADMIN, 'game', fel, {slug: 'nisip-pisici'}, {publish: true});
  app.store.update(ADMIN, 'game', fel, {slug: 'nisip-pisici-natural'}, {publish: true});
  propagate(app);
  const reds = app.db.prepare(`SELECT from_path, to_ref, to_path FROM redirects WHERE to_ref = ?`).all(`ref:game:${fel}`);
  const from = reds.map(r => r.from_path).sort();
  assert.deepEqual(from, ['/felina/', '/nisip-pisici/', '/nixodor-felina.html'].sort());
  assert.ok(reds.every(r => r.to_path == null), 'toate trimit la entitate, deci fără lanț');
  assert.ok(html(app, '/contact/').includes('href="/nisip-pisici-natural/"'));
  assert.equal(app.db.prepare(`SELECT COUNT(*) n FROM page_deps WHERE path = '/felina/'`).get().n, 0);
  assert.equal(app.db.prepare(`SELECT COUNT(*) n FROM page_index WHERE path = '/felina/'`).get().n, 0);
});

test('7. Schimb destinația unei redirecționări: paginile cu linkuri prin ea se refac', () => {
  const app = make();
  const art = '/blog/dieta-corecta-la-caini-si-pisici-suplimente-pentru-digestie-recomandate/';
  const count = (h, href) => h.split(`href="${href}"`).length - 1;
  const before = count(html(app, art), '/bioactivator-fosa-septica/');
  const bio = byLegacy(app, 'game', 'gama:bioactivator'), fel = byLegacy(app, 'game', 'gama:felina');
  const red = app.store.create(ADMIN, 'redirecturi', {from_path: '/nixodor-pentru-caini.html', to_ref: `ref:game:${bio}`, code: 301});
  assert.ok(propagate(app).has(art), 'redirecționarea nouă reface articolul cu linkul rupt');
  assert.equal(count(html(app, art), '/bioactivator-fosa-septica/'), before + 1, 'linkul din text are acum destinație');
  app.store.update(ADMIN, 'redirecturi', red.id, {to_ref: `ref:game:${fel}`});
  const done = propagate(app);
  assert.ok(done.has(art) && done.has('/blog/intelege-nevoile-dietetice-ale-cainelui-tau-pentru-a-l-putea-ajuta-sa-prospere/'));
  assert.ok(!done.has('/contact/'), 'paginile fără link prin redirecționare nu se refac');
  assert.equal(count(html(app, art), '/bioactivator-fosa-septica/'), before);
  assert.ok(html(app, art).includes('href="/felina/"'));
});

test('8. Leg o pagină de o ciornă: nimic pe site; public ciorna: pagina se reface singură (pending)', () => {
  const app = make();
  const conf = byLegacy(app, 'pagini', 'pagina:confidentialitate');
  assert.ok(!html(app, '/contact/').includes('Politica de confidentialitate'));
  app.store.publish(ADMIN, 'pagini', conf);
  const done = propagate(app);
  assert.ok(done.has('/contact/') && done.has('/politica-de-confidentialitate/'));
  assert.ok(html(app, '/contact/').includes('href="/politica-de-confidentialitate/"'));
});

test('9. O legătură dedusă nu apare pe site; confirmată apare; scoasă dispare', () => {
  const app = make();
  const bio = byLegacy(app, 'game', 'gama:bioactivator'), art = byLegacy(app, 'articole', 'wp:143');
  app.store.setLinks(ADMIN, 'articole', art, 'lines', [{id: bio, status: 'inferred', note: 'test'}]);
  propagate(app);
  assert.ok(!html(app, '/bioactivator-fosa-septica/').includes('Dieta corecta la caini'));
  app.store.setLinkStatus(ADMIN, 'articole', art, 'lines', bio, 'confirmed');
  assert.ok(propagate(app).has('/bioactivator-fosa-septica/'));
  assert.ok(html(app, '/bioactivator-fosa-septica/').includes('Dieta corecta la caini'));
  app.store.setLinkStatus(ADMIN, 'articole', art, 'lines', bio, 'dismissed');
  assert.ok(propagate(app).has('/bioactivator-fosa-septica/'));
  assert.ok(!html(app, '/bioactivator-fosa-septica/').includes('Dieta corecta la caini'));
  assert.ok(app.db.prepare(`SELECT 1 FROM link_dismissals WHERE relation = 'articole.lines' AND src_id = ? AND dst_id = ?`).get(art, bio), 'respingerea e ținută minte');
});

test('10. Salvez o ciornă: zero evenimente, niciun cache atins', () => {
  const app = make();
  const bio = byLegacy(app, 'game', 'gama:bioactivator');
  const before = app.db.prepare('SELECT COUNT(*) n FROM change_events').get().n;
  const cached = app.sync.cache.get('/bioactivator-fosa-septica/');
  const r = app.store.update(ADMIN, 'game', bio, {tagline: 'Ciornă de test'});
  assert.equal(r._draft, true);
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM change_events').get().n, before);
  assert.equal(app.sync.cache.get('/bioactivator-fosa-septica/'), cached);
  assert.ok(!html(app, '/bioactivator-fosa-septica/').includes('Ciornă de test'));
  assert.ok(render(app.store, '/bioactivator-fosa-septica/', {preview: true}).html.includes('Ciornă de test'), 'previzualizarea arată ciorna');
});

test('11. Timpul: o schimbare fără editare (anul din {an}) reface paginile singură, inclusiv prin cron', () => {
  // Nixodor nu are încă tipuri cu valabilitate (oferte); verificăm același mecanism pe {an}.
  const app = make();
  app.store.meta.set('year', '2000');
  const done = app.sync.tick();
  assert.ok(done.length >= 1);
  assert.deepEqual(sorted(new Set(done.flatMap(d => [...d.targets.keys()]))), indexed(app));
  assert.ok(html(app, '/').includes(`© ${new Date().getFullYear()}`));
});

test('12. Înlocuiesc o imagine: ?v= nou pe toate paginile care o folosesc, același ID', () => {
  const app = make();
  const bio = app.store.read('game', byLegacy(app, 'game', 'gama:bioactivator'));
  const id = bio.card_image_id;
  const oldV = html(app, '/').match(new RegExp(`/media/${id}/[^"?]+\\?v=(\\d+)`))[1];
  const using = new Set(app.db.prepare(`SELECT DISTINCT path FROM page_deps WHERE entity = 'media' AND entity_id = ?`).all(id).map(r => r.path));
  // alt conținut (felina.png există deja în bibliotecă, deci adăugăm un octet ca să fie un fișier nou)
  app.media.replace(ADMIN, id, Buffer.concat([readFileSync(join(ROOT, 'reference/snapshot/site/continut/felina.png')), Buffer.from([0])]));
  const done = propagate(app);
  assert.deepEqual(sorted(done), sorted(using));
  for (const p of using) {
    const m = html(app, p).match(new RegExp(`/media/${id}/[^"?]+\\?v=(\\d+)`));
    assert.ok(m && m[1] !== oldV, `${p}: ?v= nou`);
  }
  assert.equal(app.store.read('media', id).id, id);
});

test('13. Unesc două beneficii: toate legăturile trimit la cel păstrat, dublura e în Istoric', () => {
  const app = make();
  const keep = byLegacy(app, 'beneficii', 'beneficiu:natural');
  const dup = app.store.create(ADMIN, 'beneficii', {text: '100 % natural'}, {status: 'published'});
  const pets = byLegacy(app, 'game', 'gama:aer-curat-pets');
  app.store.setLinks(ADMIN, 'game', pets, 'benefits', [{id: dup.id}]);
  propagate(app);
  app.store.merge(ADMIN, 'beneficii', keep, [dup.id]);
  propagate(app);
  assert.deepEqual(app.store.links('game', pets, 'benefits').map(l => l.dst_id), [keep]);
  assert.equal(app.store.read('beneficii', dup.id), null);
  assert.ok(app.db.prepare(`SELECT 1 FROM audit_log WHERE action = 'merge' AND entity_id = ?`).get(dup.id));
  assert.ok(html(app, '/aer-curat-pets/').includes('100% natural'));
});

test('14. Randarea unei pagini aruncă o eroare: evenimentul devine failed, se reia, celelalte pagini rămân valabile', () => {
  const app = make();
  let broken = false;
  const flaky = (store, path, o) => { if (broken && path === '/felina/') throw new Error('eroare de test'); return render(store, path, o); };
  const sync = createSync(app.store, {render: flaky});
  for (const p of indexed(app)) sync.get(p);
  broken = true;
  app.store.update(ADMIN, 'firma', 1, {brand: 'NIXODOR TEST'});
  const [r] = sync.process();
  assert.deepEqual(r.failed, ['/felina/']);
  const ev = app.db.prepare('SELECT * FROM change_events WHERE id = ?').get(r.event);
  assert.equal(ev.status, 'failed');
  assert.equal(ev.attempts, 1);
  assert.ok(sync.get('/contact/').html.includes('NIXODOR TEST'), 'paginile reușite sunt valabile');
  broken = false;
  sync.retry(r.event);
  assert.equal(app.db.prepare('SELECT status FROM change_events WHERE id = ?').get(r.event).status, 'done');
  assert.ok(sync.get('/felina/').html.includes('NIXODOR TEST'));
});
