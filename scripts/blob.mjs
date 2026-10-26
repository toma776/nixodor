// Sincronizarea manuală a bazei locale cu Blob-ul online. De obicei nu e nevoie: `npm start` sincronizează singur.
//   npm run blob:upload              urcă baza locală (refuză dacă online s-a schimbat de la ultima sincronizare)
//   npm run blob:upload -- --force   urcă oricum (suprascrie ce s-a editat online)
//   npm run blob:download            aduce baza online în data/brain.db (cea locală se păstrează în data/backup/)
// Cheia (BLOB_READ_WRITE_TOKEN) vine din .env.local, adus cu: npx vercel env pull .env.local
import {ROOT, DATA} from '../src/app.mjs';
import {createBlobSync, loadToken} from '../src/core/blobsync.mjs';

if (!loadToken(ROOT)) throw new Error('Lipsește BLOB_READ_WRITE_TOKEN: rulează întâi „npx vercel env pull .env.local”.');
const blob = createBlobSync({dataDir: DATA});
const [cmd] = process.argv.slice(2);

if (cmd === 'upload') {
  try {
    const r = await blob.push(null, {force: process.argv.includes('--force')});
    console.log(`Urcat: brain.db (${Math.round(r.size / 1024)} KB).`);
  } catch (e) {
    if (!e.conflict) throw e;
    console.error('Baza online s-a schimbat de la ultima sincronizare (cineva a editat în panoul online). Rulează „npm run blob:download” sau, ca să o suprascrii, „npm run blob:upload -- --force”.');
    process.exitCode = 1;
  }
} else if (cmd === 'download') {
  await blob.pull();
  console.log('Adus: baza online e acum în data/brain.db (cea veche e în data/backup/).');
} else {
  console.log('Folosire: npm run blob:upload [-- --force]  ·  npm run blob:download');
}
