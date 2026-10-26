// Sincronizarea bazei locale (data/brain.db) cu Blob-ul privat de pe Vercel, de unde citește site-ul online.
// Ce s-a urcat ultima oară ține minte data/.blob-sync.json: ETag-ul din Blob și ultimul ID din audit_log la acel moment.
//   - local „are modificări nesincronizate” dacă audit_log a crescut de atunci;
//   - online „s-a schimbat” dacă ETag-ul din Blob nu mai e cel știut.
// Urcarea e condiționată (ifMatch): nu suprascrie niciodată o versiune online pe care nu am văzut-o.
import {get, put, head, BlobNotFoundError, BlobPreconditionFailedError} from '@vercel/blob';
import {readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

const DB_BLOB = 'brain.db';

export function loadToken(root) {
  const env = join(root, '.env.local');
  if (!process.env.BLOB_READ_WRITE_TOKEN && existsSync(env)) process.loadEnvFile(env);
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export function createBlobSync({dataDir, dbFile = join(dataDir, 'brain.db'), mediaDir = join(dataDir, 'media')}) {
  const MARK = join(dataDir, '.blob-sync.json'), OLD_MARK = join(dataDir, '.blob-etag');
  const readMark = () => {
    if (existsSync(MARK)) return JSON.parse(readFileSync(MARK, 'utf8'));
    // trecerea de la vechiul marcaj (doar ETag-ul): baza locală e considerată cea urcată atunci
    if (existsSync(OLD_MARK)) { const m = {etag: readFileSync(OLD_MARK, 'utf8').trim(), audit: auditMax(), media: mediaFiles()}; writeMark(m); return m; }
    return {etag: null, audit: 0, media: []};
  };
  const writeMark = m => { writeFileSync(MARK, JSON.stringify(m, null, 1)); rmSync(OLD_MARK, {force: true}); };
  const mediaFiles = () => existsSync(mediaDir) ? readdirSync(mediaDir) : [];
  function auditMax(db) {
    if (db) return db.prepare('SELECT COALESCE(MAX(id), 0) n FROM audit_log').get().n;
    if (!existsSync(dbFile)) return 0;
    const d = new DatabaseSync(dbFile, {readOnly: true});
    try { return d.prepare('SELECT COALESCE(MAX(id), 0) n FROM audit_log').get().n; } finally { d.close(); }
  }
  const remoteEtag = async () => (await head(DB_BLOB).catch(e => { if (e instanceof BlobNotFoundError) return null; throw e; }))?.etag ?? null;

  // starea: dirty = local are modificări neurcate; remoteChanged = online s-a schimbat de la ultima sincronizare
  async function state(db) {
    const mark = readMark(), remote = await remoteEtag();
    return {mark, remote, dirty: auditMax(db) > mark.audit, remoteChanged: !!remote && remote !== mark.etag};
  }

  // urcă baza (și fișierele media noi). db: conexiunea deschisă a serverului, ca WAL-ul să fie golit înainte de citire.
  async function push(db, {force = false} = {}) {
    const mark = readMark();
    if (db) db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    else { const d = new DatabaseSync(dbFile); d.exec('PRAGMA wal_checkpoint(TRUNCATE)'); d.close(); }
    const buf = readFileSync(dbFile), audit = auditMax(db);          // sincron: nicio scriere nu se poate strecura între ele
    const known = new Set(mark.media ?? []);
    for (const f of mediaFiles()) if (!known.has(f)) { await put(`media/${f}`, readFileSync(join(mediaDir, f)), {access: 'private', allowOverwrite: true, addRandomSuffix: false}); known.add(f); }
    const opts = {access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/vnd.sqlite3'};
    if (!force && mark.etag) opts.ifMatch = mark.etag;
    else if (!force && await remoteEtag()) throw Object.assign(new Error('online există deja o bază care nu a fost adusă aici'), {conflict: true});
    try {
      const r = await put(DB_BLOB, buf, opts);
      writeMark({etag: r.etag, audit, media: [...known], at: new Date().toISOString()});
      return {size: buf.length};
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError) throw Object.assign(new Error('baza online s-a schimbat între timp'), {conflict: true});
      throw e;
    }
  }

  // aduce baza online peste cea locală (care se păstrează în data/backup/). Serverul trebuie să fi închis baza.
  async function pull() {
    const r = await get(DB_BLOB, {access: 'private', useCache: false});
    if (!r) throw new Error('În Blob nu există încă brain.db.');
    const buf = Buffer.from(await new Response(r.stream).arrayBuffer());
    mkdirSync(join(dataDir, 'backup'), {recursive: true});
    if (existsSync(dbFile)) {
      const d = new DatabaseSync(dbFile); d.exec('PRAGMA wal_checkpoint(TRUNCATE)'); d.close();
      copyFileSync(dbFile, join(dataDir, 'backup', `${new Date().toISOString().replace(/[:.]/g, '-')}-brain.db`));
    }
    try { for (const f of ['-wal', '-shm']) rmSync(dbFile + f, {force: true}); }
    catch (e) { if (e.code === 'EPERM' || e.code === 'EBUSY') throw new Error('Baza locală e deschisă de alt proces (un server local pornit separat): oprește-l și reîncearcă.'); throw e; }
    writeFileSync(dbFile, buf);
    // fișierele media urcate din panoul online
    const d = new DatabaseSync(dbFile, {readOnly: true});
    const files = d.prepare('SELECT file FROM media').all().map(x => x.file);
    d.close();
    mkdirSync(mediaDir, {recursive: true});
    for (const f of files) if (!existsSync(join(mediaDir, f))) {
      const m = await get(`media/${f}`, {access: 'private'}).catch(() => null);
      if (m?.statusCode === 200) writeFileSync(join(mediaDir, f), Buffer.from(await new Response(m.stream).arrayBuffer()));
    }
    writeMark({etag: r.blob.etag, audit: auditMax(), media: mediaFiles(), at: new Date().toISOString()});
    return {size: buf.length};
  }

  return {state, push, pull, readMark};
}
