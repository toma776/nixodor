# Nixodor — documentul de entități

**Versiunea 1 · 23 octombrie 2026** · pas 2 din checklist-ul [standardului Brain /manage](../../../Downloads/standard-brain-manage.md) (§6)

Ce tipuri de informații are Brain-ul nixodor.ro, de unde vin, cum se leagă și ce trebuie decis înainte de import. Datele brute sunt în `reference/snapshot/` (crawl), rapoartele în `reference/analysis/` (analyze). Se refac cu:

```bash
node scripts/crawl.mjs && node scripts/analyze.mjs
```

---

## 1. Ce există azi

| Sursă | Ce e | Cum am luat-o | Certitudine |
|---|---|---|---|
| `www.nixodor.ro` | 6 pagini HTML statice scrise de mână (Home = Bioactivator, Despre, Felina, De unde cumpăr, Contact, Termeni), ultima modificare 03.05.2023 | crawl direct, 38 de resurse (imagini, CSS, JS, PDF) | confirmată |
| `nixodor.ro/blog` | WordPress (tema Twenty Twenty), 11 articole din 2020–2021, 2 autori, 3 categorii, 7 etichete | indexul, taxonomiile și autorii prin `wp-json`; **conținutul din Wayback Machine** (copii din 2022 și 2024) | confirmată din arhivă: textul poate fi mai vechi decât cel live |
| `continut/bioactivator_nixodor.pdf` | eticheta Bioactivator 1 L: compoziție, dozare, aplicare, păstrare, siguranță, EAN 9120063040063, producător | descărcat | confirmată |
| `portalia.ro/brand/nixodor/` | catalogul real: **36 de produse în 8 game** | o pagină, `analysis/portalia-catalog.json` | confirmată (sursă externă, la data crawl-ului) |
| `nixodor.net` | varianta în engleză, încă online | neanalizată | — |
| `nixodor.de` | domeniul nu mai există (DNS) | — | nerecuperabilă |

**Blogul e stricat pe server:** orice cerere care randează conținut (articol, rezumat, feed RSS) nu răspunde nici după 3 minute. Indexul fără conținut răspunde în 0,4 s. Probabil un plugin care blochează randarea. Conținutul e salvat doar în arhivă, deci importul trebuie făcut acum.

---

## 2. Tipurile

Notație ca în standard: **O** = obligatoriu, **R** = recomandat. Tipurile de nucleu (`media`, `redirecturi`, `meniuri`, `utilizatori`, `setari`) vin din nucleu și nu se mai descriu aici.

### 2.1 Date firmă — `firma` (singleton, `noStatus`) · O

| Câmp | Valoare găsită | Unde apare azi |
|---|---|---|
| `legal_name` | Instant SoftNet SRL | Contact, Termeni (28×, în 3 grafii: „SC Instant SoftNet SRL”, „Instant Softnet SRL”, „INSTANT SOFTNET SRL”), eticheta PDF |
| `brand` | NIXODOR (marcă înregistrată ®, „by Nourivit”) | peste tot |
| `address` | București, Sector 1 (fără stradă) | Contact, De unde cumpăr |
| `phone` | 0760 759 889 (scris și `0760759889`) | Contact, De unde cumpăr, eticheta PDF |
| `email` | office@portalia.ro **și** support@nixodor.net | Contact / Termeni: **contradicție**, de decis |
| `cui`, `reg_com` | lipsesc | — |
| `socials` (`links`) | Facebook, Instagram, YouTube | subsolul paginilor |
| `founded_year` | lipsește (pentru `{ani}`) | — |

Jetoane: `{telefon}`, `{email}`, `{firma}`, `{adresa}`, `{an}` (anul curent, în locul „© 2022” scris de mână).

### 2.2 Producători — `producatori` · O

Unul singur azi: **Nourivit Technologies GmbH**, Wienersdorferstraße 20-24/M33/5, 2514 Traiskirchen, Austria. E dezvoltatorul compoziției bacteriene, iar tehnologia se numește **Nourivit Plus** (insigna din subsol). `mentions: true`, alias „Nourivit”.

