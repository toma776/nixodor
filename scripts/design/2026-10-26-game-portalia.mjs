// Cele 5 game care lipseau de pe site-ul vechi (26.10.2026): poza principală, textul cardului și detaliile
// de pe pagina câte unui produs de la Portalia (salvată în reference/snapshot/external/portalia-pNNN.html).
// Textele sunt cele de la Portalia, cu diacritice; gamele rămân ciorne, de aprobat și publicat din panou.
// Promisiunea și textul cardului (scurte) sunt scrise de noi, după descriere: de aprobat (docs/design-homepage.md).
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createApp, ROOT} from '../../src/app.mjs';
import {PERMS} from '../../src/registry/entities.mjs';
import {nowIso} from '../../src/core/db.mjs';

const DESIGN = {name: 'Claude (design)', role: 'admin', perms: new Set(PERMS.admin)};
const app = createApp({live: false});
const {store, media, db} = app;
const EXT = join(ROOT, 'reference/snapshot/external');
const lineId = legacy => db.prepare(`SELECT id FROM product_lines WHERE legacy_ref = ?`).get(legacy).id;
const productId = p => db.prepare(`SELECT id FROM products WHERE legacy_ref = ?`).get(`portalia:${p}`).id;

const LINES = [
  {legacy: 'gama:aer-curat', p: 'p626', ean: '5065000398330', accent: 'albastru',
    url: 'https://www.portalia.ro/nixodor-aer-curat-solutie-pentru-mirosurile-neplacute-din-gospodarie-1l-p626/',
    image: 'aer-curat-gospodarie.webp', alt: 'Nixodor Aer Curat, flacon cu pulverizator de 1 L',
    tagline: 'Fără mirosuri neplăcute în gospodărie',
    card_text: 'Elimină mirosul din cotețe, grajduri și locul gunoiului. Descompune deșeurile organice.',
    description: '<p>Nixodor Aer Curat pentru Gospodărie este un produs 100% natural, pe bază de mix de bacterii, cu extract de mentă, salvie, nalbă și melasă din trestie de zahăr. Nixodor Aer Curat descompune rapid deșeurile organice, eliminând toate mirosurile urâte din gospodărie. Se folosește în toate spațiile din gospodărie unde sunt mirosuri urâte de la animale domestice și de companie sau de la resturile de gunoi depozitate în curte.</p>'
      + '<p><strong>Nu se aplică pe materiale textile!</strong></p>'
      + '<h3>Ce beneficii oferă</h3><ul><li>Descompune rapid deșeurile organice</li><li>Elimină toate mirosurile urâte din gospodărie</li><li>Igienizează grajdurile, hambarele, cotețele sau anexele în care sunt animale</li><li>Asigură un ecosistem stabil și o microfloră sănătoasă</li><li>Îmbunătățește climatul și asigură reducerea infestării cu muște</li><li>Neutralizează mirosurile neplăcute datorate fermentației bălegarului și a urinei</li><li>Este un produs fără reziduuri chimice</li></ul>',
    dosage: '<p><strong>Dozare prin pulverizare:</strong></p><ul><li>Cotețe de păsări: 50–100 ml/m²</li><li>Cocini de porcine / staule de bovine: 1,1 L/m²</li></ul>'
      + '<p><strong>Pentru procesul de descompunere</strong>, dozajul se face la metru cub. Tratamentul se aplică o dată la 3 săptămâni, în locul în care se depozitează deșeurile:</p><ul><li>Dejecții de porcine/bovine: 1,5 L</li><li>Dejecții de păsări: 2 L</li><li>Dejecții solide: se pulverizează 1 L</li><li>Dejecții lichide: se amestecă 25 L cu 2 zile înainte de evacuare</li></ul>'
      + '<p>Disponibil în sticle de 500 ml și 1 L și în bidoane de 5 L și 10 L.</p>'},
  {legacy: 'gama:aer-curat-industrial', p: 'p672', ean: '5065000398392', accent: 'albastru',
    url: 'https://www.portalia.ro/aer-curat-bioactivator-impotriva-mirosurilor-pentru-uz-industrial-5l-nixodor-p672/',
    image: 'aer-curat-industrial.webp', alt: 'Nixodor Aer Curat pentru uz industrial, bidon de 5 L',
    tagline: 'Bioactivator împotriva mirosurilor, pentru uz industrial',
    card_text: 'Pentru restaurante, hoteluri, ferme, stații de epurare și spații industriale.',
    description: '<p>Recomandat pentru eliminarea mirosurilor neplăcute provenite din materii organice, reziduale sau acumulări în sisteme de canalizare. Poate fi aplicat și pe suprafețe expuse mirosurilor persistente, cum ar fi containere, echipamente sau pardoseli.</p>'
      + '<p>Ideal pentru gropi de gunoi, stații de epurare, ferme, spații industriale și comerciale cum ar fi restaurante, hoteluri, hale de producție, spălătorii auto sau alte spații.</p>'
      + '<h3>Beneficii</h3><ul><li>Neutralizează rapid și eficient mirosurile puternice și persistente.</li><li>Formula bioactivă descompune reziduurile organice, prevenind blocajele și acumulările.</li><li>Economic și sigur pentru sistemele industriale și suprafețele de lucru.</li></ul>'
      + '<p><strong>Atenționări:</strong> produsul are o culoare maro și poate păta textilele sau pereții. Evitați aplicarea pe materiale sensibile fără protecție. Se recomandă testarea pe o suprafață mică înainte de utilizare pe suprafețe vizibile.</p>',
    application: '<p>Agitați bine înainte de utilizare.</p><ol><li>Turnați 50–200 ml de produs direct în scurgerile mari, canalizări sau conducte industriale. Lăsați produsul să acționeze timp de 1–2 ore. În cazul mirosurilor puternice sau persistente, produsul poate fi lăsat să acționeze peste noapte. După utilizare, clătiți cu apă.</li><li>Pentru suprafețe plane, în zonele de acumulare a mirosurilor neplăcute (depozite, zone de colectare a deșeurilor etc.), se pulverizează folosind atomizorul câte 20–50 ml/m², în funcție de necesitățile spațiului și de capacitatea de pulverizare a atomizorului.</li></ol>'
      + '<p>Pentru eficiență optimă, recomandăm ajustarea cantității în funcție de nivelul de intensitate al mirosurilor din fiecare zonă și în funcție de anotimp.</p>',
    storage: '<p>A se păstra în locuri răcoroase și ferite de lumină (+8 °C – +23 °C). Valabilitate minimum 18 luni de la data de fabricație.</p>',
    safety: '<p>A nu se lăsa la îndemâna copiilor și a animalelor de companie. Nu ingerați NIXODOR Aer Curat, nu turnați în ochi și evitați contactul cu mucoasele. La ingerare sau contact nu sunt necesare măsuri speciale.</p>'},
  {legacy: 'gama:aer-curat-cai', p: 'p667', ean: '5065000398477', accent: 'portocaliu',
    url: 'https://www.portalia.ro/nixodor-aer-curat-solutie-pentru-mirosurile-neplacute-de-la-cai-5l-p667/',
    image: 'aer-curat-cai.webp', alt: 'Nixodor Aer Curat pentru cai, canistră de 5 L',
    tagline: 'Igiena grajdurilor și tratamentul bălegarului, natural',
    card_text: 'Fără miros de grajd și mai puține muște. Tratează bălegarul solid și lichid.',
    description: '<p>NIXODOR Aer Curat – un produs 100% natural, cu acțiune dublă pentru grajduri: dezinfectarea zonelor și tratarea bălegarului (accelerează descompunerea deșeurilor organice). Asigură o microfloră și un ecosistem sănătos, îmbunătățește condițiile și reduce infestarea cu muște.</p>'
      + '<h3>Utilizare recomandată pentru igiena grajdurilor și tratamentul bălegarului</h3><ul><li>Dezinfectează grajdurile și hambarele, creând un ecosistem sănătos și o microfloră benefică.</li><li>Acționează pe baza mecanismelor naturale de apărare microbiană împotriva patogenilor.</li><li>Îmbunătățește climatul din grajduri și reduce infestarea cu muște.</li><li>Neutralizează mirosurile neplăcute provenite de la fermentația bălegarului și urină.</li><li>Fără reziduuri chimice.</li><li>Tratament sistemic pentru bălegar lichid și solid.</li><li>Îmbunătățește și stabilizează calitatea igienică a bălegarului.</li><li>Previne formarea straturilor plutitoare și a crustei, asigurând fluiditatea bălegarului.</li></ul>',
    composition: '<p>Microorganisme, inclusiv bacterii lactice (Bifidobacterium animalis, Bifidobacterium bifidum, Lactobacillus fermentum, Lactobacillus casei, Lactobacillus plantarum), Rhodopseudomonas palustris și Saccharomyces cerevisiae; extract de mentă, salvie, nalbă, melasă de trestie de zahăr și apă.</p>',
    dosage: '<p><strong>Pentru bălegarul de cai:</strong></p><ul><li>Bălegar solid: pulverizați 1 L Nixodor pe metru cub de bălegar.</li><li>Bălegar lichid: amestecați 25 L Nixodor la 100 metri cubi de bălegar înainte de evacuare (ideal cu 2 zile înainte).</li></ul>'
      + '<p><strong>Pentru grajduri:</strong></p><ul><li>Descompunere: aplicați 1 L Nixodor pe metru cub la fiecare 3 săptămâni în locurile de deșeuri.</li><li>Dezinfectare: utilizați 1 L la 10 metri pătrați la fiecare două săptămâni.</li><li>Exemplu: o zonă de 10 m² deține în mod tipic aproximativ 1 m³ de deșeuri.</li></ul>',
    storage: '<p>Depozitați în locuri răcoroase și protejate de lumină (+8 °C – +23 °C). Durata minimă de viață este de 18 luni de la data fabricației.</p>',
    safety: '<p>A se păstra departe de accesul copiilor și animalelor de companie. Nu ingerați NIXODOR Aer Curat, evitați contactul cu ochii și membranele mucoase. Nu sunt necesare măsuri speciale în cazul ingestiei sau contactului.</p>'},
  {legacy: 'gama:degresor', p: 'p709', ean: '7331898535958', accent: 'portocaliu',
    url: 'https://www.portalia.ro/nixodor-degresor-solutie-bioenzimatica-anti-grasime-pentru-conducte-fose-si-chiuvete-1l-p709/',
    image: 'degresor-bioenzimatic.webp', alt: 'Nixodor Degresor, sticlă de 1 L',
    tagline: 'Soluție bioenzimatică anti-grăsime pentru conducte, fose și chiuvete',
    card_text: 'Dizolvă grăsimile din conducte și fose. Previne blocajele și mirosurile.',
    description: '<p>Nixodor Degresor este o soluție bioenzimatică super-concentrată, formulată pentru a dizolva crustele de grăsime și depunerile organice din fose septice, toalete ecologice, conducte și scurgeri. Neutralizează eficient mirosurile neplăcute și previne blocajele, fiind sigur pentru instalații și flora bacteriană anaerobă.</p>'
      + '<h3>Caracteristici</h3><ul><li>Soluție translucidă, pH = 6,4–6,8</li><li>Compatibil cu flora bacteriană anaerobă</li><li>Complet solubil în apă</li></ul>',
    composition: '<p>Apă demineralizată, agenți tensioactivi neionici (≥1%, &lt;10%), agenți tensioactivi anionici (≥1%, &lt;10%), glicerină (≥1%, &lt;10%), solvent natural (≥1%, &lt;10%), enzime (≥1%, &lt;10%), conservant (&lt;1%), agent de reglare pH (&lt;1%).</p>',
    application: '<p>Agită bine flaconul înainte de utilizare. Nu folosi dezinfectanți chimici în intervalul de 12–24 h după aplicare.</p>'
      + '<p><strong>Recomandări generale:</strong></p><ul><li>Tratament intensiv: aplicare zilnică timp de 3–5 zile, în funcție de gradul de încărcare organică</li><li>Întreținere: o dată pe săptămână sau la nevoie, în funcție de utilizarea instalației</li></ul>',
    dosage: '<p><strong>Uz casnic:</strong></p><ul><li>Gospodărie cu 1–2 persoane: prima utilizare (desfundare) 400–600 ml, întreținere 200 ml/săptămână</li><li>Gospodărie cu peste 2 persoane: prima utilizare (desfundare) 1,5 L, întreținere 500 ml/săptămână</li><li>Toalete ecologice/clasice: prima utilizare (desfundare) 600 ml, întreținere 200 ml diluați în 5 L apă</li></ul>'
      + '<p><strong>Uz profesional (restaurante, hoteluri, fose mari):</strong></p><ul><li>Prima utilizare (desfundare): 500–1000 ml/zi timp de 3–5 zile consecutive</li><li>Întreținere: 500 ml/săptămână în toaletă, chiuvetă sau fosă</li></ul>',
    storage: '<p>Depozitare la 5–25 °C, ferit de îngheț și de lumina directă. Termen de valabilitate: 24 de luni de la data fabricației.</p>',
    safety: '<p>A nu se lăsa la îndemâna copiilor. Nu utilizați produsul dacă a expirat sau în condiții diferite față de cele recomandate. A se evita sursele de căldură, radiațiile, electricitatea statică și contactul cu produsele alimentare.</p>'},
  {legacy: 'gama:accelerator-compost', p: 'p558', ean: '5065000398538', accent: 'verde',
    url: 'https://www.portalia.ro/accelerator-de-compost-1l-nixodor-p558/',
    image: 'accelerator-de-compost.webp', alt: 'Accelerator de compost Nixodor, flacon de 1 L',
    tagline: 'Compost mai repede, fără mirosuri',
    card_text: 'Grăbește compostarea resturilor din gospodărie și reduce mirosul.',
    description: '<p>Acceleratorul de compost Nixodor sprijină și accelerează procesul de compostare a materiilor organice din gospodărie (resturi alimentare, iarbă tăiată, flori ofilite, frunze etc.). Declanșează rapid procesul de fermentare a resturilor biodegradabile, prin hrănirea microorganismelor cu substanțe nutritive, reducând timpul de descompunere și limitând crearea de compuși dăunători.</p>'
      + '<p>Este recomandat pentru fermentația anaerobă (în compostoare închise etanș) și aerobă, cu consum de oxigen. Compostul rezultat reține nutrienții importanți (azotul) și poate fi utilizat pentru îmbogățirea solului din grădină sau pentru plantele din balcon.</p>'
      + '<h3>Ce beneficii oferă</h3><ul><li>Reduce timpul de descompunere a deșeurilor organice</li><li>Reduce semnificativ mirosul neplăcut, până la eliminarea totală</li><li>Creează condiții optime eco-biologice pentru humusul bogat în nutrienți</li><li>Acționează rapid, fermentația începând în câteva zile de la prima aplicare</li><li>Este un produs ecologic, fără aditivi chimici, ușor de aplicat</li></ul>',
    composition: '<p>Produs de fermentație din microorganisme (culturi de Lactobacillus, Saccharomyces, Bifidobacterii și Rhodopseudomonas), melasă din trestie de zahăr și apă. Fără organisme modificate genetic.</p>',
    application: '<ol><li>Se taie în bucăți mici resturile organice, pentru eficientizarea procesului de compostare.</li><li>Se toarnă în compostor 10–50 ml de accelerator de compost la fiecare 1 kg de resturi alimentare.</li><li>Se adaugă 10–50 ml de fiecare dată când se pun resturi alimentare noi în compostor. Se suplimentează cantitatea la nevoie.</li></ol>'
      + '<p>Disponibil în recipiente de 250 ml, 1 L, 5 L și 10 L.</p>'}
];

