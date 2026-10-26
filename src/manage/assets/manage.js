// /manage: formularele trimit JSON la /api/manage; panourile ascultă modificările live (SSE).
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);

async function call(method, url, body) {
  const res = await fetch(url, {method, headers: {'content-type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? res.statusText), {data, status: res.status});
  return data;
}

function show(html, kind = 'ok') {
  const el = $('#result') ?? document.body.appendChild(Object.assign(document.createElement('div'), {id: 'result'}));
  el.className = `result ${kind}`;
  el.innerHTML = html;
  el.scrollIntoView({behavior: 'smooth', block: 'nearest'});
}

function showError(e) {
  let html = `<b>${esc(e.message)}</b>`;
  if (e.data?.errors) html += `<ul>${e.data.errors.map(x => `<li><code>${esc(x.field)}</code>: ${esc(x.error)}</li>`).join('')}</ul>`;
  if (e.data?.usage) html += `<p>Folosit în:</p><ul>${e.data.usage.map(u => `<li><a href="/manage/entitati/${u.key}/${u.id}/">${esc(u.title)}</a> <small>${esc(u.via)}</small></li>`).join('')}</ul>`;
  if (e.status === 409 && e.data?.current) html += `<p>Altcineva a salvat între timp (${esc(e.data.current.updated_by)}, ${esc(e.data.current.updated_at)}). <a href="">Reîncarcă</a> ca să vezi ce s-a schimbat.</p>`;
  show(html, 'err');
}

// „Etichetă | destinație | buton”, copiii cu „- ” în față
function parseLinks(text) {
  const root = [], stack = [{depth: -1, children: root}];
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    const depth = (raw.match(/^(- )*/)[0].length) / 2;
    const [label, to, flag] = raw.replace(/^(- )*/, '').split('|').map(s => s.trim());
    const item = {label, to: to || null, ...(flag === 'buton' ? {button: true} : {})};
    while (stack[stack.length - 1].depth >= depth) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent.item) (parent.item.children ??= []).push(item); else root.push(item);
    stack.push({depth, item});
  }
  return root;
}

function formData(form) {
  const data = {};
  for (const el of $$('[name]', form)) {
    if (el.readOnly || el.disabled) continue;
    const t = el.dataset.type;
    if (t === 'boolean') data[el.name] = el.checked;
    else if (t === 'list') data[el.name] = el.value.split('\n').map(s => s.trim()).filter(Boolean);
    else if (t === 'links') data[el.name] = parseLinks(el.value);
    else if (t === 'json') data[el.name] = el.value.trim() ? JSON.parse(el.value) : null;
    // întrebări frecvente: blocuri despărțite de un rând gol; primul rând e întrebarea, restul răspunsul
    else if (t === 'faq') data[el.name] = el.value.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).map(b => { const [q, ...a] = b.split('\n'); return {q: q.trim(), a: a.join(' ').trim()}; });
    else if (t === 'int' || t === 'number') data[el.name] = el.value === '' ? null : Number(el.value);
    else data[el.name] = el.value;
  }
  return data;
}

function observations(list) {
  return list?.length ? `<ul class="todo">${list.map(t => `<li class="i-${t.impact}"><span class="impact">${t.impact}</span>${esc(t.text)}</li>`).join('')}</ul>` : '<p>Nicio observație.</p>';
}

// secțiunile: arată doar câmpurile tipului ales
function kindFilter(form) {
  const kind = $('[name="kind"]', form);
  if (!kind) return;
  const apply = () => $$('.field[data-kinds]', form).forEach(f => { f.hidden = kind.value && !f.dataset.kinds.split(' ').includes(kind.value); });
  kind.addEventListener('change', apply);
  apply();
}

