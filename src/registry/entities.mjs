// Registrul entităților: singurul loc în care se declară un tip (standard §0.9, §1.1).
// Din el derivă tabelele, formularele, listele, harta, „Unde apare” și protecția la ștergere.

const bySlug = prefix => ({
  path: r => r.slug ? `${prefix}${r.slug}/` : null,
  match: path => path.startsWith(prefix) && path.endsWith('/') && !path.slice(prefix.length, -1).includes('/')
    ? {field: 'slug', value: path.slice(prefix.length, -1)} : null
});

export const ENTITIES = [
  // --- Firma ---------------------------------------------------------------
  {
    key: 'firma', table: 'company', label: 'Date firmă', one: 'Date firmă', category: 'firma', color: '#5b6770',
    singleton: true, noStatus: true, title: 'brand',
    fields: [
      {key: 'brand', label: 'Marca', type: 'text', required: true},
      {key: 'legal_name', label: 'Denumirea firmei', type: 'text', required: true},
      {key: 'cui', label: 'CUI', type: 'text'},
      {key: 'reg_com', label: 'Nr. Reg. Com.', type: 'text'},
      {key: 'address', label: 'Adresa sediului', type: 'text'},
      {key: 'phone', label: 'Telefon', type: 'phone'},
      {key: 'email', label: 'Email', type: 'email'},
      {key: 'founded_year', label: 'Anul înființării', type: 'int'},
      {key: 'socials', label: 'Rețele sociale', type: 'links'},
      {key: 'logo_id', label: 'Logo', type: 'image'},
      {key: 'logo_light_id', label: 'Logo pe fundal închis', type: 'image'},
      {key: 'tagline', label: 'Descrierea site-ului', type: 'text'}
    ]
  },
  {
    key: 'producatori', table: 'producers', label: 'Producători', one: 'Producător', category: 'produse', color: '#3f7f3a',
    title: 'name', mentions: true,
    fields: [
      {key: 'name', label: 'Nume', type: 'text', required: true, list: true},
      {key: 'address', label: 'Adresă', type: 'text'},
      {key: 'country', label: 'Țara', type: 'text', list: true},
      {key: 'url', label: 'Site', type: 'url'},
      {key: 'technology', label: 'Tehnologia', type: 'text'},
      {key: 'badge_id', label: 'Insigna', type: 'image'},
      {key: 'aliases', label: 'Alte nume', type: 'list'}
    ]
  },

  // --- Produse -------------------------------------------------------------
  {
    key: 'game', table: 'product_lines', label: 'Game de produse', one: 'Gamă', category: 'produse', color: '#7ab929',
    thumb: 'hero_image_id', title: 'name', mentions: true, approval: true,
    public: bySlug('/'),
    linkFields: ['name', 'short_name', 'slug'],
    duplicates: {by: ['name']},
    fields: [
      {key: 'name', label: 'Nume', type: 'text', required: true, max: 120, list: true},
      {key: 'short_name', label: 'Nume scurt (meniu, carduri)', type: 'text'},
      {key: 'slug', label: 'Identificator (adresă)', type: 'slug', from: 'name'},
      {key: 'position', label: 'Ordinea pe site', type: 'int', list: true},
      {key: 'accent', label: 'Culoarea', type: 'select', options: ['verde', 'portocaliu', 'albastru']},
      {key: 'tagline', label: 'Promisiunea', type: 'text'},
      {key: 'card_text', label: 'Textul cardului', type: 'textarea'},
      {key: 'description', label: 'Descriere', type: 'richtext'},
      {key: 'composition', label: 'Compoziție', type: 'richtext'},
      {key: 'dosage', label: 'Dozare', type: 'richtext'},
      {key: 'application', label: 'Aplicare', type: 'richtext'},
      {key: 'storage', label: 'Păstrare și valabilitate', type: 'richtext'},
      {key: 'safety', label: 'Instrucțiuni de siguranță', type: 'richtext'},
      {key: 'faq', label: 'Întrebări frecvente', type: 'faq'},
      {key: 'hero_image_id', label: 'Imaginea principală', type: 'image'},
      {key: 'card_image_id', label: 'Imaginea cardului', type: 'image'},
      {key: 'label_pdf_id', label: 'Eticheta (PDF)', type: 'image'},
      {key: 'video_id', label: 'Clip YouTube (ID)', type: 'text'},
      {key: 'producer_id', label: 'Producător', type: 'ref', target: 'producatori', rel: 'e produsă de', inverseLabel: 'Game'},
      {key: 'benefits', label: 'Beneficii', type: 'refs', target: 'beneficii', ordered: true, rel: 'are beneficiul', inverseLabel: 'Game'},
      {key: 'uses', label: 'Utilizări', type: 'refs', target: 'utilizari', rel: 'rezolvă', inverseLabel: 'Game'},
      // butoanele „Cumpără de la …” ale paginii: un link pe magazin, la nivel de gamă (variantele nu au carduri proprii)
      {key: 'listings', label: 'Unde se vinde', type: 'refs', target: 'magazine', ordered: true, rel: 'se vinde la', inverseLabel: 'Game',
       attrs: [{key: 'url', label: 'Adresa gamei în magazin', type: 'url'}]},
      {key: 'aliases', label: 'Alte nume (pentru detectare în texte)', type: 'list'},
      {key: 'meta_title', label: 'Titlu SEO', type: 'text'},
      {key: 'meta_description', label: 'Descriere SEO', type: 'textarea'}
    ]
  },
  {
    key: 'produse', table: 'products', label: 'Produse', one: 'Produs', category: 'produse', color: '#9ccc5a',
    thumb: 'image_id',
    title: r => [r.name || null, [r.size, r.unit].filter(v => v != null && v !== '').join(' '), r.scent, r.pack].filter(Boolean).join(', '),
    linkFields: ['name', 'size', 'unit', 'scent', 'pack'],
    duplicates: {by: ['line_id', 'size', 'unit', 'scent', 'pack'], exact: true},
    fields: [
      {key: 'line_id', label: 'Gama', type: 'ref', target: 'game', required: true, owned: true, rel: 'aparține gamei', inverseLabel: 'Variante', list: true},
      {key: 'name', label: 'Denumirea comercială', type: 'text', list: true},
      {key: 'size', label: 'Cantitate', type: 'number', list: true},
      {key: 'unit', label: 'Unitate', type: 'select', options: ['ml', 'L', 'kg'], list: true},
      {key: 'scent', label: 'Parfum', type: 'select', options: ['Lavandă', 'Pin']},
      {key: 'pack', label: 'Ambalaj', type: 'select', options: ['flacon', 'bidon', 'cutie carton', 'sac']},
      {key: 'ean', label: 'Cod EAN', type: 'text', unique: true},
      {key: 'image_id', label: 'Imagine', type: 'image'},
      {key: 'listings', label: 'Unde se vinde', type: 'refs', target: 'magazine', rel: 'se vinde la', inverseLabel: 'Produse',
       attrs: [{key: 'url', label: 'Adresa produsului', type: 'url'}, {key: 'external_id', label: 'ID în magazin', type: 'text'}]}
    ]
  },
  {
    key: 'beneficii', table: 'benefits', label: 'Beneficii', one: 'Beneficiu', category: 'produse', color: '#b5d98b',
    thumb: 'icon_id', title: 'text',
    duplicates: {by: ['text']},
    fields: [
      {key: 'text', label: 'Text', type: 'text', required: true, list: true},
      {key: 'icon', label: 'Iconiță (din setul site-ului)', type: 'select', list: true,
       options: ['natural', 'namol', 'durata', 'descompune', 'curatenie', 'miros', 'ingrasamant']},
      {key: 'icon_id', label: 'Insignă (imagine, nefolosită pe site)', type: 'image'}
    ]
  },
  {
    key: 'utilizari', table: 'uses', label: 'Utilizări', one: 'Utilizare', category: 'produse', color: '#4e9a8c',
    title: 'name', mentions: true, public: bySlug('/utilizari/'),
    fields: [
      {key: 'name', label: 'Nume', type: 'text', required: true, list: true},
      {key: 'slug', label: 'Identificator (adresă)', type: 'slug', from: 'name'},
      {key: 'description', label: 'Descriere', type: 'richtext'},
      {key: 'aliases', label: 'Alte nume', type: 'list'}
    ]
  },

  // --- Vânzare -------------------------------------------------------------
  {
    key: 'magazine', table: 'stores', label: 'Magazine', one: 'Magazin', category: 'vanzare', color: '#e8833a',
    thumb: 'logo_id', title: 'name', mentions: true,
    linkFields: ['name', 'url'],
    fields: [
      {key: 'name', label: 'Nume', type: 'text', required: true, list: true},
      {key: 'url', label: 'Pagina brandului în magazin', type: 'url', list: true},
      {key: 'phone', label: 'Telefon', type: 'phone'},
      {key: 'address', label: 'Adresă', type: 'text'},
      {key: 'pickup_url', label: 'Puncte de ridicare', type: 'url'},
      {key: 'position', label: 'Ordinea', type: 'int'},
      {key: 'logo_id', label: 'Logo', type: 'image'}
    ]
  },
  {
    key: 'recenzii', table: 'reviews', label: 'Recenzii', one: 'Recenzie', category: 'vanzare', color: '#f2b36d',
    title: r => r.author ? `${r.author}${r.date ? ' · ' + r.date : ''}` : null,
    noTokens: true,                                   // citatele clienților nu se tokenizează (§1.6 a)
    duplicates: {by: ['author', 'text']},
    fields: [
      {key: 'author', label: 'Autor', type: 'text', required: true, list: true},
      {key: 'text', label: 'Text', type: 'textarea', required: true},
      {key: 'date', label: 'Data', type: 'date', list: true},
      {key: 'rating', label: 'Nota (1–5)', type: 'int'},
      {key: 'line_id', label: 'Gama', type: 'ref', target: 'game', rel: 'despre', inverseLabel: 'Recenzii', list: true},
      {key: 'store_id', label: 'Publicată pe', type: 'ref', target: 'magazine', rel: 'publicată pe', inverseLabel: 'Recenzii'},
      {key: 'source_url', label: 'Adresa recenziei', type: 'url'}
    ]
  },

  // --- Conținut ------------------------------------------------------------
  {
    key: 'pagini', table: 'pages', label: 'Pagini', one: 'Pagină', category: 'continut', color: '#2f74c4',
    title: 'title',
    public: {
      path: r => r.slug === '' ? '/' : r.slug ? `/${r.slug}/` : null,
      match: path => path === '/' ? {field: 'slug', value: ''} : bySlug('/').match(path)
    },
    linkFields: ['title', 'slug'],
    fields: [
      {key: 'title', label: 'Titlu', type: 'text', required: true, list: true},
      {key: 'slug', label: 'Identificator (adresă, gol = acasă)', type: 'slug', from: 'title', allowEmpty: true},
      {key: 'intro', label: 'Introducere', type: 'richtext'},
      {key: 'body', label: 'Conținut', type: 'richtext'},
      {key: 'sections', label: 'Secțiuni', type: 'refs', target: 'sectiuni', ordered: true, owned: true, rel: 'are secțiunea', inverseLabel: 'Pagina'},
      {key: 'meta_title', label: 'Titlu SEO', type: 'text'},
      {key: 'meta_description', label: 'Descriere SEO', type: 'textarea'}
    ]
  },
  {
    key: 'sectiuni', table: 'sections', label: 'Secțiuni', one: 'Secțiune', category: 'continut', color: '#8fb3e0',
    hub: false, title: r => r.title || r.kind,
    fields: [
      {key: 'kind', label: 'Tipul secțiunii', type: 'select', required: true, list: true,
       options: ['hero', 'beneficii', 'carduri-game', 'video', 'recenzii', 'text', 'cta', 'magazine', 'contact', 'insigna-producator', 'articole']},
      {key: 'eyebrow', label: 'Supratitlu', type: 'text', kinds: ['hero', 'beneficii', 'carduri-game', 'video', 'recenzii', 'cta', 'insigna-producator', 'articole', 'magazine']},
      {key: 'title', label: 'Titlu', type: 'text', list: true},
      {key: 'body', label: 'Text', type: 'richtext', kinds: ['hero', 'beneficii', 'carduri-game', 'video', 'text', 'cta', 'contact', 'insigna-producator', 'magazine']},
      {key: 'image_id', label: 'Imagine de fundal', type: 'image', kinds: ['hero', 'video']},
      {key: 'buttons', label: 'Butoane', type: 'links', kinds: ['hero', 'cta', 'articole', 'carduri-game']},
      {key: 'line_id', label: 'Gama', type: 'ref', target: 'game', rel: 'prezintă', inverseLabel: 'Secțiuni', kinds: ['video', 'recenzii', 'hero', 'beneficii']},
      {key: 'producer_id', label: 'Producătorul', type: 'ref', target: 'producatori', rel: 'prezintă', inverseLabel: 'Secțiuni', kinds: ['insigna-producator', 'hero']},
      {key: 'video_id', label: 'Clip YouTube (ID)', type: 'text', kinds: ['video']},
      {key: 'limit', label: 'Câte elemente', type: 'int', kinds: ['recenzii', 'articole']}
    ]
  },
  {
    key: 'articole', table: 'articles', label: 'Articole', one: 'Articol', category: 'continut', color: '#1b4f8f',
    thumb: 'featured_image_id', title: 'title', public: bySlug('/blog/'),
    linkFields: ['title', 'slug', 'featured_image_id', 'excerpt', 'published_at'],
    duplicates: {by: ['title']},
    fields: [
      {key: 'title', label: 'Titlu', type: 'text', required: true, max: 200, list: true},
      {key: 'slug', label: 'Identificator (adresă)', type: 'slug', from: 'title'},
      {key: 'excerpt', label: 'Rezumat', type: 'textarea'},
      {key: 'content', label: 'Conținut', type: 'richtext'},
      {key: 'featured_image_id', label: 'Imaginea articolului', type: 'image'},
      {key: 'author_id', label: 'Autor', type: 'ref', target: 'autori', rel: 'e scris de', inverseLabel: 'Articole', list: true},
      {key: 'categories', label: 'Categorii', type: 'refs', target: 'categorii-blog', rel: 'e în categoria', inverseLabel: 'Articole'},
      {key: 'tags', label: 'Etichete', type: 'refs', target: 'etichete', rel: 'are eticheta', inverseLabel: 'Articole'},
      {key: 'lines', label: 'Game recomandate', type: 'refs', target: 'game', rel: 'recomandă', inverseLabel: 'Articole', sensitive: true},
      {key: 'meta_title', label: 'Titlu SEO', type: 'text'},
      {key: 'meta_description', label: 'Descriere SEO', type: 'textarea'}
    ]
  },
  {
    key: 'autori', table: 'authors', label: 'Autori', one: 'Autor', category: 'continut', color: '#6c8ebf',
    title: 'name',
    fields: [
      {key: 'name', label: 'Nume', type: 'text', required: true, list: true},
      {key: 'slug', label: 'Identificator', type: 'slug', from: 'name'},
      {key: 'bio', label: 'Despre', type: 'textarea'}
    ]
  },
  {
    key: 'categorii-blog', table: 'blog_categories', label: 'Categorii blog', one: 'Categorie', category: 'continut', color: '#4a78b5',
    title: 'name', public: bySlug('/blog/categorii/'),
    linkFields: ['name', 'slug'],
    fields: [
      {key: 'name', label: 'Nume', type: 'text', required: true, list: true},
      {key: 'slug', label: 'Identificator (adresă)', type: 'slug', from: 'name'},
      {key: 'description', label: 'Descriere', type: 'textarea'}
    ]
  },
  {
    key: 'etichete', table: 'tags', label: 'Etichete', one: 'Etichetă', category: 'continut', color: '#a9bfdc',
    title: 'name',
    fields: [
      {key: 'name', label: 'Nume', type: 'text', required: true, list: true},
      {key: 'slug', label: 'Identificator', type: 'slug', from: 'name'}
    ]
  },

  // --- Sistem --------------------------------------------------------------
  {
    key: 'meniuri', table: 'menus', label: 'Meniuri', one: 'Meniu', category: 'sistem', color: '#777',
    noStatus: true, title: 'name',
    fields: [
      {key: 'name', label: 'Nume', type: 'text', required: true, list: true},
      {key: 'code', label: 'Cod (antet, subsol)', type: 'slug', unique: true, list: true},
      {key: 'items', label: 'Elemente', type: 'links'}
    ]
  },
  {
    key: 'redirecturi', table: 'redirects', label: 'Redirecționări', one: 'Redirecționare', category: 'sistem', color: '#999',
    noStatus: true, title: 'from_path',
    linkFields: ['from_path', 'to_path', 'to_ref'],    // §3.4: destinația contează pentru linkurile care trec prin ea
    fields: [
      {key: 'from_path', label: 'De la', type: 'text', required: true, unique: true, list: true},
      {key: 'to_ref', label: 'Spre entitatea', type: 'text', list: true},     // ref:game:1 — rezistă la schimbarea adresei
      {key: 'to_path', label: 'Spre adresa', type: 'text', list: true},
      {key: 'code', label: 'Cod', type: 'int'},
      {key: 'auto', label: 'Creată automat', type: 'boolean', readonly: true}
    ]
  },
  {
    key: 'media', table: 'media', label: 'Media', one: 'Fișier', category: 'sistem', color: '#b0b0b0',
    noStatus: true, title: 'name', thumb: 'id',
    fields: [
      {key: 'name', label: 'Nume', type: 'text', required: true, list: true},
      {key: 'alt', label: 'Text alternativ', type: 'text', list: true},
      {key: 'mime', label: 'Tip', type: 'text', readonly: true, list: true},
      {key: 'size', label: 'Mărime (octeți)', type: 'int', readonly: true},
      {key: 'width', label: 'Lățime', type: 'int', readonly: true},
      {key: 'height', label: 'Înălțime', type: 'int', readonly: true},
      {key: 'sha1', label: 'Amprenta', type: 'text', unique: true, readonly: true, intern: true},
      {key: 'file', label: 'Fișier', type: 'text', readonly: true, intern: true}
    ]
  }
];

