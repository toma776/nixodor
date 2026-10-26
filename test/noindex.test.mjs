// Până la lansare, Google nu indexează site-ul de pe Vercel: antetul x-robots-tag „noindex, nofollow” pe toate răspunsurile.
// Lansarea înseamnă să scoți antetul din vercel.json și testul acesta, într-o modificare făcută cu intenție.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('vercel.json: noindex, nofollow pe toate adresele, până la lansare', () => {
  const cfg = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const all = cfg.headers?.find(h => h.source === '/(.*)');
  const tag = all?.headers.find(h => h.key.toLowerCase() === 'x-robots-tag')?.value ?? '';
  assert.match(tag, /noindex/);
  assert.match(tag, /nofollow/);
});
