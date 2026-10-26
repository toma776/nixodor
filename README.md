# NIXODOR — site + Brain /manage

Site-ul nixodor.ro, randat pe server dintr-un Brain (SQLite), construit după **standardul Brain /manage v1** (15.10.2026). Node 24, `node:sqlite`, fără dependențe.

```bash
npm run import    # snapshot → data/brain.db (reluabil, determinist) + scanare
npm start         # http://localhost:4310/  ·  Brain: http://localhost:4310/manage/
npm test          # testele obligatorii din §5 (23), pe datele importate
```

Datele brute se refac cu `npm run crawl && npm run analyze` (→ `reference/`). Documentul de entități, cu presupunerile de lucru de confirmat: [docs/entitati.md](docs/entitati.md).

## Unde e fiecare regulă din standard

| Standard | Fișier |
|---|---|
| §1.1 registrul, §2.1 relațiile (`RELATION_TYPES`, inversul calculat) | `src/registry/entities.mjs` |
| §1.2 ID-uri, schema generată din registru, Anexa B | `src/core/db.mjs` |
| §1.3 import (ID-uri deterministe, proveniență pe câmp, dus-întors, refuz peste editări) | `scripts/crawl.mjs`, `scripts/analyze.mjs`, `scripts/import.mjs` |
| §1.4 proveniența, inclusiv `manual` la editare · §1.5 dedus/confirmat · §1.7 unirea · §1.9 drepturi, aprobare, relații sensibile · §3.3 scrierea (tranzacție + istoric + outbox) · §3.6 ciornă, publicare, revenire · §3.8 301 automat | `src/core/store.mjs` |
| §1.6 vocabularul fix, jetoane, mențiuni cu granițe de cuvânt | `src/core/content.mjs` |
| §1.8 „De făcut” | `src/core/todo.mjs` |
| §2.3 „Unde apare” (4 niveluri) | `src/core/whereused.mjs` |
| §2.4 harta, traseul, sănătatea, „Toate legăturile” | `src/core/graph.mjs`, `src/manage/views.mjs` |
| §3.1–3.2 contextul urmărit, dependențele | `src/site/context.mjs`, `src/site/render.mjs` |
| §3.4–3.5 `affected()`, procesare, `sync_log`, reîncercări, `scan()` · §3.7 temporizatoare | `src/core/sync.mjs` |
| §3.9 media (SHA-1, înlocuire cu același ID, `?v=`) | `src/core/media.mjs` |
| §3.11 panouri, SSE live · Anexa C API | `src/manage/*`, `src/server.mjs` |

## Utilizatori

Pe `localhost`, `/manage` intră fără parolă, ca administrator (standard §1.9). Pentru acces din afară există tabelul `users` și autentificarea cu scrypt (`createAuth().addUser`); scriptul de creare a utilizatorilor nu e făcut încă.
