// Descrieri proprii NIXODOR pentru cele 8 game (26.10.2026), ca textul să nu mai fie identic cu cel de pe Portalia
// (conținut duplicat). Aceleași fapte, scrise altfel: problema, cum funcționează, unde îl folosești, ce câștigi.
// Datele tehnice (compoziție, dozare, aplicare, păstrare, siguranță) rămân cele de pe etichetă.
// Se salvează ca ciorne: site-ul rămâne neschimbat până la „Publică” (gamele cer aprobare).
import {createApp} from '../../src/app.mjs';
import {PERMS} from '../../src/registry/entities.mjs';
import {nowIso} from '../../src/core/db.mjs';

const DESIGN = {name: 'Claude (design)', role: 'admin', perms: new Set(PERMS.admin)};
const app = createApp({live: false});
const {store, db} = app;

const TEXTS = {
  'gama:bioactivator': '<p>Mirosul de fosă septică apare atunci când materia organică nu se mai descompune cum trebuie: se adună nămol, grăsimi și resturi, iar bacteriile din fosă nu mai fac față. Un parfum doar acoperă mirosul, fără să schimbe ce se întâmplă în fosă.</p>'
    + '<p>NIXODOR Bioactivator aduce în fosă bacterii și enzime active, obținute prin fermentație naturală. Ele descompun grăsimile, uleiurile și materiile organice, așa că mirosul dispare de la sursă, iar nămolul se formează mai greu.</p>'
    + '<h3>Unde îl folosești</h3><ul><li>fose septice</li><li>stații de epurare</li><li>haznale</li></ul>'
    + '<h3>Ce câștigi dacă îl folosești regulat</h3><ul><li>scapi de mirosul neplăcut al fosei</li><li>se adună mai puțin nămol</li><li>fosa sau stația de epurare funcționează mai bine și mai mult timp</li><li>apa rezultată poate fi folosită la irigarea grădinii</li><li>un produs ecologic, fără organisme modificate genetic</li></ul>'
    + '<p>Se folosește simplu: o doză pe săptămână, direct în stație sau odată cu apa de la toaletă ori chiuvetă. Cantitățile exacte sunt la Dozare.</p>',
  'gama:felina': '<p>Litiera e locul din casă care miroase cel mai repede. Felina e un nisip pentru pisici 100% natural, fără aditivi sau compuși chimici, care oprește mirosul în loc să-l parfumeze.</p>'
    + '<p>Totul stă în cele trei ingrediente: zeolitul și bentonita absorb lichidele, iar bacteriile active elimină natural mirosurile neplăcute.</p>'
    + '<h3>Sigur pentru pisică și pentru tine</h3><ul><li>nu provoacă alergii, nici oamenilor, nici animalelor</li><li>nu e toxic și nu e iritant</li><li>nu pune pisica în pericol dacă îl înghite din greșeală</li></ul>'
    + '<h3>Și după folosire</h3><p>Nisipul se curăță ușor, iar cel folosit poate deveni îngrășământ.</p>',
  'gama:aer-curat-pets': '<p>Cu un câine, o pisică, un iepure sau un hamster în casă, mirosul vine din locurile lor: cușca, căsuța, țarcul. Aer Curat Pets e un bioactivator natural, pe bază de bacterii, care descompune cauza mirosului, nu o ascunde sub un parfum.</p>'
    + '<h3>Două lucruri dintr-un singur produs</h3><ul><li><strong>Igienizează</strong> spațiile în care stau animalele de companie: cuști, căsuțe, țarcuri.</li><li><strong>Grăbește descompunerea</strong> fecalelor și pregătește resturile organice pentru compostor.</li></ul>'
    + '<p>Dacă blana animalului a intrat în contact cu fecalele, produsul poate fi pulverizat și pe ea, ca să reducă mirosul.</p>'
    + '<h3>Bine de știut</h3><p>Produsul are culoare maro și nu se aplică pe materiale textile.</p>',
  'gama:aer-curat': '<p>Într-o gospodărie cu animale, mirosul se adună în cotețe, grajduri și cocini și lângă locul în care stă gunoiul. Aer Curat pentru gospodărie e un produs 100% natural, cu un amestec de bacterii și extracte de mentă, salvie și nalbă, care descompune rapid deșeurile organice. Mirosul dispare pentru că dispare sursa lui.</p>'
    + '<h3>Unde îl folosești</h3><ul><li>cotețe de păsări</li><li>cocini și staule</li><li>grajduri, hambare și anexe cu animale</li><li>locul în care depozitezi gunoiul sau dejecțiile</li></ul>'
    + '<h3>Ce câștigi</h3><ul><li>fără mirosul de bălegar și de urină</li><li>mai puține muște</li><li>o microfloră sănătoasă în spațiile animalelor</li><li>fără reziduuri chimice</li></ul>'
    + '<p>Îl găsești în sticle de 500 ml și 1 L și în bidoane de 5 L și 10 L. Nu se aplică pe materiale textile.</p>',
  'gama:aer-curat-industrial': '<p>În restaurante, hoteluri, hale, spălătorii auto sau ferme, mirosurile persistente vin de obicei din materia organică ce se adună în canalizări, scurgeri și containere. Aer Curat pentru uz industrial e un bioactivator care descompune aceste reziduuri: neutralizează mirosul și previne blocajele.</p>'
    + '<h3>Unde îl folosești</h3><ul><li>restaurante, hoteluri și spații comerciale</li><li>hale de producție și spălătorii auto</li><li>ferme, stații de epurare și gropi de gunoi</li><li>canalizări, scurgeri mari și conducte industriale</li><li>containere, echipamente și pardoseli expuse mirosurilor</li></ul>'
    + '<h3>De ce merită</h3><ul><li>acționează rapid, și asupra mirosurilor puternice</li><li>previne blocajele și acumulările din conducte</li><li>economic și sigur pentru instalații și suprafețele de lucru</li></ul>'
    + '<p>Produsul e maro și poate păta textilele sau pereții: testează-l întâi pe o suprafață mică.</p>',
  'gama:aer-curat-cai': '<p>Un grajd curat înseamnă un aer mai bun pentru cai și mai puține muște. Aer Curat pentru cai e un produs 100% natural, cu bacterii lactice și extracte de plante, care lucrează în două locuri deodată: în grajd și în bălegar.</p>'
    + '<h3>În grajd</h3><ul><li>igienizează grajdurile și hambarele și creează o microfloră sănătoasă</li><li>neutralizează mirosul de bălegar și de urină</li><li>reduce infestarea cu muște</li></ul>'
    + '<h3>În bălegar</h3><ul><li>tratează atât bălegarul solid, cât și pe cel lichid</li><li>grăbește descompunerea și îmbunătățește calitatea igienică a bălegarului</li><li>previne formarea crustei și a straturilor plutitoare, așa că bălegarul lichid rămâne fluid</li></ul>'
    + '<p>Fără reziduuri chimice. Se vinde în canistre de 5 L.</p>',
  'gama:degresor': '<p>Grăsimea din chiuvete, conducte și fose se întărește în timp într-o crustă care blochează scurgerea și miroase urât. NIXODOR Degresor e o soluție bioenzimatică super-concentrată: enzimele dizolvă crustele de grăsime și depunerile organice, iar scurgerea rămâne liberă.</p>'
    + '<h3>Unde îl folosești</h3><ul><li>chiuvete și scurgeri</li><li>conducte</li><li>fose septice și toalete ecologice</li><li>bucătării și instalații profesionale: restaurante, hoteluri, fose mari</li></ul>'
    + '<h3>De ce merită</h3><ul><li>previne blocajele și neutralizează mirosurile</li><li>sigur pentru instalații</li><li>compatibil cu bacteriile din fosa septică, deci merge împreună cu NIXODOR Bioactivator</li></ul>'
    + '<p>Prima aplicare, pentru desfundare, e mai mare; apoi ajunge o doză pe săptămână. Cantitățile exacte sunt la Dozare.</p>',
  'gama:accelerator-compost': '<p>Resturile din bucătărie și din grădină devin un compost bun, dar durează și, de multe ori, miros. Acceleratorul de compost NIXODOR hrănește microorganismele care fac compostarea, așa că fermentația pornește în câteva zile de la prima aplicare, iar mirosul scade până dispare.</p>'
    + '<h3>Ce poți composta</h3><ul><li>resturi alimentare</li><li>iarbă tăiată, frunze și flori ofilite</li></ul>'
    + '<h3>De ce merită</h3><ul><li>compostul e gata mai repede</li><li>merge în compostoare închise (fermentație anaerobă) și deschise (aerobă)</li><li>compostul păstrează nutrienții importanți, ca azotul, pentru grădină sau pentru plantele de pe balcon</li><li>produs ecologic, fără aditivi chimici și fără organisme modificate genetic</li></ul>'
    + '<p>Se folosește simplu: 10–50 ml la fiecare kilogram de resturi, de fiecare dată când adaugi resturi noi în compostor.</p>'
};

