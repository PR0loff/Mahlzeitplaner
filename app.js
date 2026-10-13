'use strict';
// ---------- Konfiguration ----------
const MIN_RATING = 4;
const MIN_VOTES = 20;
const PAGE = 30;
const BASES = ['/api', 'https://api.chefkoch.de/v2']; // erst lokaler Proxy (server.js), dann direkt
const CATEGORIES = ['Vegetarisch', 'Schnell', 'Pasta', 'Suppe', 'Auflauf', 'Hähnchen', 'Fisch', 'Salat', 'Curry', 'Eintopf'];
const RANDOM_QUERIES = ['Pasta', 'Hähnchen', 'Suppe', 'Auflauf', 'Reis', 'Kartoffeln', 'Gemüse', 'Curry', 'Salat', 'Fisch', 'Eintopf', 'Pfanne', 'Hackfleisch', 'Ofengemüse'];
const WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

// ---------- Zustand ----------
const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignorieren */ } },
};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const state = Object.assign(
  { startDate: iso(new Date()), persons: 2, days: Array.from({ length: 7 }, () => []), active: 0, checked: {}, custom: [], removed: [] },
  store.get('mp-state', {})
);
// Ältere Speicherstände (ein Gericht pro Tag) auf Listen umstellen
state.days = Array.from({ length: 7 }, (_, i) => { const d = state.days[i]; return Array.isArray(d) ? d : d ? [d] : []; });
const details = store.get('mp-details', {}); // Rezept-ID -> {servings, groups}
let search = { query: '', offset: 0, total: Infinity, loading: false };
let workingBase = null;

const save = () => store.set('mp-state', state);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2200); }

