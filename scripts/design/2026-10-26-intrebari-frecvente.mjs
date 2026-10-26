// Întrebări frecvente pentru cele 8 game (26.10.2026): întrebările pe care și le pune cineva înainte să cumpere,
// cu răspunsuri luate doar din ce știm deja despre produs (etichetă, descriere, dozare, păstrare, siguranță).
// Se salvează ca ciorne: site-ul rămâne neschimbat până la „Publică” (gamele cer aprobare).
import {createApp} from '../../src/app.mjs';
import {PERMS} from '../../src/registry/entities.mjs';
import {nowIso} from '../../src/core/db.mjs';

const DESIGN = {name: 'Claude (design)', role: 'admin', perms: new Set(PERMS.admin)};
const app = createApp({live: false});
const {store, db} = app;

const FAQ = {
  'gama:bioactivator': [
    {q: 'Cât Bioactivator folosesc pe săptămână?', a: 'Pentru o gospodărie unifamilială, 200 ml pe săptămână; pentru o gospodărie multifamilială, 500 ml pe săptămână. În prima săptămână folosești o cantitate triplă. Dacă apele uzate sunt mai multe decât de obicei, crește doza până obții efectul dorit.'},
    {q: 'Cum îl pun în fosă?', a: 'Îl torni direct în stația de epurare sau, la fosele septice, odată cu apa de la toaletă ori de la chiuvetă.'},
    {q: 'Merge și la stația de epurare sau la haznă?', a: 'Da. Bioactivatorul se folosește în fose septice, stații de epurare și haznale.'},
    {q: 'Pot folosi apa rezultată în grădină?', a: 'Da, apa rezultată poate fi folosită la irigarea grădinii.'},
    {q: 'Cât timp se păstrează?', a: 'Minimum 12 luni de la data fabricației, într-un loc răcoros și ferit de lumină (+8 °C – +23 °C). După ce deschizi recipientul, folosește produsul cât mai repede. Dacă îi observi schimbări de culoare sau de miros, nu-l mai folosi.'},
    {q: 'În ce cantități se vinde?', a: 'În recipiente de 1 L, 5 L, 10 L și 25 L.'}
  ],
  'gama:felina': [
    {q: 'Din ce e făcut nisipul Felina?', a: 'Din trei ingrediente naturale: zeolit, bentonită și bacterii active. Nu conține aditivi sau compuși chimici.'},
    {q: 'E sigur pentru pisică?', a: 'Da. Felina nu provoacă alergii, nici oamenilor, nici animalelor, nu e toxic și nu e iritant. Nu există riscul ca pisica să se îmbolnăvească dacă îl înghite din greșeală.'},
    {q: 'Cum oprește mirosul?', a: 'Zeolitul și bentonita absorb lichidele, iar bacteriile active elimină natural mirosurile neplăcute, în loc să le acopere cu un parfum.'},
    {q: 'Ce fac cu nisipul folosit?', a: 'Nisipul se curăță ușor, iar cel folosit poate fi folosit ca îngrășământ.'},
    {q: 'În ce cantități se vinde?', a: 'În cutii de carton de 5 kg și de 10 kg.'}
  ],
  'gama:aer-curat-pets': [
    {q: 'Pentru ce animale e potrivit Aer Curat Pets?', a: 'Pentru animalele de companie: câini, pisici, iepuri sau hamsteri.'},
    {q: 'Cât folosesc?', a: 'Pentru igienizare, la câini și pisici 50–100 ml pe metru pătrat, prin pulverizare, o dată la 7–10 zile; la iepuri și hamsteri, 25–50 ml pe metru pătrat. Ține cont și de numărul de animale din spațiul respectiv.'},
    {q: 'Îl pot pulveriza pe blana animalului?', a: 'Da, dacă blana a intrat în contact cu fecalele: produsul reduce mirosul neplăcut.'},
    {q: 'Pot folosi produsul pe canapea sau pe covor?', a: 'Nu. Produsul are culoare maro și nu se aplică pe materiale textile.'},
    {q: 'Cât timp se păstrează?', a: 'Minimum 18 luni de la data fabricației, într-un loc răcoros și ferit de lumină (+8 °C – +23 °C).'}
  ],
  'gama:aer-curat': [
    {q: 'Unde folosesc Aer Curat în gospodărie?', a: 'În toate spațiile cu mirosuri de la animale domestice sau de companie: cotețe, cocini, staule, grajduri, hambare și anexe, plus locul în care depozitezi gunoiul din curte.'},
    {q: 'Cât folosesc în coteț sau în cocină?', a: 'Prin pulverizare, 50–100 ml pe metru pătrat în cotețele de păsări și 1,1 L pe metru pătrat în cocini și staule.'},
    {q: 'Cum tratez dejecțiile?', a: 'Doza se calculează la metru cub și se aplică o dată la 3 săptămâni, în locul în care se depozitează deșeurile: 1,5 L pentru dejecții de porcine sau bovine, 2 L pentru dejecții de păsări. Peste dejecțiile solide se pulverizează 1 L; în dejecțiile lichide se amestecă 25 L cu 2 zile înainte de evacuare.'},
    {q: 'Ajută și împotriva muștelor?', a: 'Da. Îmbunătățește climatul din adăposturile animalelor și reduce infestarea cu muște.'},
    {q: 'În ce cantități se vinde?', a: 'În sticle de 500 ml și 1 L și în bidoane de 5 L și 10 L, simplu sau cu parfum de lavandă ori pin.'}
  ],
  'gama:aer-curat-industrial': [
    {q: 'În ce spații se folosește Aer Curat industrial?', a: 'În restaurante, hoteluri, hale de producție, spălătorii auto, ferme, stații de epurare, gropi de gunoi și alte spații industriale sau comerciale.'},
    {q: 'Cum îl folosesc în scurgeri și canalizări?', a: 'Agiți bine, torni 50–200 ml direct în scurgerile mari, canalizări sau conducte industriale și lași produsul să acționeze 1–2 ore. La mirosuri puternice, îl poți lăsa peste noapte. După aceea, clătești cu apă.'},
    {q: 'Cum îl folosesc pe suprafețe?', a: 'În zonele unde se adună mirosurile (depozite, zone de colectare a deșeurilor), îl pulverizezi cu atomizorul, câte 20–50 ml pe metru pătrat, în funcție de spațiu, de intensitatea mirosului și de anotimp.'},
    {q: 'Pătează?', a: 'Poate păta, pentru că produsul are culoare maro. Evită textilele și pereții fără protecție și testează-l întâi pe o suprafață mică.'},
    {q: 'Cât timp se păstrează?', a: 'Minimum 18 luni de la data fabricației, într-un loc răcoros și ferit de lumină (+8 °C – +23 °C).'}
  ],
  'gama:aer-curat-cai': [
    {q: 'Cum îl folosesc în grajd?', a: 'Pentru igienizare, 1 L la 10 metri pătrați, o dată la două săptămâni. Pentru descompunerea deșeurilor, 1 L pe metru cub, o dată la 3 săptămâni, în locul în care se adună. Ca reper, o zonă de 10 m² are de obicei în jur de 1 m³ de deșeuri.'},
    {q: 'Cum tratez bălegarul?', a: 'Peste bălegarul solid pulverizezi 1 L pe metru cub. În bălegarul lichid amesteci 25 L la 100 de metri cubi, ideal cu 2 zile înainte de evacuare.'},
    {q: 'Ajută împotriva muștelor?', a: 'Da. Îmbunătățește climatul din grajd și reduce infestarea cu muște.'},
    {q: 'Lasă reziduuri chimice?', a: 'Nu. E un produs 100% natural, cu bacterii lactice și extracte de plante, fără reziduuri chimice.'},
    {q: 'În ce cantitate se vinde?', a: 'În canistre de 5 L.'}
  ],
  'gama:degresor': [
    {q: 'Cât Degresor folosesc acasă?', a: 'Pentru 1–2 persoane, 400–600 ml la prima utilizare (desfundare), apoi 200 ml pe săptămână. Pentru mai mult de 2 persoane, 1,5 L la prima utilizare, apoi 500 ml pe săptămână.'},
    {q: 'Merge și la toaletele ecologice?', a: 'Da. La prima utilizare pui 600 ml, apoi, pentru întreținere, 200 ml diluați în 5 L de apă.'},
    {q: 'Îl pot folosi împreună cu Bioactivatorul în fosa septică?', a: 'Da. Degresorul e compatibil cu flora bacteriană anaerobă din fosă. Nu folosi însă dezinfectanți chimici în primele 12–24 de ore după aplicare.'},
    {q: 'Se poate folosi în restaurante sau hoteluri?', a: 'Da. Pentru desfundare, 500–1000 ml pe zi, 3–5 zile la rând; pentru întreținere, 500 ml pe săptămână în toaletă, chiuvetă sau fosă.'},
    {q: 'Cât timp se păstrează?', a: '24 de luni de la data fabricației, la 5–25 °C, ferit de îngheț și de lumina directă.'}
  ],
  'gama:accelerator-compost': [
    {q: 'Cât accelerator pun în compostor?', a: 'Între 10 și 50 ml la fiecare kilogram de resturi, de fiecare dată când adaugi resturi noi. Dacă e nevoie, poți pune mai mult.'},
    {q: 'În cât timp vede efectul?', a: 'Fermentația începe în câteva zile de la prima aplicare.'},
    {q: 'Merge într-un compostor închis?', a: 'Da. E potrivit atât pentru compostoarele închise etanș (fermentație anaerobă), cât și pentru compostarea cu aer (aerobă).'},
    {q: 'Ce pot composta?', a: 'Resturi alimentare, iarbă tăiată, frunze și flori ofilite. Le tai în bucăți mici, ca să se descompună mai repede.'},
    {q: 'Conține chimicale sau organisme modificate genetic?', a: 'Nu. E un produs de fermentație din microorganisme, melasă din trestie de zahăr și apă, fără aditivi chimici și fără organisme modificate genetic.'}
  ]
};