### 2.3 Game de produse — `game` · O

Entitatea principală a site-ului: **o pagină publică pe gamă** (`/bioactivator-fosa-septica/`, `/felina/`…). Câmpurile comune (descriere, mod de folosire, compoziție) stau aici o singură dată, nu pe fiecare variantă.

| Gamă | Variante la Portalia | Pe site azi |
|---|---|---|
| Bioactivator fosă septică | 1 L, 5 L, 10 L, 25 L | homepage (card + PDF) |
| Felina (nisip pentru pisici) | sac 2,5 / 5 / 10 kg + cutie 5 / 10 kg | pagina Felina (doar cutiile) |
| Aer Curat (gospodărie) | 500 ml, 1 L, 5 L, 10 L × simplu / Lavandă / Pin | card pe homepage |
| Aer Curat Pets | 1 L, 5 L, 10 L × simplu / Lavandă / Pin | lipsește |
| Aer Curat industrial | 5 L × simplu / Lavandă | lipsește |
| Aer Curat cai | 5 L | lipsește |
| Degresor bioenzimatic | 1 L, 5 L, 10 L | lipsește |
| Accelerator de compost | 250 ml, 1 L, 5 L, 10 L | lipsește |
| ~~Probiotic~~ | linkurile Portalia redirecționează acum spre **Dr. Poop** (alt brand) | card pe homepage + 3 articole: **de decis** |

```js
{
  key: 'game', table: 'product_lines', label: 'Game de produse', one: 'Gamă',
  category: 'produse', color: '#7ab929', thumb: 'hero_image_id', mentions: true, approval: true,
  title: 'name', aliases: 'aliases',
  public: {path: r => r.slug ? `/${r.slug}/` : null},
  linkFields: ['name', 'slug', 'short_name'],
  duplicates: {by: ['name'], normalize: true},
  fields: [
    {key: 'name', label: 'Nume', type: 'text', required: true, list: true},       // „Bioactivator fosă septică”
    {key: 'short_name', label: 'Nume scurt (meniu, carduri)', type: 'text'},      // „Bioactivator”
    {key: 'slug', type: 'slug', from: 'name'},
    {key: 'tagline', label: 'Promisiunea', type: 'text'},                         // „Elimină mirosul de fosă septică”
    {key: 'description', type: 'richtext'},
    {key: 'composition', label: 'Compoziție', type: 'richtext'},
    {key: 'dosage', label: 'Dozare', type: 'table'},                              // gospodărie uni-/multifamilială, doză inițială
    {key: 'application', label: 'Aplicare', type: 'richtext'},
    {key: 'storage', label: 'Păstrare și valabilitate', type: 'richtext'},
    {key: 'safety', label: 'Instrucțiuni de siguranță', type: 'richtext'},
    {key: 'hero_image_id', type: 'image'}, {key: 'label_pdf_id', label: 'Eticheta (PDF)', type: 'image'},
    {key: 'video_id', label: 'Clip YouTube', type: 'text'},                       // 0X2T_3UG4iE (Bioactivator)
    {key: 'producer_id', type: 'ref', target: 'producatori', required: true},
    {key: 'benefits', type: 'refs', target: 'beneficii', ordered: true, rel: 'are beneficiul', inverseLabel: 'Game'},
    {key: 'uses', type: 'refs', target: 'utilizari', rel: 'rezolvă', inverseLabel: 'Game'},
    {key: 'aliases', type: 'list'}                                                // „NIXODOR Bioactivator”, „bioactivatorul”
  ]
}
```

Afirmațiile de produs („100% natural”, „nu provoacă alergii”, „recomandat de medicul veterinar”) au consecințe legale, deci tipul are `approval: true`.

### 2.4 Produse (variante) — `produse` · O

O variantă vândută: gamă + cantitate + parfum + ambalaj. Titlul se calculează din câmpuri („Bioactivator fosă septică, 5 L”), nu se scrie de mână.

