// Bioactivator (26.10.2026): publicarea detaliilor transcrise de pe eticheta PDF (compoziție, dozare,
// aplicare, păstrare, siguranță), care așteptau aprobarea în ciorna gamei. Aprobat de toma776 în sesiunea de lucru.
import {createApp} from '../../src/app.mjs';
import {PERMS} from '../../src/registry/entities.mjs';
import {nowIso} from '../../src/core/db.mjs';

const APPROVER = {name: 'toma776 (aprobare)', role: 'admin', perms: new Set(PERMS.admin)};
const app = createApp({live: false});
const {store, db} = app;
const bio = db.prepare(`SELECT id, draft FROM product_lines WHERE legacy_ref = 'gama:bioactivator'`).get();
const draft = bio.draft ? JSON.parse(bio.draft) : null;

if (draft) {
  store.publish(APPROVER, 'game', bio.id);
  const pdf = db.prepare('SELECT id FROM sources WHERE url = ?').get('https://www.nixodor.ro/continut/bioactivator_nixodor.pdf').id;
  const ins = db.prepare(`INSERT INTO provenance (entity, entity_id, field, source_id, method, certainty, verified_at, verified_by, created_at)
    VALUES ('game', ?, ?, ?, 'transcriere de pe eticheta PDF', 'confirmed', ?, ?, ?)
    ON CONFLICT(entity, entity_id, field, source_id) DO UPDATE SET certainty = 'confirmed', verified_at = excluded.verified_at, verified_by = excluded.verified_by`);
  for (const field of Object.keys(draft).filter(k => k !== 'links')) ins.run(bio.id, field, pdf, nowIso(), 'toma776', nowIso());
}

const done = app.sync.process();
console.log(JSON.stringify({published: draft ? Object.keys(draft) : [], events: done.length, pages: [...new Set(done.flatMap(d => [...d.targets.keys()]))].sort()}));
app.stop();