// ---------- API ----------
async function api(path) {
  const order = workingBase ? [workingBase, ...BASES.filter((b) => b !== workingBase)] : BASES;
  let lastErr;
  for (const base of order) {
    try {
      const r = await fetch(base + path, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      workingBase = base;
      return data;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Keine Verbindung');
}

function toRecipe(r) {
  const rt = r.rating || {};
  return {
    id: String(r.id), title: r.title || 'Ohne Titel',
    rating: Number(rt.rating) || 0, votes: Number(rt.numVotes) || 0,
    time: r.totalTime || r.preparationTime || 0,
    img: r.previewImageUrlTemplate ? r.previewImageUrlTemplate.replace('<format>', 'crop-360x240') : '',
    url: r.siteUrl || `https://www.chefkoch.de/rezepte/${r.id}/`,
  };
}
const qualifies = (r) => r.rating >= MIN_RATING && r.votes >= MIN_VOTES;

async function fetchPage(query, offset) {
  const d = await api(`/recipes?query=${encodeURIComponent(query)}&limit=${PAGE}&offset=${offset}`);
  const list = (d.results || []).map((x) => toRecipe(x.recipe || x));
  return { list, count: d.count ?? 0 };
}

// ---------- Datum & Plan ----------
function dayInfo(i) {
  const [y, m, d] = state.startDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d + i);
  return { name: WD[dt.getDay()], date: dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) };
}
const stars = (v) => '★'.repeat(Math.round(v)) + '☆'.repeat(5 - Math.round(v));

function nutriLine(id) {
  const d = details[id];
  if (failedIds.has(id)) return '<span class="nutri">Nährwerte nicht verfügbar</span>';
  if (!d || d.v !== 2) return '<span class="nutri">Nährwerte werden geladen …</span>';
  const n = d.nutrition;
  return n ? `<span class="nutri">🔥 ${n.kcal} kcal · ${n.protein} g Eiweiß · ${n.fat} g Fett · ${n.carbs} g KH <i>pro Portion</i></span>`
    : '<span class="nutri">Nährwerte nicht verfügbar</span>';
}

function renderPlan() {
  const first = dayInfo(0), last = dayInfo(6);
  $('#range').textContent = `${first.date} – ${last.date}`;
  $('#days').innerHTML = state.days.map((meals, i) => {
    const di = dayInfo(i);
    const list = meals.length
      ? meals.map((r, k) => `<div class="meal">${r.img ? `<img src="${esc(r.img)}" alt="" loading="lazy">` : ''}<div class="mt">
           <a href="${esc(r.url)}" target="_blank" rel="noopener" title="${esc(r.title)}">${esc(r.title)}</a>
           <span class="rate"><span class="stars">${stars(r.rating)}</span> ${r.rating.toFixed(1)} · ${r.votes} Bewertungen${r.time ? ` · ${r.time} Min.` : ''}</span>
           ${nutriLine(r.id)}</div>
           <button class="icon" data-act="del" data-k="${k}" title="Entfernen">✕</button></div>`).join('')
      : `<span class="empty">+ Gericht wählen</span>`;
    const acts = `<div class="acts">${meals.length ? '<button class="icon" data-act="add" title="Weiteres Gericht hinzufügen">＋</button>' : ''}<button class="icon" data-act="rand" title="Zufälliges Gericht ${meals.length ? 'zusätzlich ' : ''}hinzufügen">🎲</button></div>`;
    return `<div class="day ${i === state.active ? 'active' : ''}" data-i="${i}"><div><div class="dname">${di.name}</div><div class="ddate">${di.date}</div></div><div class="meals">${list}</div>${acts}</div>`;
  }).join('');
  const a = dayInfo(state.active);
  $('#activeHint').textContent = `Gericht für ${a.name}, ${a.date} auswählen:`;
  $('#startDate').value = state.startDate;
  $('#persons').value = state.persons;
}

$('#days').addEventListener('click', async (e) => {
  const day = e.target.closest('.day'); if (!day) return;
  const i = Number(day.dataset.i), act = e.target.closest('[data-act]')?.dataset.act;
  state.active = i;
  if (act === 'del') { state.days[i].splice(Number(e.target.closest('[data-k]').dataset.k), 1); }
  if (act === 'rand') { save(); renderPlan(); await randomInto(i); return; }
  save(); renderPlan(); showTab('search');
  if (!act) $('#query').focus({ preventScroll: true });
  refreshShop();
});

function assign(recipe) {
  state.days[state.active].push(recipe);
  const next = state.days.findIndex((d, i) => !d.length && i !== state.active);
  if (next !== -1) state.active = next;
  save(); renderPlan(); refreshShop();
  toast(`„${recipe.title}“ eingeplant`);
}

// ---------- Suche ----------
function renderCard(r, i) {
  return `<div class="rcard"><img src="${esc(r.img)}" alt="" loading="lazy"><div class="body">
    <div class="title">${esc(r.title)}</div>
    <div class="rate"><span class="stars">${stars(r.rating)}</span> ${r.rating.toFixed(1)} (${r.votes})${r.time ? ` · ${r.time} Min.` : ''}</div>
    <button data-pick="${i}">Einplanen</button></div></div>`;
}
let shown = [];

async function runSearch(query, append = false) {
  if (search.loading) return;
  if (!append) { search = { query, offset: 0, total: Infinity, loading: false }; shown = []; $('#results').innerHTML = ''; }
  search.loading = true;
  $('#status').textContent = 'Suche läuft …'; $('#moreBtn').hidden = true;
  try {
    let found = 0, pages = 0;
    while (found < 12 && search.offset < search.total && pages < 6) {
      const { list, count } = await fetchPage(search.query, search.offset);
      search.total = count; search.offset += PAGE; pages++;
      const ok = list.filter(qualifies).filter((r) => !shown.some((s) => s.id === r.id));
      ok.sort((a, b) => b.rating - a.rating || b.votes - a.votes);
      $('#results').insertAdjacentHTML('beforeend', ok.map((r) => renderCard(r, shown.push(r) - 1)).join(''));
      found += ok.length;
      if (!list.length) { search.total = 0; break; }
    }
    const more = search.offset < search.total;
    $('#moreBtn').hidden = !more;
    $('#status').textContent = shown.length ? `${shown.length} passende Rezepte${more ? ' bisher' : ''}.` : 'Keine Rezepte mit ≥ 4 Sternen und ≥ 20 Bewertungen gefunden.';
  } catch (e) {
    $('#status').innerHTML = `Chefkoch ist nicht erreichbar (${esc(e.message)}). Starte die Seite über <code>start.bat</code> (lokaler Server) und prüfe deine Internetverbindung.`;
  }
  search.loading = false;
}

$('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#query').value.trim(); if (q) runSearch(q); });
$('#moreBtn').addEventListener('click', () => runSearch(search.query, true));
$('#results').addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b) assign(shown[Number(b.dataset.pick)]); });
$('#chips').innerHTML = CATEGORIES.map((c) => `<button type="button" class="chip">${c}</button>`).join('');
$('#chips').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) { $('#query').value = c.textContent; runSearch(c.textContent); } });