**Decizie (26.10.2026, a utilizatorului):** variantele diferă doar prin cantitate sau parfum, deci **nu au pagină și nici card propriu**. Pagina gamei e generică. În „Despre produs” apare blocul generat **„Variante disponibile”** (de exemplu „1 L · 5 L · 10 L · 25 L”, pe rânduri pe parfum unde există), calculat din înregistrările publicate. Nu se scrie de mână în descriere (§0.2): o variantă adăugată sau retrasă în Brain apare sau dispare singură. Butoanele „Cumpără de la …” sunt la nivel de gamă (`game.listings`); variantele își păstrează în Brain linkurile proprii spre magazin, ca date. Câmpul `description` al variantei a dispărut. Textele cardurilor Felina vechi (5 și 10 kg) nu se mai afișează, pentru că repetă primul paragraf al descrierii gamei.

| Câmp | Note |
|---|---|
| `line_id` | `ref` → `game`, obligatoriu |
| `size`, `unit` | `number` + `select` (ml / L / kg) |
| `scent` | `select`: — / Lavandă / Pin |
| `pack` | `select`: flacon / bidon / cutie carton / sac |
| `ean` | cheie naturală unică (§1.2); singurul cunoscut: 9120063040063 (1 L) |
| `image_id` | `image` |
| `listings` | `refs` → `magazine`, cu `attrs: [{key: 'url'}, {key: 'external_id'}]` (de exemplu Portalia `p10`) |
| `legacy_ref` | `portalia:p10` (ID extern stabil `sursă:referință`, §1.2) |

`duplicates: {by: ['line_id', 'size', 'unit', 'scent', 'pack']}`. Așa „sac 5 kg” (p663) și „cutie 5 kg” (p269) rămân produse distincte, nu dubluri.

Prețul **nu** se ține în Brain: Portalia e sursa lui și se schimbă acolo. Dacă vrem prețuri pe site, ele vin dintr-o sincronizare (§1.2, ID extern), nu se scriu de mână.

### 2.5 Beneficii — `beneficii` · O

Azi sunt **imagini cu textul ars în ele**, fără text alternativ: „100% natural”, „Ușor de curățat”, „Absoarbe mirosurile neplăcute”, „Utilizabil ca îngrășământ”, plus bulinele de pe eticheta Bioactivator („Reduce producerea de nămol”, „Prelungește durata de viață a stației de epurare”, „Degradează și descompune eficient substanțele organice”). În Brain devin: `text`, `icon` (`image`), legate de game prin `benefits`. Același „100% natural” e o singură înregistrare, folosită de mai multe game.

### 2.6 Utilizări — `utilizari` · R

Problema pe care o rezolvă produsul: fosă septică, stație de epurare, hazna, litieră, miros de animale în casă, grajd, grăsimi în conducte, compost. Leagă gamele de articole și servesc paginile pe care le caută oamenii („miros fosă septică”). `mentions: true`. **De decis** dacă au pagini publice (§6).

### 2.7 Magazine — `magazine` · O

| Magazin | Web | Telefon | Adresă |
|---|---|---|---|
| Portalia | portalia.ro/brand/nixodor/ | 0760 759 889 (**același** cu telefonul firmei) | București, Sector 1 |
| eMAG | emag.ro | 021 200 52 00 | lista showroom-urilor eMAG |

Pagina „De unde cumpăr” devine o listă `query('magazine')`. Butoanele „Vreau să cumpăr” trimit la `ref:magazine:1`, nu la o adresă scrisă de mână.

### 2.8 Recenzii — `recenzii` · O

9 recenzii: 6 Bioactivator (homepage) și 3 Felina. Câmpuri: `author`, `text`, `date`, `store_id` (`ref` → magazine; azi e scris „eMAG.ro” / „Portalia.ro”), `line_id` (`ref` → game), `rating` (lipsește azi).