const sid = (() => {
  db.prepare(`INSERT INTO sources (kind, url, title, fetched_at, method, status, created_at) VALUES ('manual', ?, ?, ?, 'redactare', 200, ?) ON CONFLICT(url) DO NOTHING`)
    .run('manual:intrebari-frecvente-2026-10-26', 'Întrebări frecvente NIXODOR (din eticheta și descrierea fiecărei game)', nowIso(), nowIso());
  return db.prepare(`SELECT id FROM sources WHERE url = 'manual:intrebari-frecvente-2026-10-26'`).get().id;
})();
const prov = db.prepare(`INSERT INTO provenance (entity, entity_id, field, source_id, method, certainty, created_at) VALUES ('game', ?, 'faq', ?, 'scris de noi din datele gamei', 'unverified', ?)
  ON CONFLICT(entity, entity_id, field, source_id) DO NOTHING`);

const out = [];
for (const [legacy, faq] of Object.entries(FAQ)) {
  const id = db.prepare('SELECT id FROM product_lines WHERE legacy_ref = ?').get(legacy).id;
  const r = store.update(DESIGN, 'game', id, {faq});                    // publicată → ciornă
  prov.run(id, sid, nowIso());
  out.push(`game:${id} ${faq.length} întrebări${r._draft ? ', ciornă' : ''}`);
}
console.log(JSON.stringify(out));
app.stop();
