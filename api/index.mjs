// Punctul de intrare pe Vercel: o singură funcție servește site-ul public, /manage și /api/manage.
// Aplicația se creează o dată pe instanță (la prima cerere) și se refolosește cât instanța rămâne caldă.
import {createApp} from '../src/app.mjs';
import {createHandler} from '../src/server.mjs';

let handler = null;

export default function nixodor(req, res) {
  if (!handler) {
    const app = createApp();
    app.start();
    handler = createHandler(app);
  }
  return handler(req, res);
}
