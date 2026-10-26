// Sincronizarea bazei locale (data/brain.db) cu Blob-ul privat al proiectului Vercel.
//   npm run blob:upload     urcă baza locală (refuză dacă versiunea online s-a schimbat de la ultima sincronizare)
//   npm run blob:upload -- --force   urcă oricum (suprascrie ce s-a editat online)
//   npm run blob:download   aduce baza online în data/brain.db (cea locală se păstrează în data/backup/)
// Cheia (BLOB_READ_WRITE_TOKEN) vine din .env.local, adus cu: npx vercel env pull .env.local
import {get, put, head, BlobNotFoundError} from '@vercel/blob';
import {readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {ROOT, DATA} from '../src/app.mjs';

const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('Lipsește BLOB_READ_WRITE_TOKEN: rulează întâi „npx vercel env pull .env.local”.');

const DB = join(DATA, 'brain.db'), MARK = join(DATA, '.blob-etag');
const [cmd] = process.argv.slice(2);
const FORCE = process.argv.includes('--force');
const known = existsSync(MARK) ? readFileSync(MARK, 'utf8').trim() : null;
const remote = await head('brain.db').catch(e => { if (e instanceof BlobNotFoundError) return null; throw e; });

if (cmd === 'upload') {
  if (remote && remote.etag !== known && !FORCE)
    throw new Error('Baza online s-a schimbat de la ultima sincronizare (cineva a editat în panoul online). Rulează „npm run blob:download” sau, ca să o suprascrii, „npm run blob:upload -- --force”.');
  // o copie consistentă: WAL golit în fișierul principal
  const db = new DatabaseSync(DB);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
  const r = await put('brain.db', readFileSync(DB), {access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/vnd.sqlite3'});
  writeFileSync(MARK, r.etag);
  console.log(`Urcat: brain.db (${Math.round(readFileSync(DB).length / 1024)} KB).`);
} else if (cmd === 'download') {
  if (!remote) throw new Error('În Blob nu există încă brain.db.');
  const r = await get('brain.db', {access: 'private', useCache: false});
  mkdirSync(join(DATA, 'backup'), {recursive: true});
  if (existsSync(DB)) {
    const db = new DatabaseSync(DB);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');              // copia de siguranță să conțină tot
    db.close();
    copyFileSync(DB, join(DATA, 'backup', `${new Date().toISOString().replace(/[:.]/g, '-')}-brain.db`));
  }
  try { for (const f of ['-wal', '-shm']) rmSync(DB + f, {force: true}); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EBUSY') throw new Error('Baza locală e deschisă de serverul local: oprește-l (npm start) și rulează din nou.'); throw e; }
  writeFileSync(DB, Buffer.from(await new Response(r.stream).arrayBuffer()));
  writeFileSync(MARK, r.blob.etag);
  console.log('Adus: baza online e acum în data/brain.db (cea veche e în data/backup/).');
} else {
  console.log('Folosire: npm run blob:upload [-- --force]  ·  npm run blob:download');
}
