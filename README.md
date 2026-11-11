# NIXODOR — site + Brain /manage

Site-ul nixodor.ro, randat pe server dintr-un Brain (SQLite), construit după **standardul Brain /manage v1** (15.10.2026). Node 24, `node:sqlite`, fără dependențe.

```bash
npm run setup     # import din snapshot + modificările de design din scripts/design/ (o instalare nouă)
npm run import    # doar importul: snapshot → data/brain.db (reluabil, determinist) + scanare
npm start         # http://localhost:4310/  ·  Brain: http://localhost:4310/manage/
npm test          # testele obligatorii din §5 (23) + verificarea iconițelor, pe datele importate
```

**Copia site-ului vechi (`reference/snapshot/`) și baza (`data/`) sunt doar locale, nu în git.** Copia se reface cu `npm run crawl && npm run analyze`, cât timp site-ul vechi și arhiva Wayback a blogului mai sunt online. Fără copie, testele care importă se sar (cu motivul afișat), iar `npm run setup` nu are de unde importa: conținutul curent stă în `data/brain.db`. Documentul de entități, cu presupunerile de lucru de confirmat: [docs/entitati.md](docs/entitati.md).

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

## Online (Vercel)

Site-ul și panoul rulează pe Vercel (proiectul `nixodor`, echipa dwf3): https://nixodor.vercel.app/. Până la lansare, toate paginile au `x-robots-tag: noindex` (verificat de `test/noindex.test.mjs`).

**Se lucrează local, se publică cu o comandă.** Conținutul se editează în panoul local (`npm start`, http://localhost:4310/manage/). Pe site ajunge cu:

```bash
npm run publish
```

Comanda face o copie a bazei în `site-data/brain.db` (fără conturi, sesiuni și încercări de login, pentru că repository-ul e public), copiază toate fișierele media în `public/media/`, face commit și push; Vercel publică în aproximativ un minut. `npm run publish -- --local` doar pregătește fișierele.

Codul (design, pagini, panou) ajunge pe site la fel, la fiecare push pe `main`.

Online, `api/index.mjs` copiază baza din deploy în `/tmp` și o deschide: **panoul online e doar pentru citire**, iar orice salvare primește 403 cu explicația. Nu există stocare online și nicio limită de consum de care să depindă site-ul. (Varianta anterioară, cu baza într-un Vercel Blob, a depășit limitele planului gratuit; store-ul `nixodor-brain` a rămas în proiectul Vercel, nefolosit.)

## Acces la panou

Pe `localhost`, `/manage` intră fără parolă, ca administrator (standard §1.9). Online, panoul e deschis oricui intră pe `https://nixodor.vercel.app/manage/` (variabila `NIXODOR_PANEL_OPEN=1` din Vercel), dar doar pentru citire: nu se poate modifica nimic de acolo.
