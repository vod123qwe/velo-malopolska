// Generator bazy tras (rower + spacer) — Małopolska.
// POI: Wikipedia geosearch (notable miejsca + dokładne współrzędne + tag wiki). Geometria: BRouter.
// Zapis: scripts/generated.json
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const UA = 'VeloMalopolska/1.0 (personal route dataset builder)';
const RAD = Math.PI / 180, R = 6371000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function hav(a, b) { const dLat = (b[0] - a[0]) * RAD, dLon = (b[1] - a[1]) * RAD, la1 = a[0] * RAD, la2 = b[0] * RAD; const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
function sampleArr(a, max) { if (a.length <= max) return a; const step = a.length / max, out = []; for (let i = 0; i < max; i++) out.push(a[Math.floor(i * step)]); out.push(a[a.length - 1]); return out; }
async function fetchT(url, opts, ms) { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); try { return await fetch(url, { ...opts, signal: c.signal }); } finally { clearTimeout(t); } }

const WAYTYPE_COL = { 'Ścieżka rowerowa': '#34d07f', 'Ścieżka / szlak': '#f5a623', 'Ulica': '#3aa0ff', 'Droga': '#8b97a3', 'Inne': '#c9d1d9' };
function parseWayTypes(messages) {
  if (!messages || messages.length < 2) return [];
  const head = messages[0], di = head.indexOf('Distance'), wi = head.indexOf('WayTags'); if (di < 0 || wi < 0) return [];
  const g = {};
  for (let r = 1; r < messages.length; r++) {
    const row = messages[r], dist = +row[di] || 0, hw = ((row[wi] || '').match(/highway=([\w_]+)/) || [])[1] || '';
    let key = 'Inne';
    if (hw === 'cycleway') key = 'Ścieżka rowerowa';
    else if (['path', 'footway', 'track', 'bridleway', 'steps'].includes(hw)) key = 'Ścieżka / szlak';
    else if (['residential', 'living_street', 'service', 'unclassified', 'pedestrian'].includes(hw)) key = 'Ulica';
    else if (['primary', 'secondary', 'tertiary', 'trunk', 'road', 'primary_link', 'secondary_link', 'tertiary_link'].includes(hw)) key = 'Droga';
    g[key] = (g[key] || 0) + dist;
  }
  return Object.entries(g).map(([label, meters]) => ({ label, meters, color: WAYTYPE_COL[label] || '#999' })).sort((a, b) => b.meters - a.meters);
}
const SKIP = /\b(gmina|powiat|wojew|cyrku|dekanat|parafia|cmentarz|stadion|gromada|herb|wybory|kategoria|synagoga \(|\bdom\b|społeczno|przystanek|dworzec|szkoła|liceum)/i;
const ULICA = /^ulica |^aleja /i;
function kindFromTitle(t) {
  const s = t.toLowerCase();
  if (s.includes('zamek')) return 'Zamek';
  if (s.includes('ruiny')) return 'Ruiny';
  if (s.includes('kości') || s.includes('bazylika') || s.includes('kaplica') || s.includes('sanktuarium') || s.includes('cerkiew') || s.includes('klasztor') || s.includes('opactwo')) return 'Kościół';
  if (s.includes('muzeum') || s.includes('skansen') || s.includes('synagoga')) return 'Zabytek';
  if (s.includes('pałac') || s.includes('dwór') || s.includes('dworek') || s.includes('ratusz') || s.includes('pomnik') || s.includes('willa') || s.includes('kamienica')) return 'Zabytek';
  if (s.includes('szczyt') || s.includes('góra ') || s.includes('wierch') || s.includes('przełęcz') || s.includes('hala ')) return 'Szczyt';
  if (s.includes('jaskinia') || s.includes('grota')) return 'Jaskinia';
  if (s.includes('wodospad') || s.includes('jezioro') || s.includes('zalew') || s.includes('staw')) return 'Punkt widokowy';
  if (s.includes('park') || s.includes('ogród') || s.includes('rynek') || s.includes('rezerwat')) return 'Atrakcja';
  return 'Atrakcja';
}
const PRI = { 'Zamek': 0, 'Ruiny': 1, 'Kościół': 2, 'Zabytek': 2, 'Punkt widokowy': 2, 'Szczyt': 3, 'Jaskinia': 3, 'Atrakcja': 4 };

async function fetchPois(lat, lon, radius, limit) {
  const url = `https://pl.wikipedia.org/w/api.php?action=query&format=json&list=geosearch&gscoord=${lat}%7C${lon}&gsradius=${Math.min(10000, radius)}&gslimit=${limit}`;
  try {
    const r = await fetchT(url, { headers: { 'User-Agent': UA } }, 12000);
    const j = await r.json();
    const arr = j?.query?.geosearch || [];
    const out = [], seen = new Set();
    for (const g of arr) {
      const t = g.title;
      if (SKIP.test(t) || ULICA.test(t) || /\(.*\)/.test(t) && /gmina|powiat|wieś|przysiółek/i.test(t)) continue;
      const key = t.replace(/ w .*/, ''); if (seen.has(key)) continue; seen.add(key);
      out.push({ name: t, kind: kindFromTitle(t), lat: +g.lat.toFixed(5), lon: +g.lon.toFixed(5), wikipedia: 'pl:' + t, d: hav([lat, lon], [g.lat, g.lon]) });
    }
    return out;
  } catch { return []; }
}
function parseBR(j) {
  const f = j?.features?.[0]; if (!f) return null;
  const p = f.properties || {}, c = f.geometry?.coordinates; if (!c || c.length < 2) return null;
  const eles = c.map((x) => (x.length > 2 ? x[2] : 0));
  const distM = +(p['track-length'] || 0);
  const timeMin = Math.round((+(p['total-time'] || 0)) / 60) || Math.round(distM / 1000 / 14 * 60);
  let asc = 0, desc = 0; for (let i = 1; i < eles.length; i++) { const d = eles[i] - eles[i - 1]; if (d > 0) asc += d; else desc -= d; }
  return { coords: c.map((x) => [+x[1].toFixed(5), +x[0].toFixed(5)]), distM, timeMin, ascent: Math.round(+(p['filtered ascend'] || asc)), descent: Math.round(desc), eles: sampleArr(eles, 110).map((e) => +(+e).toFixed(1)), surfaces: parseWayTypes(p.messages) };
}
async function brouter(pts, profile) {
  const lonlats = pts.map((p) => `${p[1]},${p[0]}`).join('|');
  const url = `https://brouter.de/brouter?lonlats=${lonlats}&profile=${profile}&alternativeidx=0&format=geojson`;
  try { const r = await fetchT(url, { headers: { 'User-Agent': UA } }, 18000); if (r.status !== 200) return null; return parseBR(await r.json()); } catch { return null; }
}

const SEEDS = [
  { id: 'gniepolomice', name: 'Puszcza Niepołomicka — pętla', region: 'Niepołomice', lat: 50.0297, lon: 20.2206, activity: 'bike', profile: 'trekking', len: 14, color: '#14b8a6' },
  { id: 'gdobczyce', name: 'Wokół Zalewu Dobczyckiego', region: 'Dobczyce', lat: 49.8806, lon: 20.0883, activity: 'bike', profile: 'trekking', len: 15, color: '#8b5cf6' },
  { id: 'gnowytarg', name: 'VeloDunajec — Nowy Targ', region: 'Nowy Targ · Podhale', lat: 49.4775, lon: 20.0327, activity: 'bike', profile: 'safety', len: 16, color: '#34d07f' },
  { id: 'gzator', name: 'Dolina Karpia — Zator', region: 'Zator', lat: 49.9990, lon: 19.4380, activity: 'bike', profile: 'safety', len: 14, color: '#0c8599' },
  { id: 'gkrzeszowice', name: 'Dolinki — Krzeszowice', region: 'Krzeszowice', lat: 50.1339, lon: 19.6336, activity: 'bike', profile: 'gravel', len: 14, color: '#b4690e' },
  { id: 'gmyslenice', name: 'Myślenice — Zarabie', region: 'Myślenice', lat: 49.8336, lon: 19.9389, activity: 'bike', profile: 'trekking', len: 13, color: '#e0399b' },
  { id: 'goswiecimbike', name: 'Nad Sołą — Oświęcim', region: 'Oświęcim', lat: 50.0344, lon: 19.2098, activity: 'bike', profile: 'safety', len: 14, color: '#3aa0ff' },
  { id: 'gtarnowbike', name: 'Tarnów — pętla', region: 'Tarnów', lat: 50.0121, lon: 20.9858, activity: 'bike', profile: 'safety', len: 13, color: '#f5a623' },
  { id: 'gbochniabike', name: 'Bochnia i okolice', region: 'Bochnia', lat: 49.9690, lon: 20.4300, activity: 'bike', profile: 'trekking', len: 13, color: '#7c5cff' },
  { id: 'gwadowicebike', name: 'Wadowice — okolice', region: 'Wadowice', lat: 49.8833, lon: 19.4933, activity: 'bike', profile: 'trekking', len: 14, color: '#0e9f6e' },
  { id: 'gwieliczka', name: 'Wieliczka — Stare Miasto', region: 'Wieliczka', lat: 49.9869, lon: 20.0644, activity: 'walk', profile: 'hiking-beta', len: 3, color: '#e0399b' },
  { id: 'gzakopane', name: 'Zakopane — Krupówki i okolice', region: 'Zakopane', lat: 49.2992, lon: 19.9496, activity: 'walk', profile: 'hiking-beta', len: 4, color: '#3aa0ff' },
  { id: 'gtarnow', name: 'Tarnów — Starówka', region: 'Tarnów', lat: 50.0121, lon: 20.9858, activity: 'walk', profile: 'hiking-beta', len: 3, color: '#f5a623' },
  { id: 'gnowysacz', name: 'Nowy Sącz — Rynek i zamek', region: 'Nowy Sącz', lat: 49.6216, lon: 20.6975, activity: 'walk', profile: 'hiking-beta', len: 3, color: '#14b8a6' },
  { id: 'gwadowice', name: 'Wadowice — śladami papieża', region: 'Wadowice', lat: 49.8833, lon: 19.4933, activity: 'walk', profile: 'hiking-beta', len: 3, color: '#7c5cff' },
  { id: 'glanckorona', name: 'Lanckorona — rynek i okolice', region: 'Lanckorona', lat: 49.8467, lon: 19.7228, activity: 'walk', profile: 'hiking-mountain', len: 4, color: '#b4690e' },
  { id: 'gkalwaria', name: 'Kalwaria Zebrzydowska', region: 'Kalwaria Zebrzydowska', lat: 49.8694, lon: 19.6747, activity: 'walk', profile: 'hiking-mountain', len: 4, color: '#0e9f6e' },
  { id: 'gkrynica', name: 'Krynica-Zdrój — deptak', region: 'Krynica-Zdrój', lat: 49.4216, lon: 20.9573, activity: 'walk', profile: 'hiking-beta', len: 4, color: '#0c8599' },
  { id: 'gszczawnica', name: 'Szczawnica — brama Pienin', region: 'Szczawnica', lat: 49.4290, lon: 20.4880, activity: 'walk', profile: 'hiking-mountain', len: 5, color: '#34d07f' },
  { id: 'gniedzica', name: 'Niedzica — Zamek Dunajec', region: 'Niedzica', lat: 49.4185, lon: 20.3196, activity: 'walk', profile: 'hiking-beta', len: 4, color: '#8b5cf6' },
  { id: 'gsucha', name: 'Sucha Beskidzka — zamek', region: 'Sucha Beskidzka', lat: 49.7415, lon: 19.5950, activity: 'walk', profile: 'hiking-beta', len: 3, color: '#e0399b' },
  { id: 'gbochnia', name: 'Bochnia — Rynek i żupa', region: 'Bochnia', lat: 49.9690, lon: 20.4300, activity: 'walk', profile: 'hiking-beta', len: 3, color: '#f5a623' },
  { id: 'goswiecim', name: 'Oświęcim — Stare Miasto', region: 'Oświęcim', lat: 50.0344, lon: 19.2098, activity: 'walk', profile: 'hiking-beta', len: 3, color: '#3aa0ff' },
  { id: 'gstarysacz', name: 'Stary Sącz — średniowieczny rynek', region: 'Stary Sącz', lat: 49.5630, lon: 20.6360, activity: 'walk', profile: 'hiking-beta', len: 3, color: '#14b8a6' },
  { id: 'gczchow', name: 'Czchów — zamek nad Dunajcem', region: 'Czchów', lat: 49.8530, lon: 20.6790, activity: 'walk', profile: 'hiking-beta', len: 3, color: '#7c5cff' },
  { id: 'gmuszyna', name: 'Muszyna — ogrody i zamek', region: 'Muszyna', lat: 49.3540, lon: 20.8870, activity: 'walk', profile: 'hiking-mountain', len: 4, color: '#0e9f6e' },
];

// waypointy na okręgu wokół środka → pętla o ~docelowej długości (geometria niezależna od POI)
function ring(center, radiusM, n, phase) {
  const kx = Math.cos(center[0] * RAD), pts = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i * 2 * Math.PI) / n;
    pts.push([+(center[0] + (radiusM * Math.sin(a)) / 111000).toFixed(5), +(center[1] + (radiusM * Math.cos(a)) / (111000 * kx)).toFixed(5)]);
  }
  return pts;
}
// scalanie: zachowaj już wygenerowane, dorób tylko brakujące
const out = existsSync('scripts/generated.json') ? JSON.parse(readFileSync('scripts/generated.json', 'utf8')) : [];
const done = new Set(out.map((r) => r.id));
for (const s of SEEDS) {
  if (done.has(s.id)) { console.log('JUŻ MAM:', s.id); continue; }
  const targetM = s.len * 1000;
  const rLoop = Math.max(400, targetM / 9); // routing po drogach nadmuchuje obwód ~1.4× → /9 daje ~docelową długość
  const poiRadius = Math.max(1800, Math.round(rLoop * 2.2 + 1000));
  let pois = [];
  for (let a = 0; a < 3 && !pois.length; a++) { if (a) await sleep(2200); pois = await fetchPois(s.lat, s.lon, poiRadius, 30); } // retry przy rate-limicie Wikipedii
  await sleep(1000);
  const start = [s.lat, s.lon];
  let res = null;
  for (const nn of [s.activity === 'walk' ? 4 : 5, 4, 3]) {
    res = await brouter([start, ...ring(start, rLoop, nn, 0.5), start], s.profile); await sleep(300);
    if (res && res.coords.length > 5 && res.distM > targetM * 0.4) break; res = null;
  }
  if (!res) { console.log('SKIP (brak trasy):', s.id); continue; }
  const path = res.coords;
  const near = pois.map((p) => { let bd = 1e12; for (const c of path) { const d = hav([p.lat, p.lon], c); if (d < bd) bd = d; } return { p, d: bd }; })
    .filter((x) => x.d < 550).sort((a, b) => (PRI[a.p.kind] ?? 5) - (PRI[b.p.kind] ?? 5) || a.d - b.d).map((x) => x.p);
  const list = (near.length ? near : pois.slice().sort((a, b) => a.d - b.d)).slice(0, 6);
  if (!list.length) { console.log('SKIP (brak POI):', s.id); continue; }
  const km = +(res.distM / 1000).toFixed(1);
  const usedPois = list.map((p) => ({ name: p.name, kind: p.kind, lat: p.lat, lon: p.lon, wikipedia: p.wikipedia, desc: '' }));
  out.push({
    id: s.id, name: s.name, net: s.activity === 'walk' ? 'Spacer' : 'Trasa rowerowa', netClass: 'rcn', region: s.region,
    distance: km, timeMin: res.timeMin, difficulty: km < 4 ? 'Łatwa' : km < 9 ? 'Średnia' : 'Dłuższa',
    color: s.color, desc: 'Przez: ' + usedPois.slice(0, 4).map((p) => p.name).join(', ') + '.',
    activity: s.activity, ascent: res.ascent, descent: res.descent, eles: res.eles, surfaces: res.surfaces,
    path, pois: usedPois,
  });
  console.log('OK', s.id, km + 'km', usedPois.length + ' POI');
}
writeFileSync('scripts/generated.json', JSON.stringify(out));
console.log('\\nZAPISANO', out.length, 'tras → scripts/generated.json');