export const BY_KEY = Object.fromEntries(ENTITIES.map(e => [e.key, e]));
export const entity = key => BY_KEY[key] ?? (() => { throw Object.assign(new Error(`tip necunoscut: ${key}`), {status: 404}); })();

export const titleOf = (e, rec) => rec ? String((typeof e.title === 'function' ? e.title(rec) : rec[e.title]) ?? `${e.one} ${rec.id}`) : '';
export const pathOf = (e, rec) => e.public && rec ? e.public.path(rec) : null;
export const linkFieldsOf = e => e.linkFields ?? [typeof e.title === 'string' ? e.title : null, 'slug'].filter(Boolean);
export const refFields = e => e.fields.filter(f => f.type === 'ref' || f.type === 'image');
export const relFields = e => e.fields.filter(f => f.type === 'refs');
export const relTable = (e, f) => `rel_${e.table}_${f.key}`;
export const targetOf = f => f.type === 'image' ? 'media' : f.target;

// Relațiile, declarate o singură dată din capătul care le deține; inversul se calculează (§2.1).
export const RELATION_TYPES = ENTITIES.flatMap(e => e.fields.filter(f => ['ref', 'refs', 'image'].includes(f.type)).map(f => ({
  id: `${e.key}.${f.key}`, source: e.key, field: f.key, target: targetOf(f),
  verb: f.rel ?? (f.type === 'image' ? 'afișează imaginea' : 'trimite la'), inverseLabel: f.inverseLabel ?? e.label,
  cardinality: f.type === 'refs' ? 'M:N' : 'N:1', required: !!f.required, owned: !!f.owned, sensitive: !!f.sensitive,
  storage: f.type === 'refs' ? relTable(e, f) : `${e.table}.${f.key}`, label: f.label
})));
export const inverseRelations = key => RELATION_TYPES.filter(r => r.target === key);

export const LINK_REF = /^ref:([a-z-]+):(\d+)([?#].*)?$/;
export const RESERVED_SLUGS = new Set(['manage', 'api', 'media', 'blog', 'utilizari', 'sitemap.xml', 'robots.txt', 'assets']);

export const PERMS = {
  admin: ['content.read', 'content.write', 'content.publish', 'content.approve', 'content.delete', 'media.read', 'media.write',
    'settings.write', 'users.write', 'backups.create', 'backups.download', 'backups.restore'],
  editor: ['content.read', 'content.write', 'content.publish', 'media.read', 'media.write'],
  viewer: ['content.read', 'media.read']
};
