# Homepage — redesign v1 (26.10.2026)

Ce s-a schimbat la pagina de acasă și ce trebuie aprobat. Conținutul e în Brain (secțiunile paginii „Acasă”), aplicat cu `scripts/design/2026-10-26-homepage.mjs`. Stilul e în `src/site/assets/site.css`, iar machetele în `src/site/render.mjs`.

## Sistemul vizual

- **Font:** Poppins (ca pe site-ul vechi), găzduit pe site, nu la Google Fonts. Grosimi: 400, 500, 600 și 700, cu literele românești.
- **Culori:** paleta veche, păstrată:
  - logo #78be43;
  - verde #5b9f1d;
  - portocaliu #f26513;
  - albastru #269ac7;
  - teal #004054.
- **Accesibilitate:** textul și butoanele folosesc treptele care trec WCAG AA.
  - **Butoanele mari** sunt în portocaliul exact al mărcii, cu text de 19px bold. E text mare, deci minimul e 3:1, iar contrastul e 3,16.
  - **Butoanele mici și cel din meniu** sunt teal, cu contrast 11:1.
  - **Textul verde** e #3f7a14 (5,2:1).
  - **Linkurile de pe cardurile colorate** sunt în variante mai închise ale culorii cardului (peste 4,7:1).
- **Alte detalii de accesibilitate:**
  - legătură „Sari la conținut”;
  - focus vizibil la navigarea cu tastatura;
  - un singur H1, fără trepte de titlu sărite;
  - text alternativ pe toate imaginile, gol pe cele decorative;
  - fără animații pentru cine le dezactivează din sistem.
- **Clipul YouTube** se încarcă doar la clic, din `youtube-nocookie`: fără cookie-uri și fără greutate la deschiderea paginii.

## Structura (drumul vizitatorului)

1. **Erou:**
   - fotografia casei de la țară, cu ambalajul Bioactivator;
   - două acțiuni: „Descoperă Bioactivatorul” și „De unde cumpăr”;
   - **reperele** de sub erou. Fiecare vine dintr-o entitate, nu e scris de mână: primul beneficiu, producătorul, magazinele și numărul de recenzii.
2. **Beneficii:** cele 4 beneficii ale gamei Bioactivator, din Brain.
3. **Gama:** cardurile celor 3 game publicate. Când se publică o gamă nouă, cardul ei apare singur.
4. **Clipul**, pe fundal teal.
5. **Recenzii:** 6 dintre ele, cu sursa și luna.
6. **Tehnologia:** Nourivit Plus și producătorul.
7. **Articole:** ultimele 3 de pe blog.
8. **Unde cumpăr:** Portalia și lista magazinelor.

## Texte noi, de aprobat

Le-am scris eu pentru redesign. Sunt în secțiunile paginii „Acasă” și se pot schimba din `/manage`.

| Secțiune | Supratitlu | Titlu / text |
|---|---|---|
| Erou | Bioactivator natural pentru fose septice | „Bacterii și enzime naturale care elimină mirosul, reduc nămolul și descompun grăsimile din fosa septică sau din stația de epurare.” (rezumat din textul „Despre”) |
| Beneficii | De ce Bioactivator | **O fosă septică sănătoasă, fără mirosuri** · „Folosit regulat, bioactivatorul ajută fosa septică, stația de epurare sau hazna să funcționeze mai bine și mai mult timp.” (din „Despre”) |
| Gama | Gama NIXODOR | **Soluții naturale pentru fiecare miros** · „Fiecare produs folosește bacterii active, fără parfumuri care doar acoperă mirosul.” — **de verificat**: e adevărat pentru toate gamele? (Aer Curat are variante cu Lavandă și Pin) |
| Clip | Vezi cum funcționează | **Bioactivatorul NIXODOR, pe scurt** · „Un clip scurt despre cum lucrează bacteriile active în fosa septică.” |
| Recenzii | Recenzii | Ce spun clienții despre Bioactivatorul NIXODOR (titlul vechi, cu diacritice) |
| Tehnologie | Tehnologia din spate | Produse realizate cu tehnologia Nourivit Plus · textul din „Despre”, cu diacritice |
| Articole | Blog | **Articole și sfaturi** · link „Toate articolele” |
| Unde cumpăr | De unde cumpăr | **Găsești produsele NIXODOR online** · „Comandă de la Portalia sau vezi toate magazinele care au produsele noastre.” |

**Diacritice adăugate**, fără schimbare de sens: titlul eroului, numele și promisiunile celor 3 game, cele 6 beneficii, meniurile, descrierea site-ului și adresa firmei. Textele lungi (descrieri, articole, Termeni) și recenziile au rămas exact ca pe site-ul vechi.

## Ce rămâne

- **Paginile interioare** (gamă, Despre, blog etc.) au preluat antetul, subsolul, fonturile și culorile noi. Machetele lor nu sunt încă redesenate.
- **Imaginile** sunt PNG-urile originale, unele de peste 1 MB. Pentru lansare trebuie WebP și dimensiuni adaptate ecranului.
- **Fotografia eroului** și cea de la clip sunt din site-ul vechi. Dacă există fotografii proprii, de produs în uz, ar arăta mai bine.

## Eroul de brand (propunere, 26.10.2026)

Eroul nu mai prezintă doar Bioactivatorul. Stânga: mesajul NIXODOR; dreapta: câte un card pentru fiecare gamă publicată (Bioactivator, Felina, Aer Curat Pets), în culoarea ei, cu link spre pagina gamei. Cardurile vin din Game, deci o gamă nouă, publicată și cu imagine, apare singură. Sub erou, reperele sunt la nivel de brand: tehnologia Nourivit, magazinele și toate recenziile.

Texte noi, de aprobat:
- supratitlu: „Produse bioenzimatice NIXODOR”
- titlu: „Scapă natural de mirosurile neplăcute”
- text: „Bacterii și enzime active care descompun sursa mirosului, nu doar îl acoperă. Pentru fosa septică, litiera pisicii și locul unde stau animalele tale.”
- butoane: „De unde cumpăr”, „Despre NIXODOR”

Stă ca ciornă pe secțiunea „hero” a paginii Acasă (`scripts/design/2026-10-26-hero-brand.mjs`): se vede în previzualizare și ajunge pe site la „Publică”.

## Cele 5 game de pe Portalia (ciorne, 26.10.2026)

Aer Curat, Aer Curat industrial, Aer Curat cai, Degresor bioenzimatic și Accelerator de compost au acum poza principală, descrierea și detaliile (compoziție, dozare, aplicare, păstrare, siguranță) copiate de pe pagina câte unui produs de la Portalia (`scripts/design/2026-10-26-game-portalia.mjs`, sursele în `reference/snapshot/external/portalia-pNNN.html`). Rămân ciorne: se văd în previzualizare și ajung pe site, în meniu, în cardurile de pe homepage și în eroul de brand doar după „Publică”.

De aprobat, scrise de noi după descriere: promisiunea și textul cardului pentru fiecare gamă.

De verificat cu clientul:
- Etichetele spun „Producător: Instant SoftNet SRL sub licența Nourivit… Distribuitor: Instant SoftNet SRL, www.portalia.ro”: Portalia e chiar firma care face produsele.
- Degresorul are un cod EAN cu alt prefix (7331898535958) decât restul gamei (5065000…) și nu menționează Nourivit: e posibil să fie făcut de alt producător.
- Pozele de la Portalia au fundal alb; pe site se contopesc cu fundalul din CSS. Pentru calitate maximă, ar fi bune variantele transparente (PNG) de la client.