// proveniența: text scris de noi, pe baza descrierii de până acum (sursa ei rămâne în Brain)
const src = db.prepare(`INSERT INTO sources (kind, url, title, fetched_at, method, status, created_at) VALUES ('manual', ?, ?, ?, 'redactare', 200, ?) ON CONFLICT(url) DO NOTHING`);
src.run('manual:descrieri-proprii-2026-10-26', 'Descrieri proprii NIXODOR (rescrise după textele de pe site-ul vechi și Portalia)', nowIso(), nowIso());
const sid = db.prepare(`SELECT id FROM sources WHERE url = 'manual:descrieri-proprii-2026-10-26'`).get().id;
const prov = db.prepare(`INSERT INTO provenance (entity, entity_id, field, source_id, method, certainty, created_at) VALUES ('game', ?, 'description', ?, 'rescris de noi, aceleași fapte', 'unverified', ?)
  ON CONFLICT(entity, entity_id, field, source_id) DO NOTHING`);

const out = [];
for (const [legacy, description] of Object.entries(TEXTS)) {
  const id = db.prepare('SELECT id FROM product_lines WHERE legacy_ref = ?').get(legacy).id;
  const r = store.update(DESIGN, 'game', id, {description});            // publicată → ciornă; site-ul nu se schimbă
  prov.run(id, sid, nowIso());
  out.push(`game:${id} ${r._draft ? 'ciornă' : 'salvat'}`);
}
console.log(JSON.stringify(out));
app.stop();