- Sursa fiecărei recenzii e pagina de produs de pe eMAG sau Portalia. Până nu o verifică un om, certitudinea e `unverified` (§1.4): azi sunt copiate în HTML, fără link.
- Textul e citat, deci **nu se tokenizează și nu se corectează** (§1.6 a). Îl lăsăm cu greșelile lui.
- Pe site apar doar recenziile publicate ale gamei paginii: `query('recenzii', {line_id}, {scope: 'game:<id>'})`.

### 2.9 Articole — `articole` · O

| Câmp | Note |
|---|---|
| `title`, `slug`, `content` (`richtext`, vocabular fix §1.8), `excerpt` | din arhivă |
| `published_at`, `updated_at` | din API (`date`, `modified`) |
| `author_id` | `ref` → `autori` |
| `categories`, `tags` | `refs` → `categorii-blog`, `etichete` |
| `featured_image_id` | `image` (14 imagini recuperate, originalele) |
| `lines` | `refs` → `game`, **deduse** din mențiuni (§1.6 b), cu fragmentul ca dovadă |
| `legacy_id` | `wp_id` (pentru `?p=143`) |
| `meta_title`, `meta_description` | din paginile arhivate (doar unele au) |

Adresa rămâne **`/blog/<slug>/`**, identică cu cea veche, deci nu e nevoie de redirecționări pentru articole.

### 2.10 Autori, categorii, etichete — `autori` · `categorii-blog` · `etichete` · O

- Autori: „karina” și „nixodor” (slug `adipintilie`). **De decis**: nume reale sau autor instituțional.
- Categorii: Câini (8), Pisici (9), Îngrijire (1); „Uncategorized” (0) nu se importă.
- Etichete: câine, dietă, minerale, proteine, unghii, ustensile, vitamine. 6 din 7 au un singur articol, deci e de discutat dacă păstrăm etichetele.

### 2.11 Pagini și secțiuni — `pagini` + `sectiuni` (`hub: false`) · O

Paginile fixe: Acasă, Despre, De unde cumpăr, Contact, Termeni și condiții, plus **Politica de cookie-uri și Confidențialitate**, care lipsesc, deși Termenii și formularul de contact trimit la ele. Tipuri de secțiune găsite: `hero` (titlu, buton, imagine), `carduri-game`, `video`, `recenzii`, `text`, `cta` (subsol „De unde pot cumpăra?”), `insigna-producator`.

---

## 3. Relațiile

| Relație | Fel | Verb / invers | Note |
|---|---|---|---|
| `produse.line_id` → `game` | `ref` obligatoriu, `RESTRICT` | aparține gamei / Variante | `owned`: variantele nu blochează nimic și nu apar în „Folosit de” |
| `game.producer_id` → `producatori` | `ref` obligatoriu | produs de / Game | |
| `game.listings` → `magazine` | `refs`, ordonat, `attrs: [url]` | se vinde la / Game | butoanele „Cumpără” ale paginii; la import: produsul de pe site-ul vechi sau cea mai mică variantă fără parfum |
| `game.benefits` → `beneficii` | `refs`, ordonat | are beneficiul / Game | |
| `game.uses` → `utilizari` | `refs` | rezolvă / Game | R |
| `produse.listings` → `magazine` | `refs` + `attrs` (url, id extern) | se vinde la / Produse | |
| `recenzii.line_id` → `game` | `ref` | despre / Recenzii | |
| `recenzii.store_id` → `magazine` | `ref` | publicată pe / Recenzii | |
| `articole.lines` → `game` | `refs`, **`sensitive: true`** | recomandă / Articole | un articol de sănătate animală care „recomandă” un produs e o afirmație, deci schimbarea cere aprobare |
| `articole.author_id` → `autori` | `ref` | scris de / Articole | |
| `articole.categories` / `tags` | `refs` | în categoria / Articole | |

Legăturile deduse din analiză, care **nu ajung pe site** până nu sunt confirmate în „Legături de verificat” (§2.5):

