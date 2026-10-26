// Fiecare test pornește de la o copie a bazei importate din snapshot-ul real (standard §5: „pe datele lui reale”).
import {execFileSync} from 'node:child_process';
import {mkdtempSync, cpSync, existsSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp, ROOT} from '../src/app.mjs';
import {PERMS} from '../src/registry/entities.mjs';

let base = null, importOutput = null;

export function runImport(dbFile, mediaDir, args = []) {
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts/import.mjs'), ...args], {
    env: {...process.env, NIXODOR_DB: dbFile, NIXODOR_MEDIA: mediaDir}, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
  });
  return JSON.parse(out);
}

export function baseImport() {
  if (base) return {...base, report: importOutput};
  const dir = mkdtempSync(join(tmpdir(), 'nixodor-base-'));
  importOutput = runImport(join(dir, 'brain.db'), join(dir, 'media'));
  base = {dir, db: join(dir, 'brain.db'), media: join(dir, 'media')};
  return {...base, report: importOutput};
}

export function freshApp() {
  const b = baseImport();
  const dir = mkdtempSync(join(tmpdir(), 'nixodor-t-'));
  cpSync(b.db, join(dir, 'brain.db'));
  cpSync(b.media, join(dir, 'media'), {recursive: true});
  const app = createApp({dbFile: join(dir, 'brain.db'), mediaDir: join(dir, 'media'), live: false});
  app.sync.scan();
  app.dir = dir;
  app.cleanup = () => { app.stop(); try { rmSync(dir, {recursive: true, force: true}); } catch {} };
  return app;
}

export const ADMIN = {name: 'Test Admin', role: 'admin', perms: new Set(PERMS.admin)};
export const EDITOR = {name: 'Test Editor', role: 'editor', perms: new Set(PERMS.editor)};

// Paginile refăcute de evenimentele în așteptare (o singură trecere), fără motive.
export const propagate = app => {
  const done = app.sync.process();
  return new Set(done.flatMap(d => [...d.targets.keys()]));
};

export const sorted = set => [...set].sort();
export const byLegacy = (app, key, legacy) => app.db.prepare(`SELECT id FROM ${tableOf(key)} WHERE legacy_ref = ?`).get(legacy).id;
import {BY_KEY} from '../src/registry/entities.mjs';
const tableOf = key => BY_KEY[key].table;
export const indexed = app => app.db.prepare('SELECT path FROM page_index ORDER BY path').all().map(r => r.path);
export {existsSync, readFileSync, join};
