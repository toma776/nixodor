// Iconițe unitare (line style) pentru beneficii, în locul insignelor-imagine (26.10.2026).
import {createApp} from '../../src/app.mjs';
import {PERMS} from '../../src/registry/entities.mjs';

const DESIGN = {name: 'Claude (design)', role: 'admin', perms: new Set(PERMS.admin)};
const app = createApp({live: false});
const icons = {natural: 'natural', namol: 'namol', durata: 'durata', descompune: 'descompune', curatat: 'curatenie', miros: 'miros', ingrasamant: 'ingrasamant'};
for (const [k, icon] of Object.entries(icons)) {
  const id = app.db.prepare('SELECT id FROM benefits WHERE legacy_ref = ?').get(`beneficiu:${k}`).id;
  app.store.update(DESIGN, 'beneficii', id, {icon}, {publish: true});
}
const done = app.sync.process();
console.log(JSON.stringify({events: done.length, pages: [...new Set(done.flatMap(d => [...d.targets.keys()]))].sort()}));
app.stop();
