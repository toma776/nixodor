// Baza: SQLite (node:sqlite), modul WAL, o singură instanță care scrie (§3.12).
// Migrarea doar adaugă tabele și coloane, deci rulează sigur la fiecare pornire (§1.1).
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {ENTITIES, relFields, relTable, targetOf, BY_KEY} from '../registry/entities.mjs';

const SYSTEM = `
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('site','endpoint','repo','document','manual','archive','external')),
  url TEXT NOT NULL UNIQUE, title TEXT, fetched_at TEXT, method TEXT, snapshot_file TEXT, status INTEGER, note TEXT,
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS provenance (
  id INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT NOT NULL, entity_id INTEGER NOT NULL, field TEXT NOT NULL DEFAULT '',
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE, excerpt TEXT, method TEXT,
  certainty TEXT NOT NULL DEFAULT 'confirmed' CHECK (certainty IN ('confirmed','inferred','unverified','unrecoverable')),
  confidence REAL, verified_at TEXT, verified_by TEXT, created_at TEXT NOT NULL,
  UNIQUE (entity, entity_id, field, source_id));
CREATE INDEX IF NOT EXISTS provenance_entity ON provenance(entity, entity_id);
CREATE TABLE IF NOT EXISTS link_dismissals (
  relation TEXT NOT NULL, src_id INTEGER NOT NULL, dst_id INTEGER NOT NULL, evidence TEXT,
  at TEXT NOT NULL, by TEXT, PRIMARY KEY (relation, src_id, dst_id));
CREATE TABLE IF NOT EXISTS aliases (
  entity TEXT NOT NULL, entity_id INTEGER NOT NULL, alias TEXT NOT NULL, learned_from TEXT, at TEXT NOT NULL,
  PRIMARY KEY (entity, alias));
CREATE TABLE IF NOT EXISTS page_index (
  path TEXT PRIMARY KEY, owner_entity TEXT, owner_id INTEGER, title TEXT, status INTEGER, rendered_at TEXT,
  hash TEXT, deps INTEGER, error TEXT, stale INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS page_deps (
  path TEXT NOT NULL, entity TEXT NOT NULL, entity_id INTEGER,
  kind TEXT NOT NULL, component TEXT NOT NULL DEFAULT '', scope TEXT NOT NULL DEFAULT '', fields TEXT, reason TEXT);
CREATE INDEX IF NOT EXISTS page_deps_entity ON page_deps(entity, entity_id);
CREATE INDEX IF NOT EXISTS page_deps_path ON page_deps(path);
CREATE TABLE IF NOT EXISTS change_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_name TEXT, action TEXT NOT NULL, entity TEXT, entity_id INTEGER,
  label TEXT, payload TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed')),
  attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, processed_at TEXT, next_try_at TEXT, affected INTEGER);
CREATE INDEX IF NOT EXISTS change_events_status ON change_events(status, id);
CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY, event_id INTEGER REFERENCES change_events(id) ON DELETE CASCADE, at TEXT NOT NULL,
  path TEXT, action TEXT NOT NULL, detail TEXT);
CREATE INDEX IF NOT EXISTS sync_log_event ON sync_log(event_id);
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY, at TEXT NOT NULL, user_id INTEGER, user_name TEXT,
  action TEXT NOT NULL, entity TEXT, entity_id INTEGER, label TEXT, changes TEXT, snapshot TEXT, reverted_by INTEGER);
CREATE INDEX IF NOT EXISTS audit_entity ON audit_log(entity, entity_id);
CREATE TABLE IF NOT EXISTS validations (entity TEXT NOT NULL, entity_id INTEGER NOT NULL, fp TEXT NOT NULL, user_name TEXT,
  at TEXT NOT NULL, comment TEXT, PRIMARY KEY (entity, entity_id));
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','editor','viewer')), password TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT NOT NULL, at TEXT NOT NULL);
`;

const SQL_TYPE = {int: 'INTEGER', boolean: 'INTEGER', number: 'REAL', money: 'REAL', ref: 'INTEGER', image: 'INTEGER'};
export const JSON_TYPES = new Set(['list', 'links', 'texts', 'table', 'multiselect', 'faq']);
export const nowIso = () => new Date().toISOString();

