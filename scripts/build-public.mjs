// Fișierele statice pentru Vercel (public/): imaginile folosite de pagini.
// Paginile, CSS-ul și fonturile le servește funcția direct din cod, deci sunt mereu la zi.
//   npm run build:public    (apoi commit + push; imaginile urcate din panou stau în Blob, nu aici)
import {mkdirSync, rmSync, copyFileSync, existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {createApp, ROOT} from '../src/app.mjs';
import {render} from '../src/site/render.mjs';

const OUT = join(ROOT, 'public');
const app = createApp({live: false});
const {store, sync, db} = app;

rmSync(OUT, {recursive: true, force: true});

// imaginile folosite: din paginile publice, plus fișierele spre care trimit redirecționările (eticheta PDF)
const used = new Set();
for (const path of sync.publicPaths()) for (const [, id] of render(store, path).html.matchAll(/\/media\/(\d+)\//g)) used.add(+id);
for (const r of db.prepare(`SELECT to_ref FROM redirects WHERE to_ref LIKE 'ref:media:%'`).all()) used.add(+r.to_ref.split(':')[2]);
for (const r of db.prepare(`SELECT id FROM media WHERE legacy_ref LIKE 'url:/blog/wp-content/uploads/%'`).all()) used.add(r.id);

let copied = 0;
for (const id of used) {
  const m = store.read('media', id);
  if (!m || !existsSync(join(app.mediaDir, m.file))) { console.warn(`lipsește fișierul pentru media ${id}`); continue; }
  const dest = join(OUT, 'media', String(id), m.name);
  mkdirSync(dirname(dest), {recursive: true});
  copyFileSync(join(app.mediaDir, m.file), dest);
  copied++;
}
console.log(JSON.stringify({media: copied}));
app.stop();
