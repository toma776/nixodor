// Fișierele media: același conținut nu se încarcă de două ori (amprenta SHA-1, §3.9). Înlocuirea păstrează ID-ul.
import {createHash} from 'node:crypto';
import {writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {join, extname} from 'node:path';
import {tx} from './db.mjs';
import {fetchSync} from './sync-fetch.mjs';

const MIME = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf'};
export const mimeOf = name => MIME[extname(name).toLowerCase()] ?? 'application/octet-stream';

export function dimensions(buf, mime) {
  try {
    if (mime === 'image/png') return {width: buf.readUInt32BE(16), height: buf.readUInt32BE(20)};
    if (mime === 'image/gif') return {width: buf.readUInt16LE(6), height: buf.readUInt16LE(8)};
    if (mime === 'image/jpeg') {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xFF) { i++; continue; }
        const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
        if (m >= 0xC0 && m <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(m)) return {width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5)};
        i += 2 + len;
      }
    }
  } catch {}
  return {width: null, height: null};
}

// Unde stau fișierele: local (un folder) sau Supabase Storage (bucket public, servit direct de CDN-ul lor).
// Numele fișierului e amprenta conținutului, deci scrierea lui înainte de COMMIT nu poate suprascrie nimic:
// dacă tranzacția eșuează, rămâne doar un fișier nefolosit.
export function createMedia(store, dir, {storage} = {}) {
  if (!storage) mkdirSync(dir, {recursive: true});
  const describe = (buf, name) => {
    const sha1 = createHash('sha1').update(buf).digest('hex'), mime = mimeOf(name);
    return {sha1, mime, size: buf.length, file: sha1 + (extname(name).toLowerCase() || ''), ...dimensions(buf, mime)};
  };

  function put(file, buf, mime) {
    if (!storage) {
      const p = join(dir, file);
      if (!existsSync(p)) writeFileSync(p, buf);
      return;
    }
    const r = fetchSync(`${storage.url}/storage/v1/object/${storage.bucket}/${file}`, {method: 'POST', body: buf,
      headers: {authorization: `Bearer ${storage.key}`, apikey: storage.key, 'content-type': mime, 'cache-control': 'max-age=31536000', 'x-upsert': 'true'}});
    if (!r.ok) throw Object.assign(new Error(`Supabase Storage: ${r.status} ${r.text().slice(0, 200)}`), {status: 502});
  }

  const publicUrl = rec => storage ? `${storage.url}/storage/v1/object/public/${storage.bucket}/${rec.file}` : null;

  function add(user, buf, {name, alt, legacy_ref} = {}) {
    const d = describe(buf, name);
    const existing = store.list('media', {where: {sha1: d.sha1}})[0];
    if (existing) return {...existing, _existing: true};
    put(d.file, buf, d.mime);
    return tx(store.db, () => store.create(user, 'media', {name, alt: alt ?? '', ...d}, {legacy_ref}));
  }

  function replace(user, id, buf, {name} = {}) {
    const cur = store.read('media', id);
    if (!cur) throw Object.assign(new Error('fișierul nu există'), {status: 404});
    const d = describe(buf, name ?? cur.name);
    const same = store.list('media', {where: {sha1: d.sha1}})[0];
    if (same && same.id !== id) throw Object.assign(new Error(`Același conținut există deja în bibliotecă: ${same.name} (media ${same.id}).`), {status: 409});
    put(d.file, buf, d.mime);
    return tx(store.db, () => store.update(user, 'media', id, {name: name ?? cur.name, ...d}, {live: true, system: true}));
  }

  return {add, replace, put, publicUrl, path: rec => join(dir, rec.file), remote: !!storage};
}