| Articol | Mențiuni găsite | Legătură propusă |
|---|---|---|
| Dieta corectă la câini și pisici… | „Nixodor” 15×, link spre `/nixodor-pentru-caini.html`, `/nixodor-pentru-pisici.html` | → Probiotic câini/pisici (**gama nu mai există**, vezi §5) |
| Nevoile dietetice ale unei pisici | „Nixodor”, „Portalia”, link Portalia p202 | → Probiotic pisici |
| Înțelege nevoile dietetice ale câinelui tău… | „Nixodor”, link Portalia p201 | → Probiotic câini |
| Cele mai bune suplimente pentru animale | „probiotic” 4× (generic) | niciuna: mențiune generică, nu numele gamei |

Celelalte 7 articole nu pomenesc niciun produs. Azi blogul (îngrijirea câinilor și pisicilor) și produsele (fose septice, mirosuri) au foarte puțin în comun.

---

## 4. Adresele vechi

Toate adresele vechi primesc 301 spre cele noi (§3.8). Destinația e o entitate (`ref:`), ca redirecționarea să reziste la schimbări de adresă.

| Vechi | Nou | Destinație |
|---|---|---|
| `/`, `/index.html` | `/` | `ref:pagini:acasa` |
| `/despre-nixodor.html` | `/despre/` | `ref:pagini:…` |
| `/nixodor-felina.html` | `/felina/` | `ref:game:felina` |
| `/de-unde-cumpar.html` | `/de-unde-cumpar/` | `ref:pagini:…` |
| `/contact.html` | `/contact/` | `ref:pagini:…` |
| `/termeni-si-conditii.html` | `/termeni-si-conditii/` | `ref:pagini:…` |
| `/nixodor-pentru-caini.html`, `/nixodor-pentru-pisici.html` | — | dau azi 404, deși articolele trimit la ele: de decis (§5) |
| `/continut/bioactivator_nixodor.pdf` | `/media/…` | `data-media` spre fișierul din bibliotecă |
| `/blog/<slug>/` | `/blog/<slug>/` | neschimbat |
| `/blog/category/<x>/`, `/blog/tag/<x>/`, `/blog/author/<x>/` | `/blog/<categorie>/` sau 410 | după decizia despre etichete |
| `/blog/?p=<id>` | articolul | din `legacy_id` |
| `/blog/wp-content/uploads/…` | `/media/uploads/…` | 301 |
| `www.` ↔ fără `www.` | una singură | azi site-ul e pe `www`, iar blogul pe varianta fără `www` |

---

## 5. „De făcut” la pornire

Observațiile pe care Brain-ul le va arăta în Panou după import, ordonate după impact.

**Mare**
1. **Probiotic**: cardul de pe homepage și 3 articole trimit la produse care pe Portalia sunt acum „Dr. Poop”. Paginile `/nixodor-pentru-caini.html` și `/nixodor-pentru-pisici.html` dau 404.
2. **5 game din 8 lipsesc de pe site** (Aer Curat Pets, industrial, cai, Degresor, Accelerator de compost). La Felina lipsesc sacii de 2,5 / 5 / 10 kg.
3. **Text „lorem ipsum” ascuns** (alb pe alb) pe pagina Felina.
4. **Două emailuri de contact** (office@portalia.ro / support@nixodor.net).
5. **Termenii și condițiile sunt copiați dintr-un magazin online**: conturi de client, comenzi, un link la o politică de cookie-uri care nu există (`/despre-magazin-c4/…`). Lipsesc politica de confidențialitate și cea de cookie-uri, deși formularul de contact trimite la ea.
6. **Blogul nu răspunde** (§1). Conținutul există doar în arhivă.
7. **Formularul de contact nu trimite nimic** (`href="#"`, codul e comentat).

**Mediu**
8. 15 imagini fără text alternativ, iar beneficiile sunt text ars în imagine (§2.5).
9. Fără `robots.txt` și fără `sitemap.xml`.
10. Google Analytics `UA-158312345-2`: Universal Analytics e oprit din 2023, deci măsurarea e moartă. În locul lui: GTM, încărcat doar după acord (§6 punctul 9 din standard).
11. Linkul la `nixodor.de` din comutatorul de limbă e mort (domeniul nu mai există).
12. Eticheta PDF de pe homepage e pentru 1 L, iar butonul „Cumpără” trimite la 5 L.
13. Recenziile n-au link spre sursă și n-au notă. Cea mai nouă e din 2021.