const FIELDS = ['tagline', 'card_text', 'description', 'composition', 'dosage', 'application', 'storage', 'safety'];
const ins = db.prepare(`INSERT INTO provenance (entity, entity_id, field, source_id, method, certainty, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(entity, entity_id, field, source_id) DO NOTHING`);
const out = [];
for (const L of LINES) {
  const id = lineId(L.legacy);
  const img = media.add(DESIGN, readFileSync(join(EXT, 'portalia-img', `${L.p}.webp`)), {name: L.image, alt: L.alt, legacy_ref: `url:${L.url}#imagine`}).id;
  const data = {accent: L.accent, hero_image_id: img, card_image_id: img};
  for (const f of FIELDS) if (L[f]) data[f] = L[f];
  store.update(DESIGN, 'game', id, data);                                 // gama e ciornă: rămâne nepublicată
  store.update(DESIGN, 'produse', productId(L.p), {ean: L.ean, image_id: img});

  db.prepare(`INSERT INTO sources (kind, url, title, fetched_at, method, snapshot_file, status, created_at) VALUES ('external', ?, ?, ?, 'crawl', ?, 200, ?)
    ON CONFLICT(url) DO NOTHING`).run(L.url, `Portalia — ${L.alt}`, nowIso(), `external/portalia-${L.p}.html`, nowIso());
  const sid = db.prepare('SELECT id FROM sources WHERE url = ?').get(L.url).id;
  for (const f of ['description', 'composition', 'dosage', 'application', 'storage', 'safety', 'hero_image_id'].filter(f => data[f])) ins.run('game', id, f, sid, 'copiat din „Descriere produs”', 'confirmed', nowIso());
  for (const f of ['tagline', 'card_text']) ins.run('game', id, f, sid, 'rezumat scris de noi după descriere', 'unverified', nowIso());
  ins.run('produse', productId(L.p), 'ean', sid, 'GTIN din datele structurate ale paginii', 'confirmed', nowIso());
  out.push(`${L.legacy} → game:${id}`);
}
console.log(JSON.stringify(out));
app.stop();
