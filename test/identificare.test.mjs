// Testele de identificare, guvernanță și hartă din standard §5 (15–23).
import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {freshApp, baseImport, runImport, ADMIN, EDITOR, propagate, byLegacy} from './helpers.mjs';
import {createApp, ROOT} from '../src/app.mjs';
import {whereUsed} from '../src/core/whereused.mjs';
import {inferredGroups} from '../src/manage/api.mjs';
import {createGraph} from '../src/core/graph.mjs';

const apps = [];
const make = () => { const a = freshApp(); apps.push(a); return a; };
after(() => apps.forEach(a => a.cleanup()));
const denied = fn => assert.throws(fn, e => e.status === 403);

test('15. Editorul nu poate publica un tip cu aprobare, schimba sau confirma o relație sensibilă, arhiva un tip cu aprobare', () => {
  const app = make();
  const s = app.store;
  const pets = byLegacy(app, 'game', 'gama:aer-curat-pets'), deg = byLegacy(app, 'game', 'gama:degresor'), art = byLegacy(app, 'articole', 'wp:143');
  denied(() => s.publish(EDITOR, 'game', deg));
  denied(() => s.update(EDITOR, 'game', pets, {tagline: 'x'}, {publish: true}));
  denied(() => s.create(EDITOR, 'game', {name: 'Gamă nouă'}, {status: 'published'}));
  denied(() => s.setLinks(EDITOR, 'articole', art, 'lines', [{id: pets}]));
  denied(() => s.setInverse(EDITOR, 'game', pets, 'articole', 'lines', [art]));
  s.setLinks(ADMIN, 'articole', art, 'lines', [{id: pets, status: 'inferred'}]);
  denied(() => s.setLinkStatus(EDITOR, 'articole', art, 'lines', pets, 'confirmed'));
  denied(() => s.bulkLinkStatus(EDITOR, 'articole.lines', [[art, pets]], 'confirmed'));
  denied(() => s.setStatus(EDITOR, 'game', pets, 'archived'));
  denied(() => s.setStatus(EDITOR, 'game', pets, 'draft'));
  const prov = app.db.prepare(`SELECT id FROM provenance WHERE entity = 'game' AND certainty != 'confirmed' LIMIT 1`).get().id;
  denied(() => s.confirmProvenance(EDITOR, prov));
  // dar editorul lucrează în ciornă și publică tipurile fără aprobare
  assert.equal(s.update(EDITOR, 'game', pets, {tagline: 'propunere'})._draft, true);
  const a = s.update(EDITOR, 'articole', art, {excerpt: 'rezumat nou'}, {publish: true});
  assert.equal(a.excerpt, 'rezumat nou');
});

test('16. Importul refuză să ruleze peste editări manuale fără --overwrite-edits', () => {
  const b = baseImport();
  const dir = mkdtempSync(join(tmpdir(), 'nixodor-imp-'));
  cpSync(b.db, join(dir, 'brain.db')); cpSync(b.media, join(dir, 'media'), {recursive: true});
  const app = createApp({dbFile: join(dir, 'brain.db'), mediaDir: join(dir, 'media'), live: false});
  const id = byLegacy(app, 'magazine', 'magazin:emag');
  app.store.update(ADMIN, 'magazine', id, {address: 'Editat de om'}, {publish: true});
  app.stop();
  const r = runImport(join(dir, 'brain.db'), join(dir, 'media'));
  assert.ok(r.skipped.some(s => s.includes('magazin:emag')));
  const check = createApp({dbFile: join(dir, 'brain.db'), mediaDir: join(dir, 'media'), live: false});
  assert.equal(check.store.read('magazine', id).address, 'Editat de om');
  check.stop();
  const r2 = runImport(join(dir, 'brain.db'), join(dir, 'media'), ['--overwrite-edits']);
  assert.equal(r2.skipped.length, 0);
});

test('17. Importul e determinist: rulat de două ori, dă aceleași ID-uri', () => {
  const b = baseImport();
  const dir = mkdtempSync(join(tmpdir(), 'nixodor-det-'));
  cpSync(b.db, join(dir, 'brain.db')); cpSync(b.media, join(dir, 'media'), {recursive: true});
  const snapshot = file => { const a = createApp({dbFile: file, mediaDir: join(dir, 'media'), live: false});
    const ids = a.db.prepare(`SELECT 'game:' || legacy_ref || '=' || id k FROM product_lines UNION ALL SELECT 'art:' || legacy_ref || '=' || id FROM articles
      UNION ALL SELECT 'prod:' || legacy_ref || '=' || id FROM products UNION ALL SELECT 'media:' || sha1 || '=' || id FROM media ORDER BY 1`).all().map(r => r.k); a.stop(); return ids; };
  const before = snapshot(join(dir, 'brain.db'));
  const r = runImport(join(dir, 'brain.db'), join(dir, 'media'));
  assert.deepEqual(r.created, {});
  assert.deepEqual(snapshot(join(dir, 'brain.db')), before);
});

