// fetch() sincron, pentru puținele locuri din nucleu care vorbesc cu un serviciu HTTP (urcarea în Supabase Storage).
// Același mecanism ca la Postgres: cererea rulează într-un worker, firul principal așteaptă cu Atomics.
import {Worker, MessageChannel, receiveMessageOnPort} from 'node:worker_threads';

const WORKER = `
const {workerData} = require('node:worker_threads');
const {sab, port} = workerData;
const flag = new Int32Array(sab);
port.on('message', async ({url, method, headers, body}) => {
  let out;
  try {
    const r = await fetch(url, {method, headers, body});
    out = {status: r.status, body: new Uint8Array(await r.arrayBuffer())};
  } catch (e) { out = {error: e.message}; }
  port.postMessage(out);
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0);
});`;

let bridge = null;
function open() {
  const flag = new Int32Array(new SharedArrayBuffer(4));
  const {port1, port2} = new MessageChannel();
  const worker = new Worker(WORKER, {eval: true, workerData: {sab: flag.buffer, port: port2}, transferList: [port2]});
  worker.unref();
  return {flag, port: port1};
}

export function fetchSync(url, {method = 'GET', headers = {}, body, timeout = 60000} = {}) {
  bridge ??= open();
  Atomics.store(bridge.flag, 0, 0);
  bridge.port.postMessage({url, method, headers, body});
  if (Atomics.wait(bridge.flag, 0, 0, timeout) === 'timed-out') throw new Error(`${method} ${url}: fără răspuns în ${timeout / 1000}s`);
  const m = receiveMessageOnPort(bridge.port)?.message;
  if (!m || m.error) throw new Error(`${method} ${url}: ${m?.error ?? 'răspuns lipsă'}`);
  return {status: m.status, ok: m.status >= 200 && m.status < 300, text: () => Buffer.from(m.body).toString('utf8'), body: Buffer.from(m.body)};
}