**Mic**
14. Textul e scris fără diacritice, peste tot.
15. „© 2022” scris de mână → `{an}`.
16. Firma e scrisă în 3 grafii → `{firma}`. Telefonul e scris în 2 forme → `{telefon}`.

*Lecție deja aplicată în analiză:* căutarea telefoanelor fără granițe de cifre a „găsit” numărul `0745988418` în ID-ul paginii de Facebook (`…107459884182614`). Asta e exact greșeala 5 din standard (§4). Regula cu granițe e acum în `analyze.mjs` și trebuie să fie și în detecția la salvare.

---

## 6. Decizii de luat înainte de import

> **Presupuneri de lucru (23.10.2026, de confirmat).** Ca lucrul să poată porni, am ales câte o variantă pentru fiecare decizie. Toate se pot schimba din Brain, fără reimport.
>
> | # | Presupunere | Ce înseamnă în import |
> |---|---|---|
> | 1 | Probiotic **nu** mai e gamă Nixodor. **26.10.2026: rămâne în afara site-ului până confirmă clientul** | nu se importă; cardul de pe homepage dispare; linkurile din articole spre Portalia p201/p202 și spre paginile 404 rămân în „De făcut” |
> | 2 | **Toate cele 8 game** sunt în Brain | Bioactivator, Felina și Aer Curat Pets (cardul „Aer Curat” de pe homepage trimite de fapt la Pets) sunt publicate; celelalte 5 au doar numele și variantele, deci rămân **ciornă** până primesc text |
> | 3 | Email oficial: **office@portalia.ro** (cel din pagina de Contact) | `support@nixodor.net` din Termeni apare în „De făcut” ca valoare care contrazice Date firmă |
> | 4 | Utilizările **au pagini publice** | sunt create ca ciorne, fără text: nimic nu apare pe site până nu le scrie cineva |
> | 5 | Blogul păstrează articolele despre animale și **adaugă** subiectele produselor | categoriile rămân; etichetele se păstrează doar intern (fără pagini) |
> | 6 | `nixodor.net` (EN) **rămâne separat** | — |
> | 7 | Textul se importă **exact**, fără diacritice | verificarea dus-întors (§1.3) rămâne exactă; adăugarea diacriticelor e o sarcină separată, cu aprobare |
> | 8 | Domeniul canonic: **`www.nixodor.ro`** | `nixodor.ro/blog/…` → 301 spre `www.nixodor.ro/blog/…` |
> | 9 | ~~Un server care rulează mereu~~ → **Vercel** (decis 26.10.2026) | baza nu mai poate fi un fișier local: vezi §7 |

1. **Probiotic**: e încă produs Nixodor? Dacă nu: scoatem cardul și legăm cele 3 articole de altă gamă sau de niciuna. Dacă da: refacem cele două pagini care dau 404.
2. **Ce game intră pe site**: toate cele 8, sau doar cele de pe site-ul de azi?
3. **Emailul oficial**: office@portalia.ro sau support@nixodor.net?
4. **Utilizări**: pagini publice (de exemplu „miros fosă septică”) sau doar etichete interne?
5. **Blogul**: rămâne despre câini și pisici sau trece pe subiectele produselor (fose, mirosuri, compost)? Asta decide dacă păstrăm etichetele.
6. **Limbi**: preluăm și `nixodor.net` (EN) în același Brain (§1.10) sau rămâne separat?
7. **Diacritice**: le adăugăm la import (modificare de conținut, cu aprobare) sau păstrăm textul exact?
8. **Domeniul canonic**: `www.nixodor.ro` sau `nixodor.ro`?
9. **Găzduirea**: un server care rulează mereu sau Vercel? Dacă e Vercel, intră cron-ul din §3.7 și `data_version` din §3.12.
