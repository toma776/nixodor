// Firul de lucru care ține conexiunea Postgres. Firul principal îl apelează sincron (vezi pg-sync.mjs):
// trimite interogarea, așteaptă pe un Atomics.wait, apoi citește răspunsul cu receiveMessageOnPort.
import {workerData} from 'node:worker_threads';
import pg from 'pg';

pg.types.setTypeParser(20, v => v === null ? null : Number(v));      // int8 (COUNT, id) → număr
pg.types.setTypeParser(1700, v => v === null ? null : Number(v));    // numeric → număr

const {url, sab, port} = workerData;
const flag = new Int32Array(sab);
const client = new pg.Client({connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : {rejectUnauthorized: false}});
const ready = client.connect().then(() => client.query(`SET TIME ZONE 'UTC'`));

port.on('message', async ({sql, params}) => {
  let out;
  try {
    await ready;
    const r = await client.query(sql, params);
    const last = Array.isArray(r) ? r[r.length - 1] : r;           // mai multe instrucțiuni (exec) → ultimul rezultat
    out = {result: {rows: last?.rows ?? [], rowCount: last?.rowCount ?? 0}};
  } catch (e) {
    out = {error: e.message, code: e.code, detail: e.detail};
  }
  port.postMessage(out);
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0);
});