document.addEventListener('DOMContentLoaded', () => {
  const form = $('#entity-form');
  if (form) {
    kindFilter(form);
    const camp = new URLSearchParams(location.search).get('camp');
    if (camp) { const f = $(`.field[data-field="${camp}"]`); if (f) { f.classList.add('focus'); f.scrollIntoView({block: 'center'}); $('[name]', f)?.focus(); } }
  }
  const key = form?.dataset.key ?? $('[data-entity]')?.dataset.entity.split(':')[0];
  const id = form?.dataset.id || $('[data-entity]')?.dataset.entity.split(':')[1];
  const base = `/api/manage/entities/${key}/${id}`;

  document.addEventListener('click', async ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    try {
      const a = b.dataset.action;
      if (a === 'save' || a === 'save-publish') {
        ev.preventDefault();
        const r = await call('PUT', base, {data: formData(form), version: +form.dataset.version, publish: a === 'save-publish'});
        form.dataset.version = r.record.version;
        show(`<b>${r.draft ? 'Salvat în ciornă — site-ul e neschimbat până la publicare.' : 'Salvat.'}</b>${r.inferred?.length ? `<p>${r.inferred.length} legături deduse noi, de verificat.</p>` : ''}<h4>Observații</h4>${observations(r.observations)}`);
        return;
      }
      if (a === 'create' || a === 'create-publish') {
        const r = await call('POST', `/api/manage/entities/${form.dataset.key}`, {data: formData(form), publish: a === 'create-publish'});
        location.href = `/manage/entitati/${form.dataset.key}/${r.record.id}/`;
        return;
      }
      if (a === 'publish') { await call('POST', `${base}/publish`); location.reload(); return; }
      if (a === 'status') { await call('POST', `${base}/status`, {status: b.dataset.status}); location.reload(); return; }
      if (a === 'delete') { if (!confirm('Ștergi înregistrarea? Rămâne în Istoric.')) return; await call('DELETE', base); location.href = `/manage/entitati/${key}/`; return; }
      if (b.dataset.post) { await call('POST', b.dataset.post, b.dataset.body ? JSON.parse(b.dataset.body) : {}); location.reload(); return; }

      // relații
      const rel = b.closest('.rel');
      if (rel) {
        const field = rel.dataset.field, li = b.closest('li');
        let items = $$('ol.links > li', rel).map(x => ({id: +x.dataset.id, status: x.dataset.status, ...(x.dataset.attrs ? {attrs: JSON.parse(x.dataset.attrs)} : {})}));
        if (b.hasAttribute('data-link-status')) { await call('PUT', `${base}/links/${field}/${li.dataset.id}/status`, {status: b.dataset.linkStatus}); location.reload(); return; }
        if (b.hasAttribute('data-remove')) items = items.filter(x => x.id !== +li.dataset.id);
        if (b.dataset.move) { const i = items.findIndex(x => x.id === +li.dataset.id), j = i + +b.dataset.move; if (j >= 0 && j < items.length) [items[i], items[j]] = [items[j], items[i]]; }
        if (b.hasAttribute('data-add')) { const v = +$('.add select', rel).value; if (v) items.push({id: v, status: 'confirmed'}); }
        const r = await call('PUT', `${base}/links/${field}`, {items});
        if (r.live) sessionStorage.setItem('nx-live-note', 'Legăturile s-au schimbat direct pe site (nu trec prin ciornă).');
        location.reload();
        return;
      }
      // legături de verificat, în masă
      const box = b.closest('.inferred');
      if (box && b.dataset.bulk) {
        const pairs = $$('tr[data-pair]', box).filter(tr => $('input', tr).checked).map(tr => tr.dataset.pair.split(':').map(Number));
        await call('POST', `/api/manage/inferred/${box.dataset.relation}`, {pairs, status: b.dataset.bulk});
        location.reload();
      }
    } catch (e) { showError(e); }
  });

  // tot rândul din liste e un link; filtrul de stare se aplică la alegere; meniul „⋯” se închide la un clic în afară
  document.addEventListener('click', ev => {
    const tr = ev.target.closest('tr[data-href]');
    if (tr && !ev.target.closest('a, button, input')) location.href = tr.dataset.href;
    $$('details.menu[open]').forEach(d => { if (!d.contains(ev.target)) d.open = false; });
  });
  $$('[data-autosubmit]').forEach(s => s.addEventListener('change', () => s.form.submit()));

  const note = sessionStorage.getItem('nx-live-note');
  if (note) { sessionStorage.removeItem('nx-live-note'); show(`<b>${esc(note)}</b>`); }

  // traseul pe hartă
  const pf = $('.path-form');
  pf?.addEventListener('submit', async ev => {
    ev.preventDefault();
    const fd = new FormData(pf);
    try {
      const r = await call('GET', `/api/manage/graph/path?from=${encodeURIComponent(fd.get('from'))}&to=${encodeURIComponent(fd.get('to'))}`);
      $('#path-result').innerHTML = r ? `<p>${r.length} pași:</p><ol>${r.steps.map(s => `<li>${s.verb ? `<small>${esc(s.verb)}</small> ` : ''}<a href="?node=${s.node}">${esc(s.title)}</a></li>`).join('')}</ol>` : '<p>Niciun traseu în cel mult 6 pași.</p>';
    } catch (e) { $('#path-result').textContent = e.message; }
  });

  // filtrul tabelului „Toate legăturile”
  $('.filter-table')?.addEventListener('input', e => { const v = e.target.value.toLowerCase(); $$('#edges tbody tr').forEach(tr => { tr.hidden = !tr.textContent.toLowerCase().includes(v); }); });

  // hover pe hartă: se aprind doar legăturile grupului
  $$('.tnode').forEach(g => {
    g.addEventListener('mouseenter', () => { document.body.classList.add('focus-map'); $$(`.edge[data-src="${g.dataset.key}"], .edge[data-dst="${g.dataset.key}"]`).forEach(e => e.classList.add('lit')); });
    g.addEventListener('mouseleave', () => { document.body.classList.remove('focus-map'); $$('.edge.lit').forEach(e => e.classList.remove('lit')); });
  });

  // modificări live de la alți utilizatori
  if (window.EventSource) {
    const es = new EventSource('/api/manage/events');
    const mine = Date.now();
    es.onmessage = m => {
      const d = JSON.parse(m.data);
      if (Date.now() - mine < 1500 || d.user === document.body.dataset.user) return;
      const banner = $('#live-banner');
      const here = key && id && d.key === key && String(d.id) === String(id);
      if (!here && location.pathname !== '/manage/') return;
      banner.hidden = false;
      banner.innerHTML = `S-a modificat ${esc(d.label ?? '')} (${esc(d.action)}) de ${esc(d.user ?? '?')} — <a href="">reîncarcă</a>`;
    };
  }
});