// ---------- Zufall ----------
async function randomRecipe() {
  for (let tries = 0; tries < 4; tries++) {
    const q = RANDOM_QUERIES[Math.floor(Math.random() * RANDOM_QUERIES.length)];
    const { list } = await fetchPage(q, Math.floor(Math.random() * 3) * PAGE).catch(() => ({ list: [] }));
    const ok = list.filter(qualifies).filter((r) => !state.days.some((d) => d.some((m) => m.id === r.id)));
    if (ok.length) return ok[Math.floor(Math.random() * ok.length)];
  }
  return null;
}

async function randomInto(i) {
  toast('Suche zufälliges Gericht …');
  try {
    const r = await randomRecipe();
    if (!r) return toast('Nichts Passendes gefunden – nochmal versuchen.');
    state.days[i].push(r); save(); renderPlan(); refreshShop();
  } catch (e) { toast('Chefkoch nicht erreichbar'); }
}
$('#randomWeekBtn').addEventListener('click', async () => {
  const btn = $('#randomWeekBtn'); btn.disabled = true;
  for (let i = 0; i < 7; i++) if (!state.days[i].length) await randomInto(i);
  btn.disabled = false;
});

// ---------- Einkaufsliste ----------
async function ensureDetails(id) {
  if (details[id] && details[id].v === 2) return details[id];
  const d = await api(`/recipes/${id}`);
  const nu = d.nutrition || d.nutritions || null;
  const num = (x) => { const n = Number(String(x ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };
  const nutrition = nu && num(nu.kCalories ?? nu.kcal) ? {
    kcal: num(nu.kCalories ?? nu.kcal), protein: num(nu.proteinContent ?? nu.protein),
    fat: num(nu.fatContent ?? nu.fat), carbs: num(nu.carbohydrateContent ?? nu.carbs),
  } : null;
  details[id] = {
    v: 2, nutrition,
    servings: Number(d.servings) || 1,
    groups: (d.ingredientGroups || []).flatMap((g) => (g.ingredients || []).map((x) => ({
      name: (x.name || '').trim(), unit: (x.unit || '').trim(), amount: Number(x.amount) || 0,
    }))).filter((x) => x.name),
  };
  store.set('mp-details', details);
  return details[id];
}

const fmt = (n) => (Math.round(n * 100) / 100).toString().replace('.', ',');
const failedIds = new Set();
let items = []; // {key, name, text}

// Zutatennamen vereinheitlichen: "Zwiebel(n), gehackt" und "Zwiebeln" -> "zwiebel"
function normName(n) {
  let k = n.toLowerCase().replace(/\(.*?\)/g, '').split(',')[0].trim().replace(/\s+/g, ' ');
  k = k.replace(/(eln|ern)$/, (m) => m.slice(0, -1)).replace(/^eier$/, 'ei');
  return k;
}
// Zutaten, die beim Einkauf dasselbe sind (z. B. Ei, Eier, Eigelb, Eiweiß -> "Eier")
const ALIASES = [
  [/^(ei|eier|eigelbe?|eiweiß(e)?|eiweiss(e)?|eiklar|hühnereier?|vollei(er)?|eidotter)$/, 'ei', 'Eier'],
  [/^(hähnchen|hühnchen|hühner)(brust|brustfilets?|filets?|brüste)$/, 'haehnchenbrust', 'Hähnchenbrust'],
  [/^knoblauch(zehen?)?$/, 'knoblauch', 'Knoblauch'],
  [/^tomaten?$/, 'tomate', 'Tomaten'],
  [/^kartoffeln?$/, 'kartoffel', 'Kartoffeln'],
  [/^zitronen?$/, 'zitrone', 'Zitronen'],
  [/^paprika(schoten?)?$/, 'paprika', 'Paprika'],
  [/^(karotten?|möhren?|mohrrüben?)$/, 'karotte', 'Karotten'],
];
function alias(n) {
  const k = n.toLowerCase().replace(/\(.*?\)/g, '').split(',')[0].trim();
  const hit = ALIASES.find(([re]) => re.test(k));
  return hit ? { key: hit[1], name: hit[2] } : null;
}
function cleanName(n) { return n.replace(/\(.*?\)/g, '').split(',')[0].replace(/\s+/g, ' ').trim() || n; }
// Einheiten vereinheitlichen (kg -> g, l -> ml), damit sie sich aufsummieren lassen
function normUnit(unit, amount) {
  const u = unit.toLowerCase().replace(/\./g, '').trim();
  if (u === 'kg') return { u: 'g', label: 'g', amount: amount * 1000 };
  if (u === 'l' || u === 'liter') return { u: 'ml', label: 'ml', amount: amount * 1000 };
  if (['stück', 'stk', 'st', 'stücke'].includes(u)) return { u: '', label: '', amount };
  return { u, label: unit, amount };
}
function fmtPart(p) {
  let { amount, label } = p;
  if (label === 'g' && amount >= 1000) { amount /= 1000; label = 'kg'; }
  if (label === 'ml' && amount >= 1000) { amount /= 1000; label = 'l'; }
  return amount > 0 ? fmt(amount) + (label ? ' ' + label : '') : '';
}

async function refreshShop() {
  const ids = state.days.flat().map((r) => r.id);
  const status = $('#shopStatus');
  if (!ids.length) { items = []; renderShop(); status.textContent = 'Plane zuerst Gerichte ein – die Einkaufsliste entsteht automatisch.'; return; }
  status.textContent = 'Zutaten werden geladen …';
  const map = new Map(); let failed = 0;
  for (const id of ids) {
    let d;
    try { d = await ensureDetails(id); } catch { failed++; failedIds.add(id); continue; }
    const f = state.persons / d.servings;
    for (const x of d.groups) {
      const al = alias(x.name);
      const key = al ? al.key : normName(x.name);
      const cur = map.get(key) || { key, name: al ? al.name : cleanName(x.name), parts: new Map() };
      if (!al && cleanName(x.name).length < cur.name.length) cur.name = cleanName(x.name);
      const nu = normUnit(x.unit, x.amount * f);
      const part = cur.parts.get(nu.u) || { label: nu.label, amount: 0 };
      part.amount += nu.amount; cur.parts.set(nu.u, part);
      map.set(key, cur);
    }
  }
  items = [...map.values()].map((g) => ({
    key: g.key, name: g.name, cat: categorize(g.name),
    text: [...g.parts.values()].map(fmtPart).filter(Boolean).join(' + '),
  })).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  status.textContent = failed ? `⚠️ Bei ${failed} Rezept(en) konnten die Zutaten nicht geladen werden.` : `Zutaten für ${state.persons} Person(en) aus ${ids.length} Gericht(en), gleiche Zutaten aufsummiert.`;
  renderShop();
  renderPlan(); // Nährwerte sind jetzt geladen
}


// Einkaufs-Kategorien (Reihenfolge wichtig: erste passende gewinnt)
const CATS = [
  ['Gewürze & Kräuter', /salz|pfeffer|pulver|gewürz|curry|zimt|muskat|oregano|thymian|basilikum|petersilie|schnittlauch|rosmarin|koriander|kümmel|kurkuma|lorbeer|chili|vanille|paprika edelsüß|majoran|salbei|dill|minze|kreuzkümmel|cayenne|zucker, braun|piment|nelke|kardamom|safran|bockshorn|ras el|garam|sesam|prise/],
  ['Vorrat & Backen', /kokosmilch|tomatenmark|passierte|mehl|zucker|nudel|reis$|^reis|öl$|^öl|essig|brühe|fond|stärke|backpulver|hefe|paste|soße|sauce|ketchup|senf|pasta|spaghetti|penne|brot|haferflocken|linsen|kichererbsen|couscous|bulgur|honig|sirup|nüsse|mandel|rosinen|schokolade|kakao|konserve|dose|tortilla|maisstärke|sojasoße|wein|bohnen, |semmelbrösel|paniermehl|gelatine|marmelade/],
  ['Fleisch, Fisch & Protein', /fleisch|hähnchen|hühn|pute|rind|schwein|hack|schinken|speck|wurst|würstchen|salami|lachs|fisch|garnele|thunfisch|forelle|lamm|ente|gans|tofu|tempeh|steak|schnitzel|bacon|kasseler|gyros|kabeljau|seelachs|shrimp/],
  ['Milchprodukte & Eier', /^ei$|eier|milch|sahne|käse|butter|joghurt|quark|schmand|mozzarella|parmesan|feta|frischkäse|créme|creme|skyr|margarine|gouda|emmentaler|mascarpone|ricotta|halloumi|schmelz/],
  ['Gemüse & Obst', /zwiebel|knoblauch|tomate|paprika|karotte|möhre|kartoffel|gurke|zucchini|salat|spinat|brokkoli|blumenkohl|lauch|pilz|champignon|kohl|bohne|erbse|mais|aubergine|sellerie|kürbis|rucola|avocado|zitrone|limette|apfel|banane|orange|beere|ingwer|radies|bete|fenchel|kohlrabi|spargel|petersil|frühling|schalotte|mangold|gemüse|obst|ananas|birne|traube|pfirsich|mango|rosenkohl|chicorée|feldsalat|pak choi|knolle/],
];
function categorize(name) {
  const n = name.toLowerCase();
  const hit = CATS.find(([, re]) => re.test(n));
  return hit ? hit[0] : 'Sonstiges';
}
const CAT_ORDER = ['Gemüse & Obst', 'Fleisch, Fisch & Protein', 'Milchprodukte & Eier', 'Gewürze & Kräuter', 'Vorrat & Backen', 'Sonstiges'];
function grouped(list) {
  return CAT_ORDER.map((c) => [c, list.filter((i) => (i.cat || 'Sonstiges') === c)]).filter(([, l]) => l.length);
}

function allItems() {
  return [...items.filter((i) => !state.removed.includes(i.key)), ...state.custom.map((c) => ({ key: 'c|' + c, name: c, text: '', cat: 'Sonstiges' }))];
}
const label = (i) => `${i.text ? i.text + ' ' : ''}${i.name}`;

function renderShop() {
  const list = allItems();
  $('#shopCount').textContent = list.length || '';
  $('#previewInfo').textContent = list.length ? `${list.length} Artikel` : '';
  const groups = grouped(list);
  $('#preview').innerHTML = list.length
    ? groups.map(([c, l]) => `<div class="pgroup"><h3>${esc(c)}</h3><ul>` + l.map((i) => `<li class="${state.checked[i.key] ? 'done' : ''}">${i.text ? `<b>${esc(i.text)}</b> ` : ''}${esc(i.name)}</li>`).join('') + '</ul></div>').join('')
    : '<p class="none">Noch leer – plane Gerichte ein.</p>';
  $('#shopList').innerHTML = groups.map(([c, l]) => `<div class="shopgroup"><h3>${esc(c)}</h3>` + l.map((i) => `<label class="item ${state.checked[i.key] ? 'done' : ''}">
    <input type="checkbox" data-key="${esc(i.key)}" ${state.checked[i.key] ? 'checked' : ''}>
    <span class="amt">${esc(i.text)}</span><span>${esc(i.name)}</span>
    <button type="button" class="rm" data-rm="${esc(i.key)}" title="Entfernen">✕</button></label>`).join('') + '</div>').join('');
}
$('#shopList').addEventListener('click', (e) => {
  const rm = e.target.closest('[data-rm]');
  if (rm) {
    e.preventDefault(); const k = rm.dataset.rm;
    if (k.startsWith('c|')) state.custom = state.custom.filter((c) => 'c|' + c !== k); else state.removed.push(k);
    save(); renderShop();
  }
});
$('#shopList').addEventListener('change', (e) => { const k = e.target.dataset.key; if (k) { state.checked[k] = e.target.checked; save(); renderShop(); } });
$('#addItemForm').addEventListener('submit', (e) => {
  e.preventDefault(); const v = $('#addItem').value.trim(); if (!v) return;
  state.custom.push(v); $('#addItem').value = ''; save(); renderShop();
});

// ---------- Export ----------
function exportText(box = '[ ]') {
  const open = allItems().filter((i) => !state.checked[i.key]);
  const head = `Einkaufsliste (${dayInfo(0).date} – ${dayInfo(6).date}, ${state.persons} Personen)`;
  const meals = state.days.flatMap((m, i) => m.map((r) => `${dayInfo(i).name}: ${r.title}`));
  return `${head}\n\n${grouped(open).map(([c, l]) => c.toUpperCase() + '\n' + l.map((i) => box + ' ' + label(i)).join('\n')).join('\n\n')}\n\nGerichte:\n${meals.join('\n')}\n`;
}
// Notizen (Apple Notizen, Samsung Notes): öffnet das Teilen-Menü, sonst Zwischenablage
$('#notesBtn').addEventListener('click', async () => {
  if (!needItems()) return;
  const text = exportText('☐');
  if (navigator.share) {
    try { await navigator.share({ title: 'Einkaufsliste', text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); toast('Kopiert – jetzt in Notizen einfügen'); } catch { toast('Kopieren nicht möglich'); }
});

// Kalender (.ics): ein ganztägiger Termin je Gericht, Rezept-Link in der Beschreibung
const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function icsFold(line) {
  const enc = new TextEncoder(); const out = []; let cur = '', bytes = 0, limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) { out.push(cur); cur = ''; bytes = 0; limit = 74; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}
function icsDate(offset) {
  const [y, m, d] = state.startDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d + offset);
  return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
}
function buildIcs() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mahlzeitplaner//DE', 'CALSCALE:GREGORIAN'];
  state.days.forEach((meals, i) => meals.forEach((r, k) => lines.push(
    'BEGIN:VEVENT', `UID:${icsDate(i)}-${r.id}-${k}@mahlzeitplaner`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${icsDate(i)}`, `DTEND;VALUE=DATE:${icsDate(i + 1)}`,
    `SUMMARY:${icsEsc(r.title)}`, `DESCRIPTION:${icsEsc(r.url)}`, `URL:${r.url}`, 'TRANSP:TRANSPARENT', 'END:VEVENT')));
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
$('#icsBtn').addEventListener('click', () => {
  if (!state.days.some((m) => m.length)) return toast('Es sind noch keine Gerichte eingeplant');
  download('mahlzeitplaner.ics', buildIcs(), 'text/calendar;charset=utf-8');
});

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const needItems = () => { if (!allItems().length) { toast('Die Einkaufsliste ist leer'); return false; } return true; };
$('#copyBtn').addEventListener('click', async () => {
  if (!needItems()) return;
  try { await navigator.clipboard.writeText(exportText()); toast('In die Zwischenablage kopiert'); } catch { toast('Kopieren nicht möglich'); }
});
$('#txtBtn').addEventListener('click', () => needItems() && download('einkaufsliste.txt', exportText(), 'text/plain;charset=utf-8'));
$('#csvBtn').addEventListener('click', () => {
  if (!needItems()) return;
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [['Kategorie', 'Menge', 'Zutat', 'Erledigt'], ...grouped(allItems()).flatMap(([c, l]) => l.map((i) => [c, i.text, i.name, state.checked[i.key] ? 'ja' : 'nein']))];
  download('einkaufsliste.csv', '﻿' + rows.map((r) => r.map(q).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
});
$('#printBtn').addEventListener('click', () => needItems() && window.print());

// ---------- Steuerung ----------
function showTab(t) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
  $('#tab-search').hidden = t !== 'search'; $('#tab-shop').hidden = t !== 'shop';
}
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
$('#toShop').addEventListener('click', () => { showTab('shop'); $('#tab-shop').scrollIntoView({ behavior: 'smooth' }); });
$('#startDate').addEventListener('change', (e) => { if (e.target.value) { state.startDate = e.target.value; save(); renderPlan(); } });
$('#todayBtn').addEventListener('click', () => { state.startDate = iso(new Date()); save(); renderPlan(); });
$('#persons').addEventListener('change', (e) => { state.persons = Math.min(20, Math.max(1, Number(e.target.value) || 1)); save(); renderPlan(); refreshShop(); });
$('#clearBtn').addEventListener('click', () => {
  if (!confirm('Wochenplan und Einkaufsliste zurücksetzen?')) return;
  Object.assign(state, { days: Array.from({ length: 7 }, () => []), active: 0, checked: {}, custom: [], removed: [] });
  save(); renderPlan(); refreshShop();
});

renderPlan(); refreshShop();