test('18. Verificarea dus-întors: textul fiecărei pagini importate, citit înapoi, dă aceleași blocuri', () => {
  assert.deepEqual(baseImport().report.roundtripFailures, []);
});

test('19. O editare manuală scrie proveniență „manual”', () => {
  const app = make();
  const id = byLegacy(app, 'magazine', 'magazin:portalia');
  app.store.update(ADMIN, 'magazine', id, {address: 'București, Sector 1, str. Test 1'});
  const p = app.store.provenance('magazine', id).find(x => x.field === 'address');
  assert.equal(p.kind, 'manual');
  assert.equal(p.verified_by, 'Test Admin');
  assert.equal(p.certainty, 'confirmed');
});

test('20. O mențiune adăugată într-un text la salvare apare la nivelul 4 din „Unde apare” și în „Legături de verificat”', () => {
  const app = make();
  const art = byLegacy(app, 'articole', 'wp:131'), fel = byLegacy(app, 'game', 'gama:felina');
  const cur = app.store.read('articole', art);
  const r = app.store.update(ADMIN, 'articole', art, {content: cur.content + '<p>Pentru litiera recomandam NIXODOR Felina.</p>'}, {publish: true});
  assert.ok(r._inferred.some(i => i.relation === 'articole.lines' && i.dst === fel));
  const w = whereUsed(app.store, 'game', fel);
  assert.ok(w.detected.some(d => d.key === 'articole' && d.id === art));
  assert.ok(inferredGroups(app.store).some(g => g.relation === 'articole.lines' && g.items.some(i => i.src === art && i.dst === fel)));
  propagate(app);
  assert.ok(!app.sync.get('/felina/').html.includes(cur.title), 'dedusă: nu apare pe site');
  // granițe de cuvânt: „Felina” singur (un cuvânt, sub 8 litere) nu e mențiune
  const r2 = app.store.update(ADMIN, 'articole', byLegacy(app, 'articole', 'wp:139'), {content: '<p>Pisica Felinax si felinaria.</p>'}, {publish: true});
  assert.equal(r2._inferred.length, 0);
});

test('21. Traseul dintre două entități cunoscute are lungimea așteptată', () => {
  const app = make();
  const g = createGraph(app.store);
  const rev = app.db.prepare(`SELECT id FROM reviews WHERE author = 'Patrice'`).get().id;
  const prod = byLegacy(app, 'produse', 'portalia:p270');
  const p = g.path(`recenzii:${rev}`, `produse:${prod}`);   // recenzie → Felina → varianta 10 kg
  assert.equal(p.length, 2);
  assert.equal(g.path(`recenzii:${rev}`, `game:${byLegacy(app, 'game', 'gama:felina')}`).length, 1);
});

test('22. Sănătatea hărții: 0 trimiteri rupte și 0 relații obligatorii goale pe datele importate', () => {
  const app = make();
  const h = createGraph(app.store).health();
  assert.deepEqual(h.broken, []);
  assert.deepEqual(h.emptyRequired, []);
  // excepții documentate: relațiile nefolosite după import (articole.lines — nicio recomandare confirmată; magazine.logo_id — fără logo;
  // firma.logo_light_id — logo-ul pentru fundal închis vine din redesign, nu din site-ul vechi)
  assert.deepEqual(h.unused.sort(), ['articole.lines', 'firma.logo_light_id', 'magazine.logo_id']);
});

test('23. Nicio listă fără scope și fără câmpuri declarate (verificare statică pe ctx.query)', () => {
  const src = readFileSync(join(ROOT, 'src/site/render.mjs'), 'utf8');
  const calls = [...src.matchAll(/ctx\.query\(([^;]*?)\)(?=[\s.;\[)])/g)].map(m => m[1]);
  assert.ok(calls.length >= 8);
  for (const c of calls) assert.ok(/\b(scope|fields):/.test(c), `listă fără scope/câmpuri: ctx.query(${c.slice(0, 80)})`);
});

test('Registru: fiecare iconiță de beneficiu din registru are un desen în setul site-ului', async () => {
  const {BY_KEY} = await import('../src/registry/entities.mjs');
  const {ICONS, BENEFIT_ICONS} = await import('../src/site/icons.mjs');
  const options = BY_KEY.beneficii.fields.find(f => f.key === 'icon').options;
  assert.deepEqual(options, BENEFIT_ICONS);
  for (const o of options) assert.ok(ICONS[o], `lipsește desenul pentru „${o}”`);
});
