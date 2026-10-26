// Postgres cu aceeași interfață sincronă ca node:sqlite (prepare().get/all/run, exec, close),
// ca nucleul Brain-ului să ruleze neschimbat și pe Supabase. Interogarea se face într-un worker;
// firul principal așteaptă răspunsul (o funcție Vercel servește o cerere o dată, deci blocarea e acceptabilă).
import {Worker, MessageChannel, receiveMessageOnPort} from 'node:worker_threads';

// SQL-ul nucleului e scris portabil; aici traducem doar ce diferă: parametrii „?” → „$n”
// și id-ul rândului inserat (RETURNING), în locul lui lastInsertRowid din SQLite.
export function toPg(sql) {
  let n = 0, out = '', q = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (q) { out += c; if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; out += c; continue; }
    out += c === '?' ? `$${++n}` : c;
  }
  return out;
}

export class PgSyncDatabase {
  constructor(url, {timeout = 30000} = {}) {
    this.timeout = timeout;
    this.flag = new Int32Array(new SharedArrayBuffer(4));
    const {port1, port2} = new MessageChannel();
    this.port = port1;
    this.worker = new Worker(new URL('./pg-worker.mjs', import.meta.url), {workerData: {url, sab: this.flag.buffer, port: port2}, transferList: [port2]});
    this.worker.unref();
    this.dialect = 'pg';
  }

  query(sql, params = []) {
    Atomics.store(this.flag, 0, 0);
    this.port.postMessage({sql, params: params.map(v => v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v)});
    if (Atomics.wait(this.flag, 0, 0, this.timeout) === 'timed-out') throw new Error(`Postgres nu a răspuns în ${this.timeout / 1000}s`);
    const m = receiveMessageOnPort(this.port)?.message;
    if (!m) throw new Error('Postgres: răspuns lipsă');
    if (m.error) throw Object.assign(new Error(`${m.error}${m.detail ? ` (${m.detail})` : ''}`), {code: m.code, sql});
    return m.result;
  }

  exec(sql) { this.query(sql); }

  prepare(sql) {
    const text = toPg(sql);
    const isInsert = /^\s*insert\b/i.test(sql) && !/\breturning\b/i.test(sql);
    return {
      get: (...p) => this.query(text, p).rows[0],
      all: (...p) => this.query(text, p).rows,
      run: (...p) => {
        const r = this.query(isInsert ? `${text} RETURNING *` : text, p);
        return {changes: r.rowCount, lastInsertRowid: r.rows[0]?.id ?? null};
      }
    };
  }

  close() { this.worker.terminate(); }
}