export function columnsOf(e) {
  const cols = [['id', 'INTEGER PRIMARY KEY AUTOINCREMENT']];
  if (!e.noStatus) cols.push(['status', `TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived'))`], ['draft', 'TEXT'], ['published_at', 'TEXT']);
  for (const f of e.fields) {
    if (f.type === 'refs') continue;
    let def = SQL_TYPE[f.type] ?? 'TEXT';
    if (f.type === 'ref' || f.type === 'image') {
      const t = BY_KEY[targetOf(f)].table;
      def += ` REFERENCES ${t}(id) ON DELETE ${f.required ? 'RESTRICT' : 'SET NULL'}`;
    }
    cols.push([f.key, def]);
  }
  cols.push(['legacy_ref', 'TEXT'], ['search', 'TEXT'], ['version', 'INTEGER NOT NULL DEFAULT 1'],
    ['created_at', 'TEXT'], ['updated_at', 'TEXT'], ['created_by', 'TEXT'], ['updated_by', 'TEXT']);
  return cols;
}

function migrate(db) {
  db.exec(SYSTEM);
  // Tabelele entităților, în ordinea dependențelor (ținta unei chei străine înaintea sursei).
  const done = new Set(), order = [];
  const visit = e => {
    if (done.has(e.key)) return; done.add(e.key);
    for (const f of e.fields) if ((f.type === 'ref' || f.type === 'image') && targetOf(f) !== e.key) visit(BY_KEY[targetOf(f)]);
    order.push(e);
  };
  ENTITIES.forEach(visit);
  for (const e of order) {
    const cols = columnsOf(e);
    db.exec(`CREATE TABLE IF NOT EXISTS ${e.table} (${cols.map(([n, d]) => `"${n}" ${d}`).join(', ')})`);
    const have = new Set(db.prepare(`PRAGMA table_info(${e.table})`).all().map(c => c.name));
    for (const [n, d] of cols) if (!have.has(n)) db.exec(`ALTER TABLE ${e.table} ADD COLUMN "${n}" ${d.replace(/ NOT NULL DEFAULT '[^']*'| PRIMARY KEY AUTOINCREMENT/g, '')}`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${e.table}_legacy ON ${e.table}(legacy_ref) WHERE legacy_ref IS NOT NULL`);
    for (const f of e.fields) {
      if (f.unique || f.type === 'slug') db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${e.table}_${f.key}_u ON ${e.table}("${f.key}") WHERE "${f.key}" IS NOT NULL`);
      if (f.type === 'ref' || f.type === 'image') db.exec(`CREATE INDEX IF NOT EXISTS ${e.table}_${f.key}_i ON ${e.table}("${f.key}")`);
    }
    for (const f of relFields(e)) {
      const t = relTable(e, f), dst = BY_KEY[f.target].table;
      db.exec(`CREATE TABLE IF NOT EXISTS ${t} (
        src_id INTEGER NOT NULL REFERENCES ${e.table}(id) ON DELETE CASCADE,
        dst_id INTEGER NOT NULL REFERENCES ${dst}(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','inferred','unverified')),
        confidence REAL, source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL, note TEXT, attrs TEXT,
        created_at TEXT, created_by TEXT, PRIMARY KEY (src_id, dst_id))`);
      db.exec(`CREATE INDEX IF NOT EXISTS ${t}_dst ON ${t}(dst_id)`);
      if (f.target === e.key) db.exec(`CREATE TRIGGER IF NOT EXISTS ${t}_noself BEFORE INSERT ON ${t} WHEN NEW.src_id = NEW.dst_id
        BEGIN SELECT RAISE(ABORT, 'o înregistrare nu se poate lega de ea însăși'); END`);
    }
  }
}

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), {recursive: true});
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  db._after = [];
  db._depth = 0;
  return db;
}

// O modificare = o tranzacție (§0.6). Tranzacțiile imbricate se unesc în cea exterioară;
// ascultătorii (afterCommit) rulează doar după COMMIT-ul exterior și nu rulează deloc la ROLLBACK.
export function tx(db, fn) {
  if (db._depth > 0) { db._depth++; try { return fn(); } finally { db._depth--; } }
  db.exec('BEGIN IMMEDIATE');
  db._depth = 1;
  try {
    const out = fn();
    db.exec('COMMIT');
    db._depth = 0;
    const after = db._after.splice(0);
    for (const cb of after) try { cb(); } catch (e) { console.error('afterCommit', e); }
    return out;
  } catch (e) {
    db._depth = 0;
    db._after.length = 0;
    try { db.exec('ROLLBACK'); } catch {}
    throw e;
  }
}

export function afterCommit(db, cb) {
  if (db._depth > 0) db._after.push(cb); else cb();
}

export const meta = {
  get: (db, k) => db.prepare('SELECT value FROM meta WHERE key = ?').get(k)?.value ?? null,
  set: (db, k, v) => db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v)
};
