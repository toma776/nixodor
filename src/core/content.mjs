// Textul bogat: vocabular fix (§1.8), jetoane pentru valori (§1.6 a), mențiuni de entități (§1.6 b).

export const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const stripTags = html => String(html ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8211;/g, '–').replace(/&#8217;/g, '’').replace(/\s+/g, ' ').trim();
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);

export const slugify = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);

const ALLOWED = {
  h2: [], h3: [], h4: [], p: [], ul: [], ol: [], li: [], blockquote: [], figure: [], figcaption: [],
  table: [], thead: [], tbody: [], tr: [], th: ['colspan', 'rowspan'], td: ['colspan', 'rowspan'],
  a: ['href', 'data-ref', 'data-media'], img: ['src', 'alt', 'data-media', 'width', 'height'],
  strong: [], em: [], b: [], i: [], br: [], hr: [], span: ['data-validat']
};
const VOID = new Set(['img', 'br', 'hr']);

// Scoate tot ce nu e conținut: clase, stiluri, scripturi, cadre, machete lipite din alt site.
export function sanitizeContent(html) {
  if (!html) return '';
  let s = String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|form|noscript|svg|button|select|textarea)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<h1\b/gi, '<h2').replace(/<\/h1>/gi, '</h2>')
    .replace(/<h[56]\b/gi, '<h4').replace(/<\/h[56]>/gi, '</h4>');
  s = s.replace(/<\/?([a-zA-Z][\w-]*)\b([^>]*)>/g, (m, tag, attrs) => {
    tag = tag.toLowerCase();
    if (!(tag in ALLOWED)) return '';
    if (m.startsWith('</')) return VOID.has(tag) ? '' : `</${tag}>`;
    const keep = [];
    for (const [, name, , v1, v2, v3] of attrs.matchAll(/([\w-]+)(\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      const n = name.toLowerCase(), v = v1 ?? v2 ?? v3 ?? '';
      if (!ALLOWED[tag].includes(n)) continue;
      if ((n === 'href' || n === 'src') && /^\s*(javascript|data|vbscript):/i.test(v)) continue;
      keep.push(`${n}="${v.replace(/"/g, '&quot;')}"`);
    }
    return `<${tag}${keep.length ? ' ' + keep.join(' ') : ''}>`;
  });
  return s.replace(/<(p|span|strong|em|b|i)>\s*<\/\1>/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

// --- Valori legate --------------------------------------------------------
// Variantele unui telefon: 0760 759 889, 0760759889, 0760.759.889, +40760759889, +40 760 759 889.
export function phonePattern(phone) {
  const digits = String(phone).replace(/\D/g, '').replace(/^40/, '0');
  if (digits.length < 9) return null;
  const rest = digits.slice(1).split('').join('[ .\\-]?');
  return new RegExp(`(?<![\\d+])(?:\\+?40[ .\\-]?|0)${rest}(?!\\d)`, 'g');
}

export const TOKENS = {
  telefon: {entity: 'firma', field: 'phone', format: v => v},
  email: {entity: 'firma', field: 'email', format: v => v},
  firma: {entity: 'firma', field: 'legal_name', format: v => v},
  adresa: {entity: 'firma', field: 'address', format: v => v},
  marca: {entity: 'firma', field: 'brand', format: v => v},
  an: {entity: null, format: () => String(new Date().getFullYear())}
};

// La salvare: valorile scrise de mână care sunt chiar valorile din Date firmă devin jetoane.
// Valorile diferite (alt telefon, alt email) nu se ating: apar în „De făcut” ca greșeli de lămurit.
export function tokenizeValues(html, firma) {
  if (!html || !firma) return {html, replaced: []};
  const replaced = [];
  let out = String(html);
  if (firma.phone) {
    const re = phonePattern(firma.phone);
    out = out.replace(/href="tel:[^"]*"/g, m => re && (re.lastIndex = 0, re.test(m)) ? (replaced.push('telefon'), 'href="tel:{telefon}"') : m);
    if (re) out = out.replace(re, () => (replaced.push('telefon'), '{telefon}'));
  }
  if (firma.email) {
    const e = firma.email.replace(/[.]/g, '\\.');
    out = out.replace(new RegExp(`mailto:${e}`, 'gi'), () => (replaced.push('email'), 'mailto:{email}'))
      .replace(new RegExp(`(?<![\\w.@-])${e}(?![\\w-])`, 'gi'), () => (replaced.push('email'), '{email}'));
  }
  return {html: out, replaced};
}

export function contradictions(html, firma) {
  const text = stripTags(html), out = [];
  const own = firma?.phone ? String(firma.phone).replace(/\D/g, '') : null;
  for (const [m] of text.matchAll(/(?<![\d+])(?:\+40|0)7\d{2}[ .]?\d{3}[ .]?\d{3}(?!\d)/g))
    if (own && m.replace(/\D/g, '').replace(/^40/, '0') !== own) out.push({kind: 'telefon', value: m});
  for (const [m] of text.matchAll(/[\w.-]+@[\w-]+(?:\.[a-z]{2,})+/gi))
    if (firma?.email && m.toLowerCase() !== firma.email.toLowerCase()) out.push({kind: 'email', value: m});
  return out;
}

// --- Mențiuni ------------------------------------------------------------
// Doar nume lungi (≥ 8 caractere sau ≥ 2 cuvinte), cu granițe de cuvânt, fără diacritice.
export const mentionable = name => { const n = norm(name).trim(); return n.length >= 8 || n.split(/\s+/).length >= 2; };

export function findMentions(html, candidates) {
  const text = stripTags(html), plain = norm(text), hits = [];
  for (const c of candidates) {
    for (const name of c.names) {
      if (!mentionable(name)) continue;
      const n = norm(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = new RegExp(`(?<![a-z0-9])${n}(?![a-z0-9])`).exec(plain);
      if (!m) continue;
      hits.push({key: c.key, id: c.id, name, excerpt: text.slice(Math.max(0, m.index - 60), m.index + name.length + 60).trim()});
      break;
    }
  }
  return hits;
}
