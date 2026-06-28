import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable, StyleSheet, Modal, Linking, useColorScheme, RefreshControl, PanResponder, DevSettings, Animated, Dimensions, TextInput, ImageBackground, ActivityIndicator, Platform, Switch, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path as SvgPath, SvgXml, Circle as SvgCircle } from 'react-native-svg';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ROUTES, TEASERS, QUIZZES } from './data';
import { MAP_HTML } from './mapHtml';

/* ---------- geo helpers ---------- */
const R = 6371000, RAD = Math.PI / 180;
function hav(a: number[], b: number[]) {
  const dLat = (b[0] - a[0]) * RAD, dLon = (b[1] - a[1]) * RAD;
  const la1 = a[0] * RAD, la2 = b[0] * RAD;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function cumDist(path: number[][]) {
  const c = [0];
  for (let i = 1; i < path.length; i++) c[i] = c[i - 1] + hav(path[i - 1], path[i]);
  return c;
}
function posAt(path: number[][], cum: number[], d: number) {
  const total = cum[cum.length - 1];
  if (d <= 0) return path[0];
  if (d >= total) return path[path.length - 1];
  let i = 1; while (cum[i] < d) i++;
  const seg = cum[i] - cum[i - 1], f = seg ? (d - cum[i - 1]) / seg : 0;
  return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * f, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * f];
}
function nearestCum(path: number[][], cum: number[], p: number[]) {
  let bi = 0, bd = 1e12;
  for (let i = 0; i < path.length; i++) { const d = hav(p, path[i]); if (d < bd) { bd = d; bi = i; } }
  return { cum: cum[bi], idx: bi, dist: bd };
}
function alongDist(path: number[][], cum: number[], p: { lat: number; lon: number }) {
  return nearestCum(path, cum, [p.lat, p.lon]).cum;
}
const fmtKm = (m: number) => (m / 1000).toFixed(1).replace('.', ',');
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmtPace = (distM: number, sec: number) => { const km = distM / 1000; if (km < 0.05 || sec <= 0) return '–'; const p = sec / km; return `${Math.floor(p / 60)}:${String(Math.round(p % 60)).padStart(2, '0')}`; };
const TODO: Record<string, string[]> = {
  'Zamek': ['Zwiedź wnętrza', 'Zrób zdjęcie', 'Taras widokowy'],
  'Ruiny': ['Spacer wśród murów', 'Zrób zdjęcie'],
  'Zabytek': ['Obejrzyj z bliska', 'Poznaj historię'],
  'Kościół': ['Wejdź do środka', 'Chwila ciszy'],
  'Punkt widokowy': ['Podziwiaj panoramę', 'Zrób zdjęcie', 'Złap oddech'],
  'Szczyt': ['Panorama', 'Odpocznij', 'Zdjęcie'],
  'Atrakcja': ['Zatrzymaj się', 'Zrób zdjęcie'],
  'Jaskinia': ['Zwiedzanie z przewodnikiem', 'Ochłoda'],
  'Restauracja': ['Przerwa na posiłek', 'Lokalna kuchnia'],
  'Kawiarnia': ['Kawa i odpoczynek', 'Słodki przystanek'],
  'Parking': ['Zostaw auto', 'Start trasy'],
  'Sklep': ['Zakupy', 'Woda i przekąski', 'Prowiant'],
  'Miejsce piknikowe': ['Piknik', 'Odpoczynek'],
  'Miejsce': ['Zatrzymaj się', 'Rozejrzyj się'],
};
const thingsToDo = (k: string) => TODO[k] || TODO['Miejsce'];

// Flat ikony POI — identyczne jak piny na mapie (te same glify SVG)
const POI_COL: Record<string, string> = { 'Zamek': '#b4690e', 'Ruiny': '#b4690e', 'Zabytek': '#b4690e', 'Kościół': '#7c5cff', 'Punkt widokowy': '#0e9f6e', 'Szczyt': '#0e9f6e', 'Atrakcja': '#e0399b', 'Kawiarnia': '#9a6a3a', 'Miejsce piknikowe': '#0e9f6e', 'Restauracja': '#e0399b', 'Parking': '#3aa0ff', 'Sklep': '#0c8599', 'Jaskinia': '#5a6675', 'Miejsce': '#3aa0ff' };
const POI_SVGMAP: Record<string, string> = { 'Zamek': 'landmark', 'Ruiny': 'landmark', 'Zabytek': 'landmark', 'Kościół': 'church', 'Punkt widokowy': 'eye', 'Szczyt': 'mountain', 'Atrakcja': 'star', 'Kawiarnia': 'cup', 'Restauracja': 'cup', 'Miejsce piknikowe': 'tree', 'Parking': 'parking', 'Sklep': 'bag', 'Jaskinia': 'dot', 'Miejsce': 'dot' };
const POI_PATHS: Record<string, string> = {
  landmark: '<path d="M2.5 6.5L8 3.2l5.5 3.3"/><path d="M3.5 7v6M6.2 7v6M9.8 7v6M12.5 7v6"/><path d="M2.5 13.2h11"/>',
  church: '<path d="M8 2v2.6"/><path d="M6.7 3.3h2.6"/><path d="M3.6 13.2V7.4L8 5l4.4 2.4v5.8"/><path d="M6.4 13.2v-3h3.2v3"/>',
  eye: '<path d="M1.6 8S4 4 8 4s6.4 4 6.4 4-2.4 4-6.4 4S1.6 8 1.6 8z"/><circle cx="8" cy="8" r="1.8"/>',
  mountain: '<path d="M1.8 12.8l4-6.6 2.5 3.6 1.7-2.5 4.2 5.5z"/>',
  star: '<path d="M8 2.4l1.6 3.4 3.7.4-2.8 2.5.8 3.6L8 10.6 4.7 12.3l.8-3.6L2.7 6.2l3.7-.4z" fill="__COL__" stroke="none"/>',
  cup: '<path d="M3.4 6h7.6v2.8a2.8 2.8 0 0 1-2.8 2.8H6.2A2.8 2.8 0 0 1 3.4 8.8z"/><path d="M11 6.7h1.5a1.3 1.3 0 0 1 0 2.6H11"/><path d="M5 4.2v-.9M8 4.2v-.9M11 4.2v-.9"/>',
  tree: '<path d="M8 2.5l3 4.2H5z"/><path d="M8 5.6l3.2 4.4H4.8z"/><path d="M8 10v3.4"/>',
  parking: '<path d="M4.5 13V3.5h4a3 3 0 0 1 0 6h-4"/>',
  bag: '<path d="M3.8 5.5h8.4l-.7 8a1 1 0 0 1-1 .9H5.5a1 1 0 0 1-1-.9z"/><path d="M5.6 5.5a2.4 2.4 0 0 1 4.8 0"/>',
  dot: '<circle cx="8" cy="8" r="3"/>',
};
function poiSvg(kind: string, size = 22) {
  const col = POI_COL[kind] || '#3aa0ff';
  const inner = (POI_PATHS[POI_SVGMAP[kind] || 'dot'] || POI_PATHS.dot).replace('__COL__', col);
  return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
function PoiGlyph({ kind, size = 22 }: any) { return <SvgXml xml={poiSvg(kind, size)} width={size} height={size} />; }
function poiColor(kind: string) { return POI_COL[kind] || '#3aa0ff'; }
const isFood = (kind: string) => kind === 'Restauracja' || kind === 'Kawiarnia';
const getQuiz = (poi: any) => (poi && poi.name ? QUIZZES[poi.name] || poi.quiz || null : null);
const QUIZ_POINTS = 10; // za poprawną; +2 za próbę
// Auto-quiz dla DOWOLNEGO punktu (gdy brak ręcznego w QUIZZES) — pytanie o typ obiektu, oparte na danych OSM
const AUTO_LABELS: Record<string, string> = { 'Zamek': 'Zamek lub twierdza', 'Ruiny': 'Ruiny budowli', 'Zabytek': 'Zabytek', 'Kościół': 'Kościół', 'Punkt widokowy': 'Punkt widokowy', 'Szczyt': 'Szczyt / wzniesienie', 'Atrakcja': 'Atrakcja turystyczna', 'Restauracja': 'Restauracja', 'Kawiarnia': 'Kawiarnia', 'Miejsce piknikowe': 'Miejsce piknikowe', 'Jaskinia': 'Jaskinia', 'Parking': 'Parking', 'Sklep': 'Sklep', 'Miejsce': 'Ciekawe miejsce' };
const AUTO_POOL = ['Kościół', 'Punkt widokowy', 'Muzeum', 'Park miejski', 'Pomnik', 'Zamek lub twierdza', 'Most', 'Jaskinia'];
function makeAutoQuiz(poi: any) {
  const correct = AUTO_LABELS[poi.kind] || 'Ciekawe miejsce';
  const distract = AUTO_POOL.filter((l) => l !== correct);
  const n = (poi.name || '').length;
  const d1 = distract[n % distract.length];
  let d2 = distract[(n + 3) % distract.length]; if (d2 === d1) d2 = distract[(n + 4) % distract.length];
  const opts = [d1, d2]; const pos = n % 3; opts.splice(pos, 0, correct);
  return { q: `Czym jest „${poi.name}"?`, opts, correct: pos, fact: `To ${correct.toLowerCase()} na Twojej trasie — podejdź bliżej i rozejrzyj się.` };
}
function quizLevel(pts: number) {
  if (pts >= 150) return 'Mistrz Małopolski';
  if (pts >= 80) return 'Przewodnik';
  if (pts >= 30) return 'Odkrywca';
  return 'Nowicjusz';
}
// Odznaki za ukończone trasy
const BADGES: Record<string, { name: string; icon: string; desc: string }> = {
  first: { name: 'Pierwsza wyprawa', icon: 'sparkles', desc: 'Ukończ pierwszą trasę' },
  cyclist: { name: 'Kolarz', icon: 'bicycle', desc: 'Ukończ trasę rowerową' },
  walker: { name: 'Piechur', icon: 'walk', desc: 'Ukończ spacer' },
  explorer: { name: 'Odkrywca szlaków', icon: 'compass', desc: 'Ukończ trasę z 3+ punktami' },
  trips5: { name: 'Stały bywalec', icon: 'repeat', desc: '5 ukończonych tras' },
  trips10: { name: 'Weteran szlaków', icon: 'ribbon', desc: '10 ukończonych tras' },
  km25: { name: 'Wytrwały', icon: 'speedometer', desc: 'Łącznie 25 km' },
  km100: { name: 'Setka', icon: 'trophy', desc: 'Łącznie 100 km' },
};
// Szacunkowe kalorie (MET × masa × czas), z fallbackiem na dystans
function calcKcal(distM: number, mins: number, activity: string) {
  const met = activity === 'walk' ? 3.8 : 6.8, weight = 75;
  let kcal = met * weight * (Math.max(0, mins) / 60);
  if (!kcal || kcal < 1) kcal = (activity === 'walk' ? 52 : 26) * (distM / 1000);
  return Math.max(0, Math.round(kcal));
}
// Otwiera Google Maps na danym miejscu — tam są oceny i zdjęcia posiłków
function openGoogle(name: string, lat: number, lon: number) {
  const q = encodeURIComponent(`${name} ${lat},${lon}`);
  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
}
function openWiki(wikipedia: string) {
  const i = wikipedia.indexOf(':');
  const lang = wikipedia.slice(0, i), title = wikipedia.slice(i + 1);
  Linking.openURL(`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`);
}

// Dojazd z A do startu trasy danym profilem BRouter (z timeoutem). Fallback: linia prosta.
async function routeApproach(from: number[], to: number[], profile: string): Promise<number[][]> {
  const url = `https://brouter.de/brouter?lonlats=${from[1]},${from[0]}|${to[1]},${to[0]}&profile=${profile}&alternativeidx=0&format=geojson`;
  try {
    const res = await fetchT(url, {}, 14000);
    const j = await res.json();
    const coords = j?.features?.[0]?.geometry?.coordinates;
    if (coords && coords.length > 1) return coords.map((c: number[]) => [c[1], c[0]]);
  } catch {}
  return [from, to];
}

const VARIANTS = [
  { key: 'rowerowa', label: 'Rowerowa', ion: 'bicycle', profile: 'safety' },
  { key: 'szybka', label: 'Najszybsza', ion: 'flash', profile: 'fastbike' },
  { key: 'krotka', label: 'Najkrótsza', ion: 'resize', profile: 'shortest' },
];
const WALK_VARIANTS = [
  { key: 'pieszo', label: 'Ścieżkami', ion: 'walk', profile: 'hiking-beta' },
  { key: 'gorski', label: 'Szlakiem', ion: 'trail-sign', profile: 'hiking-mountain' },
  { key: 'krotka', label: 'Najkrótsza', ion: 'resize', profile: 'shortest' },
];
const approachVariants = () => (CURRENT_ACTIVITY === 'walk' ? WALK_VARIANTS : VARIANTS);

// Zdjęcie nagłówkowe z Wikipedii (POI ma tag wikipedia) — cache w module
const imgCache: Record<string, string | null> = {};
async function fetchWikiImage(wikipedia: string, size = 600): Promise<string | null> {
  if (!wikipedia) return null;
  const i = wikipedia.indexOf(':');
  const lang = wikipedia.slice(0, i), title = wikipedia.slice(i + 1);
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=${size}&titles=${encodeURIComponent(title)}`;
  try {
    const j = await (await fetch(url)).json();
    const pages = j?.query?.pages || {};
    for (const k in pages) { const th = pages[k]?.thumbnail?.source; if (th) return th; }
  } catch {}
  return null;
}

// Pełny opis (intro) + zdjęcie z Wikipedii — do rozwijanego sheetu POI
async function fetchWikiSummary(wikipedia: string): Promise<any> {
  if (!wikipedia) return { extract: '', image: null };
  const i = wikipedia.indexOf(':');
  const lang = wikipedia.slice(0, i), title = wikipedia.slice(i + 1);
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=extracts|pageimages&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=800&titles=${encodeURIComponent(title)}`;
  try {
    const j = await (await fetch(url)).json();
    const p = j?.query?.pages || {}; const k = Object.keys(p)[0]; const pg = p[k] || {};
    return { extract: pg.extract || '', image: pg.thumbnail?.source || null };
  } catch { return { extract: '', image: null }; }
}
// Treść z Wikipedii dla POI BEZ tagu wikipedia — szukamy artykułu po pozycji i nazwie
async function fetchWikiByGeo(name: string, lat: number, lon: number): Promise<any> {
  if (lat == null || lon == null) return null;
  try {
    const gs = `https://pl.wikipedia.org/w/api.php?action=query&format=json&list=geosearch&gscoord=${lat}%7C${lon}&gsradius=700&gslimit=12`;
    const d = await (await fetch(gs)).json();
    const arr = d?.query?.geosearch || []; if (!arr.length) return null;
    const lname = (name || '').toLowerCase(); let title: string | null = null;
    for (const g of arr) { const gt = g.title.toLowerCase(); if (lname && (gt.includes(lname) || lname.includes(gt))) { title = g.title; break; } }
    if (!title) title = arr[0].title; // najbliższy artykuł, gdy brak dopasowania nazwy
    const ex = `https://pl.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=extracts|pageimages&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=800&titles=${encodeURIComponent(title)}`;
    const d2 = await (await fetch(ex)).json();
    const p = d2?.query?.pages || {}; const k = Object.keys(p)[0]; const pg = p[k] || {};
    if (!pg.extract) return null;
    return { extract: pg.extract, image: pg.thumbnail?.source || null, wikipedia: 'pl:' + title };
  } catch { return null; }
}
// Nawigacja autem do punktu (otwiera mapy systemowe)
function driveTo(lat: number, lon: number) {
  const url = Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${lat},${lon}&dirflg=d` : `google.navigation:q=${lat},${lon}`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`));
}
// Powiadomienia lokalne — pokazuj też gdy apka jest na wierzchu
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false } as any),
});
async function ensureNotifPerm() {
  try { const { status } = await Notifications.getPermissionsAsync(); if (status !== 'granted') await Notifications.requestPermissionsAsync(); } catch {}
}
async function notifyPoi(name: string, kind: string) {
  try { await Notifications.scheduleNotificationAsync({ content: { title: 'Warto się zatrzymać', body: `${name} · ${kind}`, sound: true }, trigger: null }); } catch {}
}
// Zewnętrzna nawigacja do punktu — wybór Google / Apple Maps, tryb wg aktywności
function navTo(lat: number, lon: number, app: 'google' | 'apple') {
  const walk = CURRENT_ACTIVITY === 'walk';
  if (app === 'apple') Linking.openURL(`http://maps.apple.com/?daddr=${lat},${lon}&dirflg=${walk ? 'w' : 'd'}`).catch(() => {});
  else Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=${walk ? 'walking' : 'bicycling'}`).catch(() => {});
}

let CURRENT_ACTIVITY: 'bike' | 'walk' = 'bike';
let VOICE_ON = true; // wskazówki głosowe (TTS) — synchronizowane ze stanem
function speak(text: string) { if (!VOICE_ON || !text) return; try { Speech.stop(); Speech.speak(text, { language: 'pl-PL', rate: 1.0, pitch: 1.05 }); } catch {} }
const BIKE_PROFILES: Record<string, string> = { rowerowa: 'safety', spokojna: 'trekking', gorska: 'mtb', szutrowa: 'gravel', szybka: 'fastbike', krotka: 'shortest' };
const WALK_PROFILES: Record<string, string> = { spacerowa: 'hiking-beta', szlak: 'hiking-mountain', krotka: 'shortest' };
function planProfile(key: string) {
  const m = CURRENT_ACTIVITY === 'walk' ? WALK_PROFILES : BIKE_PROFILES;
  return m[key] || (CURRENT_ACTIVITY === 'walk' ? 'hiking-beta' : 'safety');
}
function sampleArr<T>(a: T[], max: number): T[] {
  if (a.length <= max) return a;
  const step = a.length / max, out: T[] = [];
  for (let i = 0; i < max; i++) out.push(a[Math.floor(i * step)]);
  out.push(a[a.length - 1]); return out;
}
const WAYTYPE_COL: Record<string, string> = { 'Ścieżka rowerowa': '#34d07f', 'Ścieżka / szlak': '#f5a623', 'Ulica': '#3aa0ff', 'Droga': '#8b97a3', 'Inne': '#c9d1d9' };
function parseWayTypes(messages: any[]): any[] {
  if (!messages || messages.length < 2) return [];
  const head = messages[0]; const di = head.indexOf('Distance'); const wi = head.indexOf('WayTags');
  if (di < 0 || wi < 0) return [];
  const g: Record<string, number> = {};
  for (let r = 1; r < messages.length; r++) {
    const row = messages[r]; const dist = +row[di] || 0;
    const hw = ((row[wi] || '').match(/highway=([\w_]+)/) || [])[1] || '';
    let key = 'Inne';
    if (hw === 'cycleway') key = 'Ścieżka rowerowa';
    else if (['path', 'footway', 'track', 'bridleway', 'steps'].includes(hw)) key = 'Ścieżka / szlak';
    else if (['residential', 'living_street', 'service', 'unclassified', 'pedestrian'].includes(hw)) key = 'Ulica';
    else if (['primary', 'secondary', 'tertiary', 'trunk', 'road', 'primary_link', 'secondary_link', 'tertiary_link'].includes(hw)) key = 'Droga';
    g[key] = (g[key] || 0) + dist;
  }
  return Object.entries(g).map(([label, meters]) => ({ label, meters, color: WAYTYPE_COL[label] || '#999' })).sort((a, b) => b.meters - a.meters);
}
function parseBRouter(j: any): any {
  const f = j?.features?.[0]; if (!f) return null;
  const p = f.properties || {}; const c = f.geometry?.coordinates;
  if (!c || c.length < 2) return null;
  const eles = c.map((x: number[]) => (x.length > 2 ? x[2] : 0));
  const distM = +(p['track-length'] || 0);
  const timeMin = Math.round((+(p['total-time'] || 0)) / 60) || Math.round(distM / 1000 / 16 * 60);
  let asc = 0, desc = 0;
  for (let i = 1; i < eles.length; i++) { const d = eles[i] - eles[i - 1]; if (d > 0) asc += d; else desc -= d; }
  return {
    coords: c.map((x: number[]) => [x[1], x[0]]), distM, timeMin,
    ascent: Math.round(+(p['filtered ascend'] || asc)), descent: Math.round(desc),
    eles: sampleArr(eles, 120), surfaces: parseWayTypes(p.messages),
  };
}
// fetch z twardym timeoutem — bez tego zawieszony endpoint blokuje await w nieskończoność
async function fetchT(url: string, opts: any, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...(opts || {}), signal: ctrl.signal }); } finally { clearTimeout(t); }
}
// Routing przez wiele punktów (BRouter) — pełne dane w stylu Komoot
async function routeThrough(pts: number[][], profileKey: string): Promise<any> {
  if (pts.length < 2) return null;
  const profile = planProfile(profileKey);
  const lonlats = pts.map((p) => `${p[1]},${p[0]}`).join('|');
  const url = `https://brouter.de/brouter?lonlats=${lonlats}&profile=${profile}&alternativeidx=0&format=geojson`;
  try { return parseBRouter(await (await fetchT(url, {}, 15000)).json()); } catch { return null; }
}
// Miejsca w pobliżu zaplanowanej trasy (Overpass: atrakcje/zabytki/restauracje/parkingi)
async function fetchNearbyPlaces(coords: number[][], activity: string): Promise<any[]> {
  if (!coords || coords.length < 2) return [];
  let minLat = 90, minLon = 180, maxLat = -90, maxLon = -180;
  for (const c of coords) { if (c[0] < minLat) minLat = c[0]; if (c[0] > maxLat) maxLat = c[0]; if (c[1] < minLon) minLon = c[1]; if (c[1] > maxLon) maxLon = c[1]; }
  const MAXR = 1000; // pobieramy szeroko, filtrowanie promieniem po stronie klienta
  const latP = MAXR / 111000, lonP = MAXR / 71000;
  const bbox = `${(minLat - latP).toFixed(4)},${(minLon - lonP).toFixed(4)},${(maxLat + latP).toFixed(4)},${(maxLon + lonP).toFixed(4)}`;
  const q = `[out:json][timeout:45];(nwr["tourism"~"attraction|viewpoint|museum|artwork"]["name"](${bbox});nwr["historic"]["name"](${bbox});nwr["amenity"~"restaurant|cafe|fast_food"]["name"](${bbox});nwr["amenity"="parking"](${bbox});nwr["shop"~"supermarket|convenience|greengrocer|grocery|bakery|deli"]["name"](${bbox}););out center tags 300;`;
  const EPS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  let j: any = null;
  for (const ep of EPS) {
    try {
      const r = await fetchT(ep, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }, 18000);
      const d = await r.json();
      if (d && Array.isArray(d.elements)) { j = d; break; }
    } catch {}
  }
  if (!j) return [];
  {
    const out: any[] = [], seen = new Set();
    for (const e of (j.elements || [])) {
      const t = e.tags || {}; const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon; if (lat == null) continue;
      let kind = 'Miejsce', name = t.name;
      if (t.historic === 'castle') kind = 'Zamek'; else if (t.historic === 'ruins') kind = 'Ruiny'; else if (t.historic) kind = 'Zabytek';
      else if (t.tourism === 'viewpoint') kind = 'Punkt widokowy'; else if (t.tourism === 'museum') kind = 'Zabytek'; else if (t.tourism) kind = 'Atrakcja';
      else if (t.amenity === 'restaurant' || t.amenity === 'fast_food') kind = 'Restauracja'; else if (t.amenity === 'cafe') kind = 'Kawiarnia';
      else if (t.amenity === 'parking') { kind = 'Parking'; name = t.fee === 'no' ? 'Parking (bezpłatny)' : (t.fee === 'yes' ? 'Parking (płatny)' : 'Parking'); }
      else if (t.shop) kind = 'Sklep';
      if (!name) continue;
      let bd = 1e12; for (const c of coords) { const d = hav([lat, lon], [c[0], c[1]]); if (d < bd) bd = d; if (bd < 40) break; }
      if (bd > MAXR) continue;
      const key = name + kind + Math.round(lat * 1000); if (seen.has(key)) continue; seen.add(key);
      out.push({ name, kind, lat: +lat.toFixed(5), lon: +lon.toFixed(5), d: Math.round(bd), wikipedia: t.wikipedia || null, cuisine: t.cuisine || null });
    }
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, 80);
  }
}

// ===== Generator tras =====
const GEN_THEMES: { key: string; label: string; ion: string; q: string[] }[] = [
  { key: 'historia', label: 'Historia i zabytki', ion: 'business-outline', q: ['nwr["historic"]["name"]', 'nwr["tourism"="museum"]["name"]'] },
  { key: 'przyroda', label: 'Przyroda i widoki', ion: 'leaf-outline', q: ['nwr["tourism"="viewpoint"]["name"]', 'nwr["natural"="peak"]["name"]', 'nwr["leisure"="park"]["name"]'] },
  { key: 'jedzenie', label: 'Jedzenie i kawiarnie', ion: 'cafe-outline', q: ['nwr["amenity"~"cafe|restaurant"]["name"]'] },
  { key: 'atrakcje', label: 'Atrakcje i rodzina', ion: 'happy-outline', q: ['nwr["tourism"="attraction"]["name"]', 'nwr["leisure"="playground"]'] },
  { key: 'sztuka', label: 'Sztuka i kultura', ion: 'color-palette-outline', q: ['nwr["tourism"="artwork"]["name"]', 'nwr["amenity"~"theatre|arts_centre"]["name"]'] },
  { key: 'woda', label: 'Woda i rzeki', ion: 'water-outline', q: ['nwr["natural"="water"]["name"]', 'nwr["leisure"="marina"]["name"]'] },
];
function classifyOsm(t: any): { kind: string; name: string } {
  let kind = 'Miejsce', name = t.name;
  if (t.historic === 'castle') kind = 'Zamek'; else if (t.historic === 'ruins') kind = 'Ruiny'; else if (t.historic) kind = 'Zabytek';
  else if (t.tourism === 'viewpoint') kind = 'Punkt widokowy'; else if (t.tourism === 'museum') kind = 'Zabytek'; else if (t.tourism) kind = 'Atrakcja';
  else if (t.natural === 'peak') kind = 'Szczyt';
  else if (t.amenity === 'restaurant' || t.amenity === 'fast_food') kind = 'Restauracja'; else if (t.amenity === 'cafe') kind = 'Kawiarnia';
  else if (t.shop) kind = 'Sklep'; else if (t.leisure === 'park' || t.natural === 'water') kind = 'Atrakcja';
  return { kind, name };
}
async function fetchAreaPois(lat: number, lon: number, radius: number, themes: string[]): Promise<any[]> {
  const parts: string[] = [];
  GEN_THEMES.filter((t) => themes.includes(t.key)).forEach((t) => t.q.forEach((q) => parts.push(`${q}(around:${radius},${lat},${lon});`)));
  if (!parts.length) parts.push(`nwr["tourism"~"attraction|viewpoint|museum"]["name"](around:${radius},${lat},${lon});`);
  const q = `[out:json][timeout:25];(${parts.join('')});out center tags 150;`;
  const EPS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  let j: any = null;
  for (const ep of EPS) { try { const r = await fetchT(ep, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }, 20000); const d = await r.json(); if (d && Array.isArray(d.elements)) { j = d; break; } } catch {} }
  if (!j) return [];
  const out: any[] = [], seen = new Set();
  for (const e of (j.elements || [])) {
    const t = e.tags || {}; const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon; if (la == null || !t.name) continue;
    const { kind, name } = classifyOsm(t); if (!name) continue;
    const key = name + Math.round(la * 1000); if (seen.has(key)) continue; seen.add(key);
    out.push({ name, kind, lat: +la.toFixed(5), lon: +lo.toFixed(5), wikipedia: t.wikipedia || null, theme: poiThemeOf(t, kind), d: hav([lat, lon], [la, lo]) });
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}
function poiThemeOf(t: any, kind: string): string {
  if (kind === 'Zamek' || kind === 'Ruiny' || kind === 'Zabytek') return 'historia';
  if (kind === 'Restauracja' || kind === 'Kawiarnia') return 'jedzenie';
  if (kind === 'Punkt widokowy' || kind === 'Szczyt') return 'przyroda';
  if (t.natural === 'water' || t.leisure === 'marina' || t.waterway) return 'woda';
  if (t.leisure === 'park' || t.natural) return 'przyroda';
  if (t.tourism === 'artwork' || t.amenity === 'theatre' || t.amenity === 'arts_centre') return 'sztuka';
  return 'atrakcje';
}
function genProfileKey(activity: string, cfg: any): string {
  // pieszo: hiking-mountain (footpathy/leśne/przejścia) vs hiking-beta (spacer)
  if (activity === 'walk') return cfg.trails ? 'szlak' : 'spacerowa';
  // rower: nawierzchnia/charakter — ścieżki rowerowe (safety/Velo) / szutry (gravel) / najszybsza (fastbike)
  if (cfg.bikeStyle === 'gravel') return 'szutrowa';
  if (cfg.bikeStyle === 'fast') return 'szybka';
  return 'rowerowa';
}
// Buduje jedną trasę z puli POI danej KATEGORII (nearest-neighbor od środka)
async function buildThemedRoute(area: any, cfg: any, activity: string, group: any[], theme: any, idx: number): Promise<any> {
  const start = [area.lat, area.lon];
  const perStop = activity === 'walk' ? 0.7 : 1.8;
  const want = Math.max(2, Math.min(8, Math.round(cfg.lengthKm / perStop)));
  const pool = group.slice().sort((a, b) => a.d - b.d).slice(0, Math.max(want * 3, 12));
  const chosen: any[] = []; let cur = start; const used = new Set<number>();
  while (chosen.length < want && used.size < pool.length) {
    let best = -1, bd = 1e12;
    for (let i = 0; i < pool.length; i++) { if (used.has(i)) continue; const d = hav(cur, [pool[i].lat, pool[i].lon]); if (d < bd) { bd = d; best = i; } }
    if (best < 0) break; used.add(best); chosen.push(pool[best]); cur = [pool[best].lat, pool[best].lon];
  }
  if (!chosen.length) return null;
  if (cfg.endCafe && theme.key !== 'jedzenie') { /* opcjonalna meta w kawiarni dla nie-gastro tras dodaje sens */ }
  const wpts: number[][] = [start, ...chosen.map((p) => [p.lat, p.lon])];
  if (cfg.shape === 'loop') wpts.push(start);
  const res = await routeThrough(wpts, genProfileKey(activity, cfg));
  if (!res || !res.coords || res.coords.length < 2) return null;
  const km = res.distM / 1000;
  const nm = (cfg.game ? 'Gra: ' : '') + theme.label + ' • ' + km.toFixed(1) + ' km';
  return {
    id: 'gen' + Date.now() + '_' + idx, name: nm, net: cfg.game ? 'Gra terenowa' : theme.label, netClass: 'rcn',
    region: 'Wygenerowana w okolicy', distance: +km.toFixed(1), timeMin: res.timeMin,
    difficulty: km < 4 ? 'Łatwa' : km < 9 ? 'Średnia' : 'Dłuższa',
    color: ['#3ee08a', '#8b5cf6', '#f5a623', '#14b8a6', '#e0399b', '#0c8599'][idx % 6], desc: 'Trasa tematyczna: ' + theme.label + '.',
    path: res.coords, pois: chosen.map((p) => ({ name: p.name, kind: p.kind, lat: p.lat, lon: p.lon, wikipedia: p.wikipedia || undefined, desc: '', ...(cfg.game ? { quiz: QUIZZES[p.name] || makeAutoQuiz(p) } : {}) })),
    ascent: res.ascent, descent: res.descent, eles: res.eles, surfaces: res.surfaces, activity, game: !!cfg.game,
    themeKey: theme.key, themeLabel: theme.label, themeIon: theme.ion, waypoints: wpts,
  };
}
// Generuje JEDNĄ trasę na każdą kategorię, która ma punkty w obszarze (różnorodność = różne tematy)
async function generateRoutes(area: any, cfg: any, activity: string): Promise<any[]> {
  CURRENT_ACTIVITY = activity; // by routeThrough użył właściwych profili
  let pois = await fetchAreaPois(area.lat, area.lon, area.radius, GEN_THEMES.map((t) => t.key));
  // gęste centrum (np. Kraków) → zapytanie potrafi timeoutować; ponów z mniejszym promieniem (lżejsze, szybsze)
  if (!pois.length && area.radius > 800) pois = await fetchAreaPois(area.lat, area.lon, Math.round(area.radius * 0.5), GEN_THEMES.map((t) => t.key));
  if (!pois.length) return [];
  const groups = GEN_THEMES.map((th, i) => ({ th, i, group: pois.filter((p) => p.theme === th.key) })).filter((g) => g.group.length >= 1);
  // wszystkie kategorie liczone RÓWNOLEGLE (każda z własnym timeoutem) → szybko, odporne na zawieszenie
  const built = await Promise.all(groups.map((g) => buildThemedRoute(area, cfg, activity, g.group, g.th, g.i).catch(() => null)));
  return built.filter(Boolean);
}

// Wysokość dla gotowych tras (open-elevation, próbkowane)
async function fetchElevation(path: number[][]): Promise<any> {
  const pts = sampleArr(path, 64);
  try {
    const j = await (await fetch('https://api.open-elevation.com/api/v1/lookup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations: pts.map((p) => ({ latitude: p[0], longitude: p[1] })) }),
    })).json();
    const eles = (j.results || []).map((r: any) => r.elevation);
    if (eles.length < 2) return null;
    let asc = 0, desc = 0;
    for (let i = 1; i < eles.length; i++) { const d = eles[i] - eles[i - 1]; if (d > 0) asc += d; else desc -= d; }
    return { eles, ascent: Math.round(asc), descent: Math.round(desc) };
  } catch { return null; }
}

const MAP_STYLES = [
  { key: 'auto', label: 'Auto', desc: 'wg motywu', ion: 'contrast-outline' },
  { key: 'voyager', label: 'Voyager', desc: 'kolorowa', ion: 'color-palette-outline' },
  { key: 'cyclosm', label: 'Rowerowa', desc: 'ścieżki rowerowe', ion: 'bicycle-outline' },
  { key: 'topo', label: 'Topo', desc: 'teren, poziomice', ion: 'trail-sign-outline' },
  { key: 'satellite', label: 'Satelita', desc: 'zdjęcia lotnicze', ion: 'globe-outline' },
  { key: 'osm', label: 'Klasyczna', desc: 'standard OSM', ion: 'map-outline' },
];

/* ---------- theme ---------- */
function makeColors(t: 'light' | 'dark') {
  if (t === 'light') return {
    theme: 'light' as const, bg: '#ffffff', surface: '#ffffff', txt: '#11151a', dim: '#5a626d',
    stroke: 'rgba(0,0,0,0.12)', accent: '#0e9f6e', danger: '#e5484d', glassTint: 'light' as const,
    glass: '#ffffff', glassStrong: '#ffffff',
  };
  return {
    theme: 'dark' as const, bg: '#0a0e13', surface: '#161b22', txt: '#f3f6f9', dim: '#aab4be',
    stroke: 'rgba(255,255,255,0.14)', accent: '#3ee08a', danger: '#ff6b6b', glassTint: 'dark' as const,
    glass: '#161b22', glassStrong: '#1b212a',
  };
}
type C = ReturnType<typeof makeColors>;

export default function App() {
  const sys = useColorScheme();
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');
  const C = useMemo(() => makeColors(theme), [theme]);
  const s = useMemo(() => makeStyles(C), [C]);

  const webRef = useRef<any>(null);
  const isWeb = Platform.OS === 'web';
  const [screen, setScreen] = useState<'tab' | 'detail' | 'ride' | 'plan'>('tab');
  const [tab, setTab] = useState<'dashboard' | 'routes' | 'profile'>('dashboard');
  const [route, setRoute] = useState<any>(null);
  const [sheet, setSheet] = useState<any>(null);
  const [quizState, setQuizState] = useState<{ points: number; done: Record<string, number> }>({ points: 0, done: {} });
  const [rideStats, setRideStats] = useState<{ trips: number; km: number; min: number; badges: string[] }>({ trips: 0, km: 0, min: 0, badges: [] });
  const [history, setHistory] = useState<any[]>([]); // log ukończonych/przerwanych tras
  const [summary, setSummary] = useState<any>(null);
  const [riding, setRiding] = useState(false); // trasa w toku (do minimalizacji/wznawiania)
  const [pendingResume, setPendingResume] = useState<any>(null); // zapisana trasa do wznowienia po restarcie/crashu
  const [userLoc, setUserLoc] = useState<number[] | null>(null); // ostatnia znana pozycja (sortowanie „blisko mnie")
  const [voiceOn, setVoiceState] = useState(true); // wskazówki głosowe
  const toggleVoice = () => { const v = !voiceOn; setVoiceState(v); VOICE_ON = v; AsyncStorage.setItem('voiceOn', v ? '1' : '0'); if (v) speak('Wskazówki głosowe włączone.'); else Speech.stop(); };
  const [genStep, setGenStep] = useState<'area' | 'config' | 'results'>('area');
  const [genArea, setGenAreaState] = useState<{ lat: number; lon: number } | null>(null);
  const [genRadius, setGenRadius] = useState(1500);
  const [genCfg, setGenCfg] = useState<any>({ activity: 'walk', themes: ['historia', 'przyroda'], lengthKm: 5, trails: true, bikeStyle: 'cyclepath', shape: 'loop', game: false, endCafe: false });
  const [genLoading, setGenLoading] = useState(false);
  const [genResults, setGenResults] = useState<any[]>([]);
  const answerQuiz = (name: string, correct: boolean) => setQuizState((prev) => {
    if (prev.done[name] != null) return prev; // już rozwiązane — bez ponownych punktów
    return { points: prev.points + (correct ? QUIZ_POINTS : 2), done: { ...prev.done, [name]: correct ? 1 : 0 } };
  });
  const [refreshing, setRefreshing] = useState(false);
  const [mapStyle, setMapStyleState] = useState('auto');
  const [styleOpen, setStyleOpen] = useState(false);
  const [savedRoutes, setSavedRoutes] = useState<any[]>([]);
  const [favs, setFavs] = useState<string[]>([]);
  const [activity, setActivityState] = useState<'bike' | 'walk'>('bike');
  // planowanie tras
  const [planPts, setPlanPts] = useState<number[][]>([]);
  const [planProfile, setPlanProfile] = useState('rowerowa');
  const [planRoute, setPlanRoute] = useState<any>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [nearby, setNearby] = useState<any[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [addedPois, setAddedPois] = useState<any[]>([]);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [typeHidden, setTypeHidden] = useState<string[]>(['Sklep']); // ukryte typy POI; sklepy domyślnie off
  const [nearbyRadius, setNearbyRadius] = useState(250);
  const prefsLoaded = useRef(false); // dopiero po wczytaniu zapisujemy preferencje filtra
  const [nearbyTap, setNearbyTap] = useState<any>(null);
  const mapReady = useRef(false);
  const pendingRoute = useRef<any>(null);

  const ride = useRef<any>(null);
  const [phase, setPhaseState] = useState<'approach' | 'trail'>('trail');
  const [hud, setHud] = useState({ done: 0, total: 0, speed: 0, nextName: '—', nextDist: '—', nextIcon: '📍', nextKind: null as string | null, elapsed: 0, avg: 0, off: false });
  const [navStarted, setNavStartedState] = useState(false);
  const navStartedRef = useRef(false);
  const setNavStarted = (v: boolean) => { navStartedRef.current = v; setNavStartedState(v); };
  const [statsOpen, setStatsOpen] = useState(false);
  const lastUser = useRef<number[] | null>(null);
  const splashAnim = useRef(new Animated.Value(1)).current;
  const [showSplash, setShowSplash] = useState(true);
  const [variants, setVariants] = useState<any[]>([]);
  const [variantKey, setVariantKey] = useState('rowerowa');
  const variantKeyRef = useRef('rowerowa');
  const [alert, setAlert] = useState<any>(null);
  const [mode, setMode] = useState<'gps' | 'sim'>('sim');
  const pausedRef = useRef(false);
  const [paused, setPausedState] = useState(false);
  const locSub = useRef<any>(null);
  const headSub = useRef<any>(null);
  const simTimer = useRef<any>(null);
  const alertTimer = useRef<any>(null);

  const setPaused = (v: boolean) => { pausedRef.current = v; setPausedState(v); };
  const setPhase = (p: 'approach' | 'trail') => { if (ride.current) ride.current.phase = p; setPhaseState(p); };

  /* ---- theme load/persist ---- */
  useEffect(() => {
    const t0 = Date.now();
    (async () => {
      const [t, ms, mr, fv, ac, th, rd, qz, rs, ar, arp, hi] = await Promise.all([AsyncStorage.getItem('theme'), AsyncStorage.getItem('mapStyle'), AsyncStorage.getItem('myRoutes'), AsyncStorage.getItem('favRoutes'), AsyncStorage.getItem('activityMode'), AsyncStorage.getItem('poiTypeHidden'), AsyncStorage.getItem('poiRadius'), AsyncStorage.getItem('quizState'), AsyncStorage.getItem('rideStats'), AsyncStorage.getItem('activeRide'), AsyncStorage.getItem('activeRideProgress'), AsyncStorage.getItem('rideHistory')]);
      setThemeState(t === 'light' || t === 'dark' ? t : 'light');
      if (ms) setMapStyleState(ms);
      if (mr) { try { setSavedRoutes(JSON.parse(mr)); } catch {} }
      if (fv) { try { setFavs(JSON.parse(fv)); } catch {} }
      if (ac === 'walk' || ac === 'bike') { setActivityState(ac); CURRENT_ACTIVITY = ac; setPlanProfile(ac === 'walk' ? 'spacerowa' : 'rowerowa'); }
      if (th) { try { const arr = JSON.parse(th); if (Array.isArray(arr)) setTypeHidden(arr); } catch {} }
      if (rd) { const n = +rd; if (n > 0) setNearbyRadius(n); }
      if (qz) { try { const q = JSON.parse(qz); if (q && typeof q.points === 'number' && q.done) setQuizState(q); } catch {} }
      if (rs) { try { const v = JSON.parse(rs); if (v && typeof v.trips === 'number') setRideStats({ trips: v.trips || 0, km: v.km || 0, min: v.min || 0, badges: Array.isArray(v.badges) ? v.badges : [] }); } catch {} }
      if (ar) { try { const a = JSON.parse(ar); if (a && a.route && a.route.path) { let prog = null; try { prog = arp ? JSON.parse(arp) : null; } catch {} setPendingResume({ ...a, progress: prog }); setRoute(a.route); setRiding(true); } } catch {} } // aktywna trasa po restarcie → baner „Wróć do trasy"
      if (hi) { try { const h = JSON.parse(hi); if (Array.isArray(h)) setHistory(h); } catch {} }
      try { const last = await Location.getLastKnownPositionAsync(); if (last) setUserLoc([last.coords.latitude, last.coords.longitude]); } catch {}
      const vo = await AsyncStorage.getItem('voiceOn'); if (vo === '0') { setVoiceState(false); VOICE_ON = false; }
      prefsLoaded.current = true;
      // delikatny splash: krótkie przytrzymanie + fade-out
      const wait = Math.max(0, 700 - (Date.now() - t0));
      setTimeout(() => Animated.timing(splashAnim, { toValue: 0, duration: 480, useNativeDriver: true }).start(() => setShowSplash(false)), wait);
    })();
  }, []);
  useEffect(() => { if (prefsLoaded.current) AsyncStorage.setItem('poiTypeHidden', JSON.stringify(typeHidden)); }, [typeHidden]);
  useEffect(() => { if (prefsLoaded.current) AsyncStorage.setItem('poiRadius', String(nearbyRadius)); }, [nearbyRadius]);
  useEffect(() => { if (prefsLoaded.current) AsyncStorage.setItem('quizState', JSON.stringify(quizState)); }, [quizState]);
  const toggleFav = (id: string) => { setFavs((prev) => { const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]; AsyncStorage.setItem('favRoutes', JSON.stringify(next)); return next; }); };
  const setActivity = (a: 'bike' | 'walk') => { setActivityState(a); CURRENT_ACTIVITY = a; AsyncStorage.setItem('activityMode', a); setPlanProfile(a === 'walk' ? 'spacerowa' : 'rowerowa'); setPlanPts([]); setPlanRoute(null); setNearby([]); setAddedPois([]); };
  useEffect(() => { if (mapReady.current) callMap('setTheme', theme); }, [theme]);
  useEffect(() => { if (mapReady.current) callMap('setMapStyle', mapStyle); }, [mapStyle]);
  const toggleTheme = () => { const nt = theme === 'dark' ? 'light' : 'dark'; setThemeState(nt); AsyncStorage.setItem('theme', nt); };
  const setMapStyle = (key: string) => { setMapStyleState(key); AsyncStorage.setItem('mapStyle', key); callMap('setMapStyle', key); };

  // Pull-to-refresh = przeładowanie apki (żeby zobaczyć zmiany bez killowania)
  const reloadApp = useCallback(() => {
    try { if (DevSettings && typeof (DevSettings as any).reload === 'function') { (DevSettings as any).reload(); return; } } catch {}
    stopRide(); setSheet(null); setScreen('discover'); setRefreshing(false);
  }, []);
  const onRefresh = useCallback(() => { setRefreshing(true); setTimeout(reloadApp, 120); }, [reloadApp]);

  const callMap = useCallback((fn: string, ...args: any[]) => {
    if (Platform.OS === 'web') { try { webRef.current?.contentWindow?.postMessage(JSON.stringify({ __cmd: fn, args }), '*'); } catch {} return; }
    const a = args.map((x) => JSON.stringify(x)).join(',');
    webRef.current?.injectJavaScript(`window.${fn} && window.${fn}(${a}); true;`);
  }, []);

  const handleMapData = (raw: string) => {
    try {
      const m = JSON.parse(raw);
      if (m.type === 'ready') {
        mapReady.current = true;
        callMap('setTheme', theme);
        callMap('setMapStyle', mapStyle);
        if (screen === 'plan') callMap('setPlanning', true);
        if (pendingRoute.current) { callMap('setRoute', JSON.stringify(pendingRoute.current)); pendingRoute.current = null; }
      }
      if (m.type === 'poi' && route) setSheet(route.pois[m.idx]);
      if (m.type === 'mapclick') setPlanPts((prev) => [...prev, [m.lat, m.lon]]);
      if (m.type === 'wpmove') setPlanPts((prev) => prev.map((p, i) => (i === m.idx ? [m.lat, m.lon] : p)));
      if (m.type === 'wpdelete') Alert.alert('Usunąć punkt?', 'Punkt trasy zostanie usunięty.', [{ text: 'Anuluj', style: 'cancel' }, { text: 'Usuń', style: 'destructive', onPress: () => setPlanPts((prev) => prev.filter((_, i) => i !== m.idx)) }]);
      if (m.type === 'nearbytap') setNearbyTap({ idx: m.idx });
      if (m.type === 'genpick') { setGenAreaState({ lat: m.lat, lon: m.lon }); callMap('setGenArea', m.lat, m.lon, genRadius, true); }
    } catch {}
  };
  const onMessage = (e: any) => handleMapData(e.nativeEvent.data);
  // WEB: most odbierający komunikaty z iframe (mapa) przez window 'message'
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const h = (e: any) => { if (typeof e.data === 'string') handleMapData(e.data); };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  });

  const [navReturn, setNavReturn] = useState<'tab' | 'generate'>('tab'); // dokąd wraca „wstecz" z detalu/planera
  const openDetail = (r: any, ret: 'tab' | 'generate' = 'tab') => {
    setNavReturn(ret); setRoute(r); setScreen('detail');
    if (mapReady.current) setTimeout(() => { callMap('clearAll'); callMap('setRoute', JSON.stringify(r)); }, 60);
    else pendingRoute.current = r;
  };
  const backToDiscover = () => { stopRide(); setScreen('tab'); }; // koniec jazdy → zawsze dashboard
  const detailBack = () => { setScreen(navReturn === 'generate' ? 'generate' : 'tab'); setNavReturn('tab'); };
  const planBack = () => { setScreen(navReturn === 'generate' ? 'generate' : 'tab'); setNavReturn('tab'); };
  const goTab = (t: 'dashboard' | 'routes' | 'profile') => { setSheet(null); setTab(t); setScreen('tab'); }; // trasa zostaje aktywna (minimalizacja)
  const goPlan = () => { stopRide(); setSheet(null); setNavReturn('tab'); setScreen('plan'); };

  /* ---- planowanie tras ---- */
  useEffect(() => {
    if (!mapReady.current) return;
    const on = screen === 'plan';
    callMap('setPlanning', on);
    if (on) { callMap('setWaypoints', JSON.stringify(planPts)); callMap('setPlanRoute', JSON.stringify(planRoute ? planRoute.coords : [])); callMap('setPlanPois', JSON.stringify(addedPois)); if (planPts.length) callMap('fitPlan'); }
    else setNearbyOpen(false);
  }, [screen]);

  useEffect(() => {
    if (screen !== 'plan') return;
    callMap('setWaypoints', JSON.stringify(planPts));
    if (planPts.length < 2) { setPlanRoute(null); callMap('setPlanRoute', JSON.stringify([])); return; }
    let cancelled = false; setPlanLoading(true);
    routeThrough(planPts, planProfile).then((res) => {
      if (cancelled) return;
      setPlanLoading(false); setPlanRoute(res);
      setNearby([]); // geometria się zmieniła → odśwież sugestie POI przy następnym otwarciu
      callMap('setPlanRoute', JSON.stringify(res ? res.coords : []));
    });
    return () => { cancelled = true; };
  }, [planPts, planProfile]);

  const planUndo = () => setPlanPts((p) => p.slice(0, -1));
  const planClear = () => { setPlanPts([]); setPlanRoute(null); setNearby([]); setAddedPois([]); setNearbyOpen(false); callMap('clearPlan'); };
  const addedSnapshot = useRef<any[]>([]);
  const openNearby = async () => {
    if (!planRoute) return;
    addedSnapshot.current = addedPois;
    setNearbyOpen(true);
    callMap('setPlanClicks', false); // w trybie dodawania POI klik w mapę nie dodaje punktów ścieżki
    if (nearby.length === 0) { setNearbyLoading(true); const r = await fetchNearbyPlaces(planRoute.coords, activity); setNearbyLoading(false); setNearby(r); }
  };
  const saveNearby = () => { setNearbyOpen(false); callMap('clearNearbyMarkers'); callMap('setPlanClicks', true); };
  const cancelNearby = () => { setAddedPois(addedSnapshot.current); callMap('setPlanPois', JSON.stringify(addedSnapshot.current)); setNearbyOpen(false); callMap('clearNearbyMarkers'); callMap('setPlanClicks', true); };
  useEffect(() => {
    if (!nearbyOpen) return;
    const list = nearby.filter((p) => p.d <= nearbyRadius && !typeHidden.includes(p.kind));
    callMap('setNearbyMarkers', JSON.stringify(list));
  }, [nearbyOpen, nearby, typeHidden, nearbyRadius]);
  const togglePoi = (p: any) => {
    setAddedPois((prev) => {
      const ex = prev.some((x) => x.name === p.name && x.lat === p.lat);
      const next = ex ? prev.filter((x) => !(x.name === p.name && x.lat === p.lat)) : [...prev, { name: p.name, kind: p.kind, lat: p.lat, lon: p.lon, desc: '' }];
      callMap('setPlanPois', JSON.stringify(next)); return next;
    });
  };
  const planToRoute = () => ({
    id: 'my' + Date.now(), name: 'Moja trasa ' + (savedRoutes.length + 1), net: 'Moja trasa', netClass: 'rcn',
    region: 'Trasa zaplanowana', distance: +(planRoute.distM / 1000).toFixed(1), timeMin: planRoute.timeMin,
    difficulty: '—', color: '#3ee08a', desc: 'Trasa zaplanowana w aplikacji.', path: planRoute.coords,
    pois: addedPois.map((p) => ({ name: p.name, kind: p.kind, lat: p.lat, lon: p.lon, desc: p.desc || '' })),
    ascent: planRoute.ascent, descent: planRoute.descent, eles: planRoute.eles, surfaces: planRoute.surfaces, activity,
    waypoints: planPts,
  });
  const planSave = () => {
    if (!planRoute) return;
    const obj = planToRoute();
    const next = [obj, ...savedRoutes];
    setSavedRoutes(next); AsyncStorage.setItem('myRoutes', JSON.stringify(next));
    announceBanner('ZAPISANO TRASĘ', obj.name, 'checkmark-circle', fmtKm(planRoute.distM) + ' km · ' + planRoute.timeMin + ' min');
  };
  const planRideNow = () => { if (planRoute) openDetail(planToRoute()); };
  const deleteSaved = (id: string) => { const next = savedRoutes.filter((r) => r.id !== id); setSavedRoutes(next); AsyncStorage.setItem('myRoutes', JSON.stringify(next)); };
  const [renaming, setRenaming] = useState<any>(null);
  const [renameVal, setRenameVal] = useState('');
  const openRename = (r: any) => { setRenaming(r); setRenameVal(r.name); };
  const commitRename = () => {
    const nm = renameVal.trim();
    if (!renaming || !nm) { setRenaming(null); return; }
    const id = renaming.id;
    const next = savedRoutes.map((x) => (x.id === id ? { ...x, name: nm } : x));
    setSavedRoutes(next); AsyncStorage.setItem('myRoutes', JSON.stringify(next));
    setRoute((cur: any) => (cur && cur.id === id ? { ...cur, name: nm } : cur));
    setRenaming(null);
  };
  const [navAsk, setNavAsk] = useState<{ lat: number; lon: number } | null>(null);
  const openNavChooser = () => { const s0 = ride.current?.path?.[0]; if (s0) setNavAsk({ lat: s0[0], lon: s0[1] }); else startNav(); };

  /* ---- position / proximity ---- */
  const onPosition = useCallback((lat: number, lon: number, speedKmh?: number) => {
    const r = ride.current; if (!r) return;
    lastUser.current = [lat, lon];
    const follow = r.phase === 'trail' || (r.phase === 'approach' && navStartedRef.current);
    callMap('updateUser', lat, lon, follow);
    const elapsed = r.t0 ? (Date.now() - r.t0) / 1000 : 0;

    if (r.phase === 'approach') {
      let toStart: number, covered = 0;
      if (r.approach && r.approachCum) {
        const { cum: trav } = nearestCum(r.approach, r.approachCum, [lat, lon]);
        covered = trav; toStart = Math.max(0, r.approachCum[r.approachCum.length - 1] - trav);
      } else toStart = hav([lat, lon], r.joinPt || r.path[0]);
      setHud({
        done: covered, total: r.total, speed: speedKmh ?? 0, nextIcon: '🧭', nextKind: null, nextName: 'Dojazd do trasy',
        nextDist: toStart < 60 ? 'już na trasie' : toStart < 950 ? Math.round(toStart / 10) * 10 + ' m' : fmtKm(toStart) + ' km',
        elapsed, avg: elapsed > 5 ? (covered / elapsed) * 3.6 : 0,
      });
      if (hav([lat, lon], r.joinPt || r.path[0]) < 50) {
        setPhase('trail'); callMap('clearApproach'); setVariants([]); setNavStarted(false); callMap('fitAll');
        announceBanner('START', 'Jesteś na trasie!', 'flag', 'Zaczynamy — miłej drogi');
        speak('Jesteś na trasie. Zaczynamy.');
      }
      return;
    }

    const nc = nearestCum(r.path, r.cum, [lat, lon]);
    const onTrail = nc.dist < 60;
    if (r.maxTraveled == null) { r.maxTraveled = 0; r.maxIdx = 0; }
    if (onTrail && r.cum[nc.idx] > r.maxTraveled) { r.maxTraveled = r.cum[nc.idx]; r.maxIdx = nc.idx; }
    const traveled = r.maxTraveled; // POSTĘP MONOTONICZNY — nie cofa się, gdy zejdziesz z trasy (np. wrócisz do domu)
    callMap('setProgress', JSON.stringify(r.path.slice(0, (r.maxIdx || 0) + 1)));
    const ahead = r.pois.filter((p: any) => p._along > traveled - 30 && !p._skip).sort((a: any, b: any) => a._along - b._along)[0];
    let nextName = 'Meta', nextDist = fmtKm(Math.max(0, r.total - traveled)) + ' km', nextKind: string | null = null;
    if (ahead) {
      const left = Math.max(0, ahead._along - traveled);
      nextName = ahead.name; nextKind = ahead.kind;
      nextDist = left < 60 ? 'tuż obok' : left < 950 ? Math.round(left / 10) * 10 + ' m' : fmtKm(left) + ' km';
    }
    setHud({ done: traveled, total: r.total, speed: speedKmh ?? r.simSpeed ?? 0, nextName, nextDist, nextIcon: '', nextKind, elapsed, avg: elapsed > 5 ? (traveled / elapsed) * 3.6 : 0, off: !onTrail && nc.dist > 90 });
    r.pois.forEach((p: any) => {
      if (p._skip) return;
      const dd = hav([lat, lon], [p.lat, p.lon]);
      if (!p._voiced && dd < 320 && dd > 120) { p._voiced = true; speak('Za około ' + Math.round(dd / 50) * 50 + ' metrów ' + p.name); }
      if (!p._seen && dd < 130) { p._seen = true; announce(p); }
    });
    if (!r.lastSave || Date.now() - r.lastSave > 8000) { r.lastSave = Date.now(); AsyncStorage.setItem('activeRideProgress', JSON.stringify({ distM: traveled, elapsedSec: elapsed })); }
    if (traveled >= r.total - 5) finishRide();
  }, [callMap]);
  const skipNextPoi = () => { const r = ride.current; if (!r) return; const ahead = r.pois.filter((p: any) => p._along > (r.maxTraveled || 0) - 30 && !p._skip).sort((a: any, b: any) => a._along - b._along)[0]; if (ahead) { ahead._skip = true; Haptics.selectionAsync().catch(() => {}); } };

  const announce = (p: any) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    speak('Warto się zatrzymać. ' + p.name);
    notifyPoi(p.name, p.kind); // realne powiadomienie systemowe
    setAlert({ hd: 'WARTO SIĘ ZATRZYMAĆ', name: p.name, sub: p.kind + ' · dotknij, by przeczytać', kind: p.kind, poi: p });
    clearTimeout(alertTimer.current);
    alertTimer.current = setTimeout(() => setAlert(null), 6000);
  };
  const announceBanner = (hd: string, name: string, ion: string, sub: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setAlert({ hd, name, sub, ion, poi: null });
    clearTimeout(alertTimer.current);
    alertTimer.current = setTimeout(() => setAlert(null), 4500);
  };

  /* ---- approach variants ---- */
  const applyVariant = (key: string) => {
    const d = ride.current?.variantsData?.[key]; if (!d) return;
    ride.current.approach = d.coords; ride.current.approachCum = d.cum;
    callMap('setApproach', JSON.stringify(d.coords));
    setHud((h) => ({ ...h, nextIcon: '🧭', nextName: 'Dojazd do trasy', nextDist: fmtKm(d.dist) + ' km' }));
  };
  const selectVariant = (key: string) => { variantKeyRef.current = key; setVariantKey(key); applyVariant(key); };
  const startNav = () => {
    setNavStarted(true);
    const u = lastUser.current;
    if (u) callMap('recenter', u[0], u[1], 16);
  };
  const changeVariant = () => { setNavStarted(false); callMap('fitAll'); };

  const loadApproaches = async (u: number[], startPt: number[]) => {
    const VAR = approachVariants();
    setVariants(VAR.map((v) => ({ ...v, dist: null })));
    variantKeyRef.current = VAR[0].key; setVariantKey(VAR[0].key);
    await Promise.all(VAR.map(async (v) => {
      const coords = await routeApproach(u, startPt, v.profile);
      const cum = cumDist(coords); const dist = cum[cum.length - 1];
      if (!ride.current || ride.current.phase !== 'approach') return;
      ride.current.variantsData = ride.current.variantsData || {};
      ride.current.variantsData[v.key] = { coords, cum, dist };
      setVariants((prev) => prev.map((x) => (x.key === v.key ? { ...x, dist } : x)));
      if (variantKeyRef.current === v.key && !ride.current.approach) applyVariant(v.key);
    }));
  };

  /* ---- start / stop ---- */
  const startRide = async (m: 'gps' | 'sim', rt?: any) => {
    const r = rt || route;
    if (rt) setRoute(rt);
    const cum = cumDist(r.path), total = cum[cum.length - 1];
    r.pois.forEach((p: any) => { p._along = alongDist(r.path, cum, p); p._seen = false; p._voiced = false; p._skip = false; });
    ride.current = { path: r.path, cum, total, pois: r.pois, color: r.color, simDist: 0, simSpeed: 18, phase: 'trail', variantsData: null, approach: null, approachCum: null, t0: Date.now() };
    setMode(m); setPaused(false); setAlert(null); setVariants([]); setPhaseState('trail'); setNavStarted(false); setStatsOpen(false);
    setRiding(true); setPendingResume(null); setNavReturn('tab'); setScreen('ride');
    if (m === 'gps') AsyncStorage.setItem('activeRide', JSON.stringify({ route: r, mode: m })); // przeżyje restart/crash
    activateKeepAwakeAsync('ride').catch(() => {}); // ekran nie gaśnie podczas jazdy/spaceru
    // setRoute = pewność, że zaplanowana trasa jest narysowana i wykadrowana
    setTimeout(() => { callMap('setRoute', JSON.stringify(r)); callMap('startRideView', JSON.stringify(r)); callMap('clearApproach'); }, 80);

    if (m === 'gps') {
      ensureNotifPerm();
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setMode('sim'); startSim(); return; }
      try {
        const loc0 = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const u = [loc0.coords.latitude, loc0.coords.longitude];
        callMap('updateUser', u[0], u[1], false);
        const near = nearestCum(r.path, cum, u); // najbliższy punkt trasy
        if (ride.current && near.dist > 120) { // dalej niż 120 m od trasy → wyznacz dojazd do najbliższego punktu
          ride.current.joinPt = r.path[near.idx]; ride.current.joinIdx = near.idx;
          setPhase('approach');
          setHud((h) => ({ ...h, nextName: 'Wyznaczam dojazd…', nextDist: '', nextIcon: '🧭' }));
          loadApproaches(u, r.path[near.idx]);
          speak('Najpierw dojedźmy do trasy.');
        } else speak((CURRENT_ACTIVITY === 'walk' ? 'Zaczynamy spacer. ' : 'Zaczynamy. ') + 'Poprowadzę Cię.');
        // jeśli jesteśmy w pobliżu trasy (≤120 m) → kontynuujemy w trybie 'trail', bez prowadzenia na start
      } catch {}
      if (!ride.current) return;
      locSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 4, timeInterval: 1500 },
        (loc) => { const sp = loc.coords.speed; onPosition(loc.coords.latitude, loc.coords.longitude, sp && sp > 0 ? Math.round(sp * 3.6) : 0); }
      );
      try { headSub.current = await Location.watchHeadingAsync((h) => { const d = h.trueHeading != null && h.trueHeading >= 0 ? h.trueHeading : h.magHeading; if (d != null && d >= 0) callMap('updateHeading', Math.round(d)); }); } catch {}
    } else startSim();
  };

  const startSim = () => {
    const r = ride.current; if (!r) return;
    simTimer.current = setInterval(() => {
      if (pausedRef.current) return;
      r.simSpeed = Math.max(13, Math.min(24, r.simSpeed + Math.sin(Date.now() / 2200) * 0.7));
      r.simDist += (r.simSpeed / 3.6) * 0.25 * 30;
      if (r.simDist >= r.total) r.simDist = r.total;
      const pos = posAt(r.path, r.cum, r.simDist);
      onPosition(pos[0], pos[1], Math.round(r.simSpeed));
    }, 250);
  };

  const stopRide = () => {
    if (locSub.current) { locSub.current.remove(); locSub.current = null; }
    if (headSub.current) { headSub.current.remove(); headSub.current = null; }
    if (simTimer.current) { clearInterval(simTimer.current); simTimer.current = null; }
    clearTimeout(alertTimer.current);
    deactivateKeepAwake('ride').catch(() => {});
    AsyncStorage.removeItem('activeRide'); AsyncStorage.removeItem('activeRideProgress'); // koniec trasy → nie wznawiaj po restarcie
    ride.current = null; setRiding(false); setPendingResume(null); setAlert(null); setVariants([]); setNavStarted(false);
    if (mapReady.current) callMap('clearAll');
  };
  const minimizeRide = () => { setSheet(null); setTab('dashboard'); setScreen('tab'); }; // zostaw trasę aktywną
  // Wznów: w pamięci → wróć na ekran; po restarcie → zapytaj (Kontynuuj / Zakończ i podsumuj)
  const resumeRide = () => {
    if (ride.current) { setScreen('ride'); return; }
    if (!pendingResume) return;
    const r = pendingResume.route, prog = pendingResume.progress;
    const totalM = (r.distance || 0) * 1000;
    const opts: any[] = [{ text: 'Anuluj', style: 'cancel' }];
    if (prog && prog.distM > 200) opts.push({ text: 'Zakończ i podsumuj', onPress: () => { if (r.activity && r.activity !== activity) setActivity(r.activity); setRoute(r); setTimeout(() => concludeRide(prog.distM, prog.elapsedSec || 0, prog.distM >= totalM - 60), 20); } });
    opts.push({ text: 'Kontynuuj', onPress: () => startRide(pendingResume.mode || 'gps', r) });
    Alert.alert('Niezakończona trasa', (r.name || 'Twoja trasa') + (prog && prog.distM ? `\nPokonano ok. ${fmtKm(prog.distM)} km` : ''), opts);
  };
  const locateMe = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      // natychmiast: ostatnia znana pozycja → mapa od razu skacze na mnie
      try { const last = await Location.getLastKnownPositionAsync(); if (last) { callMap('updateUser', last.coords.latitude, last.coords.longitude, false); callMap('recenter', last.coords.latitude, last.coords.longitude, 16); } } catch {}
      // szybki dokładniejszy fix
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      callMap('updateUser', loc.coords.latitude, loc.coords.longitude, false);
      callMap('recenter', loc.coords.latitude, loc.coords.longitude, 16);
      setUserLoc([loc.coords.latitude, loc.coords.longitude]);
    } catch {}
  };

  /* ---- Generator tras ---- */
  const enterGenerator = () => { setGenStep('area'); setGenAreaState(null); setGenResults([]); setGenCfg((c: any) => ({ ...c, activity })); setScreen('generate'); setTimeout(() => { callMap('clearAll'); callMap('setGenPick', true); }, 60); };
  const exitGenerator = () => { callMap('setGenPick', false); callMap('clearGen'); setScreen('tab'); setTab('dashboard'); };
  const setGenRadiusV = (r: number) => { setGenRadius(r); if (genArea) callMap('setGenArea', genArea.lat, genArea.lon, r, false); };
  const genNext = () => { callMap('setGenPick', false); setGenStep('config'); };
  const genBack = () => { if (genStep === 'results') setGenStep('config'); else if (genStep === 'config') { setGenStep('area'); callMap('setGenPick', true); if (genArea) callMap('setGenArea', genArea.lat, genArea.lon, genRadius, true); } else exitGenerator(); };
  const runGenerate = async () => { if (!genArea) return; setGenStep('results'); setGenLoading(true); try { const res = await generateRoutes({ ...genArea, radius: genRadius }, genCfg, genCfg.activity); setGenResults(res); } catch { setGenResults([]); } setGenLoading(false); };
  const genSave = (r: any) => { const next = [r, ...savedRoutes]; setSavedRoutes(next); AsyncStorage.setItem('myRoutes', JSON.stringify(next)); announceBanner('ZAPISANO TRASĘ', r.name, 'checkmark-circle', fmtKm(r.distance * 1000) + ' km'); };
  const genFocus = (r: any) => { setRoute(r); callMap('clearGen'); callMap('setRoute', JSON.stringify(r)); }; // rysuj wybraną trasę na mapie pod sliderem
  const genPreview = (r: any) => { callMap('setGenPick', false); callMap('clearGen'); openDetail(r, 'generate'); };
  const genEdit = (r: any) => { callMap('setGenPick', false); callMap('clearGen'); if (r.activity && r.activity !== activity) setActivity(r.activity); setNavReturn('generate'); setTimeout(() => { setAddedPois((r.pois || []).map((p: any) => ({ name: p.name, kind: p.kind, lat: p.lat, lon: p.lon, desc: '' }))); setPlanPts(r.waypoints || []); setScreen('plan'); }, 30); };
  // Edycja zapisanej/wygenerowanej trasy → wczytaj do planera (waypointy + POI)
  const editSaved = (r: any) => {
    if (r.activity && r.activity !== activity) setActivity(r.activity);
    setNavReturn('tab');
    setTimeout(() => {
      setAddedPois((r.pois || []).map((p: any) => ({ name: p.name, kind: p.kind, lat: p.lat, lon: p.lon, desc: '' })));
      setPlanPts(r.waypoints && r.waypoints.length >= 2 ? r.waypoints : sampleArr(r.path || [], 6));
      setScreen('plan');
    }, 30);
  };
  // Miniatura trasy: sugestie zdjęć z Wikipedii punktów (region-relevant)
  const [thumbRoute, setThumbRoute] = useState<any>(null);
  const [thumbCands, setThumbCands] = useState<string[]>([]);
  const [thumbLoading, setThumbLoading] = useState(false);
  const openThumb = async (r: any) => {
    setThumbRoute(r); setThumbCands([]); setThumbLoading(true);
    const wikis = (r.pois || []).map((p: any) => p.wikipedia).filter(Boolean);
    const urls: string[] = [];
    for (const w of wikis) { try { const u = await fetchWikiImage(w, 700); if (u && !urls.includes(u)) urls.push(u); } catch {} if (urls.length >= 8) break; }
    setThumbCands(urls); setThumbLoading(false);
  };
  const pickThumb = (url: string | null) => {
    if (!thumbRoute) return;
    const id = thumbRoute.id;
    setSavedRoutes((prev) => { const next = prev.map((x) => (x.id === id ? { ...x, thumb: url || undefined } : x)); AsyncStorage.setItem('myRoutes', JSON.stringify(next)); return next; });
    setRoute((cur: any) => (cur && cur.id === id ? { ...cur, thumb: url || undefined } : cur));
    if (url) imgCache[id] = url; else delete imgCache[id];
    setThumbRoute(null);
  };
  // Podsumowanie trasy z FAKTYCZNEGO postępu (distM) — używane i przy ukończeniu, i przy „Zakończ"
  const concludeRide = (distM: number, elapsedSec: number, finished: boolean) => {
    const act = route?.activity || 'bike';
    const kcal = calcKcal(distM, elapsedSec / 60, act);
    const poiCount = route?.pois?.length || 0;
    const trips = rideStats.trips + 1;
    const km = +(rideStats.km + distM / 1000).toFixed(1);
    const min = rideStats.min + Math.max(1, Math.round(elapsedSec / 60));
    const have = new Set(rideStats.badges); const earned: string[] = [];
    const give = (k: string) => { if (BADGES[k] && !have.has(k)) { have.add(k); earned.push(k); } };
    give('first'); give(act === 'walk' ? 'walker' : 'cyclist');
    if (finished && poiCount >= 3) give('explorer');
    if (trips >= 5) give('trips5'); if (trips >= 10) give('trips10');
    if (km >= 25) give('km25'); if (km >= 100) give('km100');
    const next = { trips, km, min, badges: Array.from(have) };
    setRideStats(next); AsyncStorage.setItem('rideStats', JSON.stringify(next));
    setSummary({ name: route?.name || 'Trasa', distM, elapsedSec, kcal, act, poiCount, finished, avg: elapsedSec > 0 ? (distM / 1000) / (elapsedSec / 3600) : 0, ascent: finished ? (route?.ascent ?? null) : null, earned });
    const entry = { id: 'h' + Date.now(), name: route?.name || 'Trasa', activity: act, distM, elapsedSec, kcal, finished, dateMs: Date.now(), path: sampleArr(route?.path || [], 40), color: route?.color || '#3ee08a' };
    setHistory((prev) => { const h = [entry, ...prev].slice(0, 60); AsyncStorage.setItem('rideHistory', JSON.stringify(h)); return h; });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    speak(finished ? 'Brawo! Trasa ukończona.' : 'Trasa zakończona. Do zobaczenia.');
    stopRide(); setScreen('summary');
  };
  const finishRide = () => { const r = ride.current; concludeRide(r ? r.total : route.distance * 1000, r && r.t0 ? (Date.now() - r.t0) / 1000 : route.timeMin * 60, true); };
  // „Zakończ" — podsumowanie dotychczasowego postępu (lub zwykłe wyjście, gdy prawie nic nie pokonano)
  const endRide = () => {
    const r = ride.current;
    const coveredM = r ? Math.max(r.maxTraveled || 0, 0) : 0;
    const elapsedSec = r && r.t0 ? (Date.now() - r.t0) / 1000 : 0;
    if (!r || coveredM < 200) { backToDiscover(); return; }
    const finished = coveredM >= r.total - 60;
    concludeRide(finished ? r.total : coveredM, elapsedSec, finished);
  };

  useEffect(() => () => stopRide(), []);

  /* ============================ UI ============================ */
  return (
    <View style={s.root}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />

      {/* Mapa zawsze zamontowana (bez przeładowań); ekrany opaque ją zasłaniają */}
      <View style={s.mapFull}>
        {isWeb
          ? React.createElement('iframe', { ref: webRef, srcDoc: MAP_HTML, allow: 'geolocation', style: { border: 'none', width: '100%', height: '100%', display: 'block' } })
          : <WebView ref={webRef} originWhitelist={['*']} source={{ html: MAP_HTML }} onMessage={onMessage} style={{ backgroundColor: C.bg }} scrollEnabled={false} />}
      </View>

      {screen === 'detail' && <DetailScreen C={C} s={s} route={route} onBack={detailBack} onPoi={setSheet} onStart={startRide} onLayers={() => setStyleOpen(true)} callMapFit={(b: number) => callMap('fitRoutePadded', b)} onFocusPoi={(la: number, lo: number) => callMap('focusPoi', la, lo)} onRename={openRename} onEdit={editSaved} onThumb={openThumb} />}
      {screen === 'ride' && (
        <RideOverlay C={C} s={s} phase={phase} hud={hud} mode={mode} paused={paused} activity={route?.activity || 'bike'}
          variants={variants} variantKey={variantKey} onSelectVariant={selectVariant}
          navStarted={navStarted} onStartNav={openNavChooser} onChangeVariant={changeVariant}
          statsOpen={statsOpen} onToggleStats={() => setStatsOpen((o) => !o)} onSkipPoi={skipNextPoi}
          onToggleMode={() => { const next = mode === 'gps' ? 'sim' : 'gps'; stopRide(); startRide(next); }}
          onPause={() => setPaused(!pausedRef.current)} onStop={endRide} onRecenter={() => callMap('fitAll')} onLayers={() => setStyleOpen(true)} onMinimize={minimizeRide} />
      )}

      {screen === 'tab' && tab === 'dashboard' && <Dashboard C={C} s={s} activity={activity} onSetActivity={setActivity} onOpen={openDetail} saved={savedRoutes} favs={favs} onFav={toggleFav} onPlan={goPlan} onGenerate={enterGenerator} onRoutes={() => goTab('routes')} refreshing={refreshing} onRefresh={onRefresh} riding={riding} rideName={route?.name} onResume={resumeRide} rideProgress={riding ? { inMemory: !!ride.current, done: ride.current ? hud.done : (pendingResume?.progress?.distM || 0), total: ride.current ? hud.total : (route?.distance || 0) * 1000, elapsed: ride.current ? hud.elapsed : (pendingResume?.progress?.elapsedSec || 0), nextName: hud.nextName, nextDist: hud.nextDist, activity: route?.activity || 'bike', game: !!route?.game } : null} />}
      {screen === 'tab' && tab === 'routes' && <RoutesList C={C} s={s} activity={activity} onOpen={openDetail} saved={savedRoutes} onDeleteSaved={deleteSaved} refreshing={refreshing} onRefresh={onRefresh} onPlan={goPlan} favs={favs} onFav={toggleFav} userLoc={userLoc} />}
      {screen === 'tab' && tab === 'profile' && <Profile C={C} s={s} theme={theme} onToggleTheme={toggleTheme} onStyle={() => setStyleOpen(true)} saved={savedRoutes} activity={activity} onSetActivity={setActivity} quizState={quizState} rideStats={rideStats} history={history} voiceOn={voiceOn} onToggleVoice={toggleVoice} />}
      {screen === 'plan' && !nearbyOpen && <PlanScreen C={C} s={s} activity={activity} pts={planPts} profile={planProfile} setProfile={setPlanProfile} planRoute={planRoute} loading={planLoading} onUndo={planUndo} onClear={planClear} onSave={planSave} onRide={planRideNow} onLayers={() => setStyleOpen(true)} onFit={() => callMap('fitPlan')} onBack={planBack} addedPois={addedPois} onOpenNearby={openNearby} />}
      {screen === 'plan' && nearbyOpen && <NearbyExplore C={C} s={s} nearby={nearby} nearbyRadius={nearbyRadius} setNearbyRadius={setNearbyRadius} typeHidden={typeHidden} setTypeHidden={setTypeHidden} addedPois={addedPois} onTogglePoi={togglePoi} onOpenPoi={setSheet} onSave={saveNearby} onCancel={cancelNearby} onHighlight={(p: any) => callMap('highlightPoi', p.lat, p.lon)} loading={nearbyLoading} tapIdx={nearbyTap} />}

      {screen === 'summary' && <SummaryScreen C={C} s={s} data={summary} onClose={() => { setSummary(null); goTab('dashboard'); }} onProfile={() => { setSummary(null); goTab('profile'); }} />}

      {screen === 'generate' && <GeneratorScreen C={C} s={s} step={genStep} area={genArea} radius={genRadius} setRadius={setGenRadiusV} cfg={genCfg} setCfg={setGenCfg} loading={genLoading} results={genResults} onNext={genNext} onGenerate={runGenerate} onBack={genBack} onClose={exitGenerator} onSave={genSave} onPreview={genPreview} onEdit={genEdit} onFocus={genFocus} onOpenPoi={setSheet} />}

      {(screen === 'plan' || (screen === 'generate' && genStep === 'area')) && (
        <TouchableOpacity style={s.locateBtn} activeOpacity={0.85} onPress={locateMe}>
          <View style={s.fitBtnInner}><Ionicons name="locate" size={20} color={C.txt} /></View>
        </TouchableOpacity>
      )}

      {screen === 'tab' && <BottomBar C={C} s={s} tab={tab} onTab={goTab} />}

      {alert && (
        <TouchableOpacity activeOpacity={0.9} style={s.alert} onPress={() => { if (alert.poi) setSheet(alert.poi); setAlert(null); }}>
          <View style={s.alertBlur}>
            <View style={s.alertIco}>{alert.kind ? <PoiGlyph kind={alert.kind} size={24} /> : <Ionicons name={(alert.ion || 'notifications') as any} size={22} color={C.accent} />}</View>
            <View style={{ flex: 1 }}>
              <Text style={s.alertHd}>{alert.hd}</Text>
              <Text style={s.alertName}>{alert.name}</Text>
              <Text style={s.alertSub}>{alert.sub}</Text>
            </View>
          </View>
        </TouchableOpacity>
      )}

      <Modal visible={!!sheet} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <TouchableOpacity style={s.scrim} activeOpacity={1} onPress={() => setSheet(null)} />
        <PoiSheet C={C} s={s} poi={sheet} onClose={() => setSheet(null)} quizDone={sheet ? quizState.done[sheet.name] : undefined} onQuizAnswer={answerQuiz} />
      </Modal>

      <Modal visible={!!navAsk} transparent animationType="slide" onRequestClose={() => setNavAsk(null)}>
        <TouchableOpacity style={s.scrim} activeOpacity={1} onPress={() => setNavAsk(null)} />
        <View style={s.navSheet}>
          <View style={s.grip} />
          <Text style={s.navSheetTitle}>Nawigacja do trasy</Text>
          <Text style={[s.sub, { marginTop: 2 }]}>Czym poprowadzić do początku trasy?</Text>
          <TouchableOpacity style={[s.btnPrimary, { marginTop: 16, flexDirection: 'row', gap: 8 }]} activeOpacity={0.85} onPress={() => { const a = navAsk; setNavAsk(null); if (a) { navTo(a.lat, a.lon, 'google'); startNav(); } }}>
            <Ionicons name="logo-google" size={16} color={C.bg} /><Text style={s.btnPrimaryTxt}>Mapy Google</Text>
          </TouchableOpacity>
          {Platform.OS === 'ios' && (
            <TouchableOpacity style={[s.btnSecondary, { marginTop: 10, flexDirection: 'row', gap: 8 }]} activeOpacity={0.8} onPress={() => { const a = navAsk; setNavAsk(null); if (a) { navTo(a.lat, a.lon, 'apple'); startNav(); } }}>
              <Ionicons name="map" size={16} color={C.txt} /><Text style={s.btnSecondaryTxt}>Mapy Apple</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[s.btnGhost, { marginTop: 6 }]} activeOpacity={0.7} onPress={() => { setNavAsk(null); startNav(); }}>
            <Text style={[s.btnGhostTxt, { color: C.dim }]}>Prowadź w aplikacji</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={!!renaming} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <View style={s.renameWrap}>
          <View style={s.renameCard}>
            <Text style={s.navSheetTitle}>Zmień nazwę trasy</Text>
            <TextInput style={s.renameInput} value={renameVal} onChangeText={setRenameVal} placeholder="Nazwa trasy" placeholderTextColor={C.dim} autoFocus selectTextOnFocus maxLength={50} returnKeyType="done" onSubmitEditing={commitRename} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} activeOpacity={0.8} onPress={() => setRenaming(null)}><Text style={s.btnSecondaryTxt}>Anuluj</Text></TouchableOpacity>
              <TouchableOpacity style={[s.btnPrimary, { flex: 1 }]} activeOpacity={0.85} onPress={commitRename}><Text style={s.btnPrimaryTxt}>Zapisz</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!thumbRoute} transparent animationType="slide" onRequestClose={() => setThumbRoute(null)}>
        <TouchableOpacity style={s.scrim} activeOpacity={1} onPress={() => setThumbRoute(null)} />
        <View style={s.thumbSheet}>
          <View style={s.grip} />
          <Text style={s.navSheetTitle}>Miniatura trasy</Text>
          <Text style={[s.sub, { marginTop: 2, marginBottom: 12 }]}>Sugestie z okolicy (zdjęcia miejsc na trasie)</Text>
          {thumbLoading ? <View style={{ paddingVertical: 30, alignItems: 'center' }}><ActivityIndicator color={C.dim} /></View>
            : thumbCands.length === 0 ? <Text style={[s.sub, { paddingVertical: 20, textAlign: 'center' }]}>Brak zdjęć dla punktów tej trasy.</Text>
            : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {thumbCands.map((u) => (
                  <TouchableOpacity key={u} activeOpacity={0.85} onPress={() => pickThumb(u)} style={s.thumbCand}>
                    <ImageBackground source={{ uri: u }} style={{ width: '100%', height: '100%' }} imageStyle={{ borderRadius: 12 }}>
                      {thumbRoute?.thumb === u && <View style={s.thumbSel}><Ionicons name="checkmark-circle" size={22} color="#fff" /></View>}
                    </ImageBackground>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          <TouchableOpacity style={[s.btnGhost, { marginTop: 14 }]} activeOpacity={0.7} onPress={() => pickThumb(null)}><Text style={[s.btnGhostTxt, { color: C.dim }]}>Bez zdjęcia (kształt trasy)</Text></TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={styleOpen} transparent animationType="slide" onRequestClose={() => setStyleOpen(false)}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setStyleOpen(false)} />
        <View style={s.stylePanel}>
          <View style={s.grip} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={s.sheetName}>Styl mapy</Text>
            <TouchableOpacity onPress={() => setStyleOpen(false)}><Text style={{ color: C.accent, fontWeight: '700', fontSize: 15 }}>Gotowe</Text></TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 14, paddingRight: 8 }}>
            {MAP_STYLES.map((st) => {
              const on = mapStyle === st.key;
              return (
                <TouchableOpacity key={st.key} activeOpacity={0.8} style={[s.styleChip, on && s.styleChipOn]} onPress={() => setMapStyle(st.key)}>
                  <Ionicons name={st.ion as any} size={24} color={on ? C.bg : C.accent} />
                  <Text style={[s.styleChipLabel, on && s.styleChipLabelOn, { marginTop: 6 }]}>{st.label}</Text>
                  <Text style={[s.styleChipDesc, on && s.styleChipLabelOn]}>{st.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {showSplash && (
        <Animated.View style={[s.splash, { opacity: splashAnim }]} pointerEvents="none">
          <View style={s.splashLogo}><Ionicons name="bicycle" size={52} color={C.accent} /></View>
          <Text style={s.splashTitle}>VeloMałopolska</Text>
          <Text style={s.splashSub}>Trasy rowerowe Małopolski</Text>
          <ActivityIndicator color={C.dim} style={{ marginTop: 24 }} />
        </Animated.View>
      )}
    </View>
  );
}

/* ---------- Discover ---------- */
function ElevationChart({ C, eles, width }: any) {
  if (!eles || eles.length < 2) return null;
  const W = width, H = 70;
  const min = Math.min(...eles), max = Math.max(...eles), range = Math.max(8, max - min);
  const n = eles.length;
  const xy = eles.map((e: number, i: number) => [(i / (n - 1)) * W, H - 6 - ((e - min) / range) * (H - 12)]);
  const line = 'M' + xy.map((p: number[]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L');
  const area = `M0,${H} L` + xy.map((p: number[]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L') + ` L${W},${H} Z`;
  return (
    <Svg width={W} height={H}>
      <SvgPath d={area} fill={C.accent + '26'} />
      <SvgPath d={line} stroke={C.accent} strokeWidth={2} fill="none" />
    </Svg>
  );
}
function RouteStats({ s, distM, timeMin, ascent, descent, showElevation = true }: any) {
  return (
    <View style={s.statRow4}>
      <View style={s.stat4}><Text style={s.stat4v}>{fmtKm(distM)}</Text><Text style={s.stat4l}>km</Text></View>
      <View style={s.stat4}><Text style={s.stat4v}>{timeMin}</Text><Text style={s.stat4l}>min</Text></View>
      {showElevation && <View style={s.stat4}><Text style={s.stat4v}>↑{ascent != null ? ascent : '–'}</Text><Text style={s.stat4l}>podjazd</Text></View>}
      {showElevation && <View style={s.stat4}><Text style={s.stat4v}>↓{descent != null ? descent : '–'}</Text><Text style={s.stat4l}>zjazd</Text></View>}
    </View>
  );
}
function SurfaceBars({ s, surfaces }: any) {
  if (!surfaces || !surfaces.length) return null;
  const total = surfaces.reduce((a: number, x: any) => a + x.meters, 0) || 1;
  return (
    <View style={{ marginTop: 4 }}>
      <View style={s.surfaceBar}>
        {surfaces.map((x: any, i: number) => <View key={i} style={{ flex: Math.max(0.02, x.meters / total), backgroundColor: x.color }} />)}
      </View>
      <View style={s.surfaceLegend}>
        {surfaces.map((x: any, i: number) => (
          <View key={i} style={s.surfaceLegItem}>
            <View style={[s.surfaceDot, { backgroundColor: x.color }]} />
            <Text style={s.surfaceLegTxt}>{x.label} {Math.round(100 * x.meters / total)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Miniatura: kształt trasy gdy brak zdjęcia (lekka „mapka”)
function RouteThumb({ route, C }: any) {
  const path = sampleArr(route.path || [], 60);
  const col = route.color || '#3ee08a';
  if (path.length < 2) return <View style={[StyleSheet.absoluteFill, { backgroundColor: col + '22' }]} />;
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const p of path) { if (p[0] < minLat) minLat = p[0]; if (p[0] > maxLat) maxLat = p[0]; if (p[1] < minLon) minLon = p[1]; if (p[1] > maxLon) maxLon = p[1]; }
  const midLat = (minLat + maxLat) / 2, kx = Math.cos((midLat * Math.PI) / 180);
  const w = Math.max(1e-6, (maxLon - minLon) * kx), h = Math.max(1e-6, maxLat - minLat);
  const scale = 88 / Math.max(w, h), ox = (100 - w * scale) / 2, oy = (100 - h * scale) / 2;
  const pts = path.map((p: number[]) => [ox + (p[1] - minLon) * kx * scale, oy + (maxLat - p[0]) * scale]);
  const d = 'M' + pts.map((p: number[]) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L');
  const last = pts[pts.length - 1];
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: col + '1f' }]}>
      <Svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <SvgPath d={d} stroke="#ffffff" strokeOpacity={0.55} strokeWidth={5.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <SvgPath d={d} stroke={col} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <SvgCircle cx={pts[0][0]} cy={pts[0][1]} r={3.6} fill={col} stroke="#fff" strokeWidth={1.5} />
        <SvgCircle cx={last[0]} cy={last[1]} r={3.6} fill="#11151a" stroke="#fff" strokeWidth={1.5} />
      </Svg>
    </View>
  );
}

function RouteCard({ C, s, route, big, fav, onFav, onOpen, onLongPress }: any) {
  const hero = (route.pois || []).find((p: any) => p.wikipedia);
  const [img, setImg] = useState<string | null>(route.thumb || imgCache[route.id] || null);
  useEffect(() => {
    if (route.thumb) { setImg(route.thumb); return; } // własna miniatura wybrana przez użytkownika
    if (route.id in imgCache) { setImg(imgCache[route.id]); return; }
    if (!hero) { imgCache[route.id] = null; return; }
    let c = false;
    fetchWikiImage(hero.wikipedia, big ? 800 : 600).then((u) => { imgCache[route.id] = u; if (!c) setImg(u); });
    return () => { c = true; };
  }, [route.id, route.thumb]);
  const inner = (
    <>
      <View style={s.cardTags}>
        <View style={s.tagPill}><Text style={s.tagPillTxt}>{route.net}</Text></View>
        {route.difficulty && route.difficulty !== '—' && <View style={s.tagPill}><Text style={s.tagPillTxt}>{route.difficulty}</Text></View>}
      </View>
      {onFav && (
        <TouchableOpacity style={s.heart} activeOpacity={0.8} onPress={() => onFav(route.id)}>
          <Ionicons name={fav ? 'heart' : 'heart-outline'} size={17} color={fav ? '#ff4d6d' : '#11151a'} />
        </TouchableOpacity>
      )}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.82)']} style={s.cardGrad}>
        <Text style={s.cardImgTitle} numberOfLines={2}>{route.name}</Text>
        <Text style={s.cardImgMeta}>{fmtKm(route.distance * 1000)} km · {route.timeMin} min{route.pois?.length ? ` · ${route.pois.length} miejsc` : ''}</Text>
      </LinearGradient>
    </>
  );
  return (
    <TouchableOpacity style={big ? s.bigCard : s.imgCard} activeOpacity={0.88} onPress={() => onOpen(route)} onLongPress={onLongPress}>
      {img ? (
        <ImageBackground source={{ uri: img }} style={s.cardImgBg} imageStyle={{ borderRadius: 20 }}>
          <View style={s.cardOverlay} />{inner}
        </ImageBackground>
      ) : (
        <View style={[s.cardImgBg, { backgroundColor: C.bg }]}>
          <RouteThumb route={route} C={C} />
          {inner}
        </View>
      )}
    </TouchableOpacity>
  );
}

/* ---------- Dashboard ---------- */
function Dashboard({ C, s, activity, onSetActivity, onOpen, saved, favs, onFav, onPlan, onGenerate, onRoutes, refreshing, onRefresh, riding, rideName, onResume, rideProgress }: any) {
  const cardProps = (r: any) => ({ C, s, route: r, fav: favs.includes(r.id), onFav, onOpen });
  const catRoutes = ROUTES.filter((r: any) => (r.activity || 'bike') === activity);
  const catSaved = saved.filter((r: any) => (r.activity || 'bike') === activity);
  return (
    <ScrollView style={s.flex} contentContainerStyle={{ paddingBottom: 110 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.dim} colors={[C.accent]} />}>
      <View style={{ paddingTop: 64, paddingHorizontal: 20 }}>
        <Text style={s.h1}>Cześć!</Text>
        <Text style={s.sub}>{activity === 'walk' ? 'Gotowy na spacer?' : 'Gotowy na trasę?'}</Text>
      </View>
      {riding && (() => {
        const rp = rideProgress; const live = rp && rp.inMemory;
        const sub = rp ? `${fmtKm(rp.done)} km · ${fmtTime(rp.elapsed)}` : '';
        const nextTxt = live && rp.nextName && rp.nextName !== 'Meta' ? `${rp.game ? 'Następne zadanie' : 'Dalej'}: ${rp.nextName} · ${rp.nextDist}` : (live ? 'Zbliżasz się do mety' : 'Dotknij, by wznowić lub zakończyć');
        return (
          <TouchableOpacity style={s.resumeBar} activeOpacity={0.9} onPress={onResume}>
            <View style={s.resumeIco}><Ionicons name={(rp?.activity || activity) === 'walk' ? 'walk' : 'navigate'} size={20} color={C.bg} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.resumeLabel}>{live ? 'TRASA W TOKU' : 'NIEZAKOŃCZONA TRASA'}{sub ? ` · ${sub}` : ''}</Text>
              <Text style={s.resumeName} numberOfLines={1}>{rideName || 'Twoja trasa'}</Text>
              <Text style={s.resumeNext} numberOfLines={1}>{nextTxt}</Text>
            </View>
            <View style={s.resumeGo}><Text style={s.resumeGoTxt}>{live ? 'Wróć' : 'Wznów'}</Text></View>
          </TouchableOpacity>
        );
      })()}
      <View style={{ paddingHorizontal: 18, marginTop: 16 }}>
        <View style={s.segment}>
          <TouchableOpacity style={[s.segBtn, activity === 'bike' && s.segBtnOn]} activeOpacity={0.85} onPress={() => onSetActivity('bike')}>
            <Ionicons name="bicycle" size={18} color={activity === 'bike' ? C.bg : C.txt} /><Text style={[s.segTxt, activity === 'bike' && s.segTxtOn]}>Rower</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.segBtn, activity === 'walk' && s.segBtnOn]} activeOpacity={0.85} onPress={() => onSetActivity('walk')}>
            <Ionicons name="walk" size={18} color={activity === 'walk' ? C.bg : C.txt} /><Text style={[s.segTxt, activity === 'walk' && s.segTxtOn]}>Spacer</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <TouchableOpacity style={[s.btnPrimary, { flex: 1, flexDirection: 'row', gap: 7 }]} activeOpacity={0.85} onPress={onPlan}>
            <Ionicons name="add" size={19} color={C.bg} /><Text style={s.btnPrimaryTxt}>{activity === 'walk' ? 'Zaplanuj' : 'Zaplanuj'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btnSecondary, { flex: 1, flexDirection: 'row', gap: 7 }]} activeOpacity={0.85} onPress={onGenerate}>
            <Ionicons name="sparkles-outline" size={17} color={C.txt} /><Text style={s.btnSecondaryTxt}>Generuj</Text>
          </TouchableOpacity>
        </View>

        <View style={s.dashStats}>
          <View style={s.dashStat}><Ionicons name="map-outline" size={18} color={C.accent} /><Text style={s.dashStatV}>{catRoutes.length + catSaved.length}</Text><Text style={s.dashStatL}>{activity === 'walk' ? 'spacerów' : 'tras'}</Text></View>
          <View style={s.dashStat}><Ionicons name="heart-outline" size={18} color={C.accent} /><Text style={s.dashStatV}>{favs.length}</Text><Text style={s.dashStatL}>ulubione</Text></View>
          <View style={s.dashStat}><Ionicons name="bookmark-outline" size={18} color={C.accent} /><Text style={s.dashStatV}>{saved.length}</Text><Text style={s.dashStatL}>moje</Text></View>
        </View>
      </View>

      <View style={s.dashSectionRow}>
        <Text style={[s.sectionBig, { paddingTop: 22, paddingBottom: 0 }]}>Polecane</Text>
        <TouchableOpacity onPress={onRoutes} activeOpacity={0.7}><Text style={s.seeAll}>Wszystkie ›</Text></TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 12, paddingRight: 6 }}>
        {catRoutes.map((r: any) => <RouteCard key={r.id} {...cardProps(r)} big />)}
      </ScrollView>

      {catSaved.length > 0 && <>
        <Text style={s.sectionBig}>{activity === 'walk' ? 'Twoje spacery' : 'Twoje trasy'}</Text>
        <View style={{ paddingHorizontal: 18 }}>{catSaved.slice(0, 3).map((r: any) => <RouteCard key={r.id} {...cardProps(r)} />)}</View>
      </>}
    </ScrollView>
  );
}

/* ---------- Routes list ---------- */
function RoutesList({ C, s, activity, onOpen, saved, onDeleteSaved, refreshing, onRefresh, onPlan, favs, onFav, userLoc }: any) {
  const [q, setQ] = useState('');
  const [filt, setFilt] = useState('all');
  const FILTERS = [{ k: 'all', l: 'Wszystkie' }, ...(userLoc ? [{ k: 'near', l: 'Blisko mnie' }] : []), { k: 'fav', l: 'Ulubione' }, { k: 'mine', l: 'Moje' }, { k: 'Łatwa', l: 'Łatwe' }, { k: 'Średnia', l: 'Średnie' }];
  let all = [...saved, ...ROUTES].filter((r) => (r.activity || 'bike') === activity);
  if (q.trim()) all = all.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()));
  if (filt === 'fav') all = all.filter((r) => favs.includes(r.id));
  else if (filt === 'mine') all = all.filter((r) => saved.includes(r));
  else if (filt === 'Łatwa' || filt === 'Średnia') all = all.filter((r) => r.difficulty === filt);
  else if (filt === 'near' && userLoc) all = all.slice().sort((a, b) => hav(userLoc, a.path?.[0] || [0, 0]) - hav(userLoc, b.path?.[0] || [0, 0]));
  const cardProps = (r: any) => ({ C, s, route: r, fav: favs.includes(r.id), onFav, onOpen });
  return (
    <ScrollView style={s.flex} contentContainerStyle={{ paddingBottom: 110 }} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.dim} colors={[C.accent]} />}>
      <View style={s.header}>
        <Text style={s.h1}>Trasy</Text>
        <TouchableOpacity style={s.themeBtn} activeOpacity={0.8} onPress={onPlan}><Ionicons name="add" size={22} color={C.txt} /></TouchableOpacity>
      </View>
      <View style={{ paddingHorizontal: 18 }}>
        <View style={s.searchBar}>
          <Ionicons name="search" size={18} color={C.dim} />
          <TextInput style={s.searchInput} placeholder="Szukaj trasy…" placeholderTextColor={C.dim} value={q} onChangeText={setQ} returnKeyType="search" />
          {q.length > 0 && <TouchableOpacity onPress={() => setQ('')}><Ionicons name="close-circle" size={18} color={C.dim} /></TouchableOpacity>}
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 18, gap: 8 }}>
        {FILTERS.map((f) => { const on = filt === f.k; return (
          <TouchableOpacity key={f.k} style={[s.modePill, on && s.modePillOn]} activeOpacity={0.8} onPress={() => setFilt(f.k)}>
            <Text style={[s.modePillTxt, on && s.modePillTxtOn]}>{f.l}</Text>
          </TouchableOpacity>
        ); })}
      </ScrollView>
      <View style={{ paddingHorizontal: 18, paddingTop: 16 }}>
        {all.length === 0 ? <Text style={[s.sub, { textAlign: 'center', paddingTop: 30 }]}>Brak tras dla tego filtra</Text>
          : all.map((r) => <RouteCard key={r.id} {...cardProps(r)} onLongPress={saved.includes(r) ? () => onDeleteSaved(r.id) : undefined} />)}
      </View>
    </ScrollView>
  );
}

/* ---------- Plan ---------- */
function PlanScreen({ C, s, activity, pts, profile, setProfile, planRoute, loading, onUndo, onClear, onSave, onRide, onLayers, onFit, onBack, addedPois, onOpenNearby }: any) {
  const PROFS = activity === 'walk'
    ? [{ k: 'spacerowa', l: 'Spacerowa' }, { k: 'szlak', l: 'Szlak / górski' }, { k: 'krotka', l: 'Najkrótsza' }]
    : [{ k: 'rowerowa', l: 'Rowerowa' }, { k: 'spokojna', l: 'Spokojna' }, { k: 'gorska', l: 'Górska / MTB' }, { k: 'szutrowa', l: 'Szutrowa' }, { k: 'szybka', l: 'Najszybsza' }, { k: 'krotka', l: 'Najkrótsza' }];
  const W = Dimensions.get('window').width - 60;
  const [helpOpen, setHelpOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  return (
    <>
      <View style={s.planTop}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><Ionicons name="chevron-back" size={22} color={C.txt} /></TouchableOpacity>
          <Text style={[s.h2, { flex: 1 }]}>{activity === 'walk' ? 'Zaplanuj spacer' : 'Zaplanuj trasę'}</Text>
          <Text style={s.planCount}>{pts.length} pkt</Text>
          <TouchableOpacity onPress={() => setHelpOpen((o) => !o)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><Ionicons name="information-circle-outline" size={22} color={C.dim} /></TouchableOpacity>
        </View>
        {helpOpen && <Text style={[s.sub, { marginTop: 8 }]}>Dotknij mapy = dodaj punkt · przeciągnij = przesuń · przytrzymaj = usuń</Text>}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }} contentContainerStyle={{ gap: 8, paddingRight: 6 }}>
          {PROFS.map((p) => {
            const on = profile === p.k;
            return (
              <TouchableOpacity key={p.k} activeOpacity={0.8} style={[s.modePill, on && s.modePillOn]} onPress={() => setProfile(p.k)}>
                <Text style={[s.modePillTxt, on && s.modePillTxtOn]}>{p.l}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <TouchableOpacity style={[s.fitBtn, { top: 198 }]} activeOpacity={0.8} onPress={onFit}>
        <View style={s.fitBtnInner}><Ionicons name="scan-outline" size={20} color={C.txt} /></View>
      </TouchableOpacity>
      <TouchableOpacity style={[s.fitBtn, { top: 252 }]} activeOpacity={0.8} onPress={onLayers}>
        <View style={s.fitBtnInner}><Ionicons name="layers-outline" size={19} color={C.txt} /></View>
      </TouchableOpacity>

      <View style={s.planBottom}>
        {loading && <ActivityIndicator size="small" color={C.dim} style={{ position: 'absolute', top: 14, right: 16, zIndex: 2 }} />}
        {planRoute ? (
          <>
            <RouteStats s={s} distM={planRoute.distM} timeMin={planRoute.timeMin} ascent={planRoute.ascent} descent={planRoute.descent} showElevation={activity !== 'walk'} />
            <TouchableOpacity style={s.detailsToggle} activeOpacity={0.7} onPress={() => setDetailsOpen((o) => !o)}>
              <Text style={s.detailsToggleTxt}>Szczegóły trasy</Text>
              <Ionicons name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.dim} />
            </TouchableOpacity>
            {detailsOpen && <>{activity !== 'walk' && <ElevationChart C={C} eles={planRoute.eles} width={W} />}<SurfaceBars s={s} surfaces={planRoute.surfaces} /></>}
            <TouchableOpacity style={[s.nearbyBtn, { marginTop: 12 }]} activeOpacity={0.8} onPress={onOpenNearby}>
              <Ionicons name="location-outline" size={16} color={C.txt} />
              <Text style={s.rcTxt}>Punkty w pobliżu{addedPois.length ? ` · ${addedPois.length}` : ''}</Text>
              <Ionicons name="chevron-forward" size={16} color={C.dim} />
            </TouchableOpacity>
          </>
        ) : (
          <Text style={[s.sub, { textAlign: 'center', paddingVertical: 10 }]}>{loading ? 'Liczę trasę…' : 'Dodaj min. 2 punkty na mapie'}</Text>
        )}
        <View style={s.planActions}>
          <TouchableOpacity style={s.iconBtn} activeOpacity={0.8} onPress={onUndo}><Ionicons name="arrow-undo-outline" size={19} color={C.txt} /></TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} activeOpacity={0.8} onPress={onClear}><Ionicons name="trash-outline" size={19} color={C.txt} /></TouchableOpacity>
          <TouchableOpacity style={[s.btnSecondary, { flex: 1, paddingVertical: 13 }, !planRoute && { opacity: 0.4 }]} activeOpacity={0.8} disabled={!planRoute} onPress={onSave}><Text style={s.btnSecondaryTxt}>Zapisz</Text></TouchableOpacity>
          <TouchableOpacity style={[s.btnPrimary, s.btnRow, { flex: 1, paddingVertical: 13 }, !planRoute && { opacity: 0.4 }]} activeOpacity={0.85} disabled={!planRoute} onPress={onRide}><Ionicons name="navigate" size={16} color={C.bg} /><Text style={s.btnPrimaryTxt}>Jedź</Text></TouchableOpacity>
        </View>
      </View>
    </>
  );
}

/* ---------- Profil ---------- */
function Profile({ C, s, theme, onToggleTheme, onStyle, saved, activity, onSetActivity, quizState, rideStats, history, voiceOn, onToggleVoice }: any) {
  const rs = rideStats || { trips: 0, km: 0, min: 0, badges: [] };
  const earnedBadges = new Set(rs.badges || []);
  const done = quizState?.done || {};
  const answered = Object.keys(done).length;
  const correct = Object.values(done).filter((v: any) => v === 1).length;
  const acc = answered ? Math.round((correct / answered) * 100) : 0;
  const pts = quizState?.points || 0;
  const total = Object.keys(QUIZZES).length;
  return (
    <ScrollView style={s.flex} contentContainerStyle={{ paddingBottom: 110 }}>
      <View style={s.header}><Text style={s.h1}>Profil</Text></View>
      <View style={{ paddingHorizontal: 18 }}>
        <Text style={[s.groupLabel, { marginTop: 0 }]}>Tryb aktywności</Text>
        <View style={s.segment}>
          <TouchableOpacity style={[s.segBtn, activity === 'bike' && s.segBtnOn]} activeOpacity={0.85} onPress={() => onSetActivity('bike')}>
            <Ionicons name="bicycle" size={18} color={activity === 'bike' ? C.bg : C.txt} />
            <Text style={[s.segTxt, activity === 'bike' && s.segTxtOn]}>Rower</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.segBtn, activity === 'walk' && s.segBtnOn]} activeOpacity={0.85} onPress={() => onSetActivity('walk')}>
            <Ionicons name="walk" size={18} color={activity === 'walk' ? C.bg : C.txt} />
            <Text style={[s.segTxt, activity === 'walk' && s.segTxtOn]}>Spacer</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.groupLabel}>Wyzwania</Text>
        <View style={s.quizBanner}>
          <View style={{ flex: 1 }}>
            <Text style={s.quizBannerLabel}>POZIOM</Text>
            <Text style={s.quizBannerLevel}>{quizLevel(pts)}</Text>
          </View>
          <View style={s.quizBannerPts}><Text style={s.quizBannerPtsV}>{pts}</Text><Text style={s.quizBannerPtsL}>pkt</Text></View>
        </View>
        <View style={[s.profStatsRow, { marginTop: 10 }]}>
          <View style={s.profStat}><Text style={s.profStatV}>{answered}/{total}</Text><Text style={s.statL}>rozwiązane</Text></View>
          <View style={s.profStat}><Text style={s.profStatV}>{correct}</Text><Text style={s.statL}>poprawne</Text></View>
          <View style={s.profStat}><Text style={s.profStatV}>{acc}%</Text><Text style={s.statL}>trafność</Text></View>
        </View>

        <Text style={s.groupLabel}>Twoje liczby</Text>
        <View style={s.profStatsRow}>
          <View style={s.profStat}><Text style={s.profStatV}>{rs.trips}</Text><Text style={s.statL}>{activity === 'walk' ? 'wycieczki' : 'wyprawy'}</Text></View>
          <View style={s.profStat}><Text style={s.profStatV}>{rs.km}</Text><Text style={s.statL}>km łącznie</Text></View>
          <View style={s.profStat}><Text style={s.profStatV}>{saved.length}</Text><Text style={s.statL}>zaplanowane</Text></View>
        </View>

        <Text style={s.groupLabel}>Odznaki</Text>
        <View style={s.badgeGrid}>
          {Object.keys(BADGES).map((k) => { const on = earnedBadges.has(k); return (
            <View key={k} style={[s.badgeChip, !on && s.badgeChipLocked]}>
              <View style={[s.badgeChipIco, on && { backgroundColor: C.accent + '22', borderColor: C.accent }]}><Ionicons name={BADGES[k].icon as any} size={20} color={on ? C.accent : C.dim} /></View>
              <Text style={[s.badgeChipTxt, !on && { color: C.dim }]} numberOfLines={2}>{BADGES[k].name}</Text>
            </View>
          ); })}
        </View>

        <Text style={s.groupLabel}>Historia</Text>
        {(!history || history.length === 0) ? (
          <View style={s.card}><Text style={s.cardMeta}>Tu pojawią się Twoje ukończone i przerwane trasy.</Text></View>
        ) : history.slice(0, 8).map((h: any) => {
          const d = new Date(h.dateMs); const date = `${d.getDate()}.${d.getMonth() + 1}`;
          return (
            <View key={h.id} style={s.histRow}>
              <View style={s.histThumb}><RouteThumb route={{ path: h.path, color: h.color }} C={C} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.histName} numberOfLines={1}>{h.name}</Text>
                <Text style={s.histMeta}>{fmtKm(h.distM)} km · {fmtTime(h.elapsedSec)} · {date}{!h.finished ? ' · przerwana' : ''}</Text>
              </View>
              <Ionicons name={h.activity === 'walk' ? 'walk' : 'bicycle'} size={18} color={C.dim} />
            </View>
          );
        })}

        <Text style={s.groupLabel}>Ustawienia</Text>
        <TouchableOpacity style={s.settingRow} activeOpacity={0.7} onPress={onToggleTheme}>
          <Text style={s.settingTxt}>{theme === 'dark' ? '🌙' : '☀️'}  Motyw</Text>
          <Text style={s.settingVal}>{theme === 'dark' ? 'Ciemny' : 'Jasny'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.settingRow} activeOpacity={0.7} onPress={onStyle}>
          <Text style={s.settingTxt}>🗺️  Styl mapy</Text>
          <Text style={s.settingVal}>zmień ›</Text>
        </TouchableOpacity>
        <View style={s.settingRow}>
          <Text style={s.settingTxt}>🔊  Wskazówki głosowe</Text>
          <Switch value={voiceOn} onValueChange={onToggleVoice} trackColor={{ true: C.accent, false: C.stroke }} />
        </View>
      </View>
    </ScrollView>
  );
}

/* ---------- Bottom bar ---------- */
function BottomBar({ C, s, tab, onTab }: any) {
  const TABS = [{ k: 'dashboard', l: 'Start', i: 'home' }, { k: 'routes', l: 'Trasy', i: 'map' }, { k: 'profile', l: 'Profil', i: 'person' }];
  return (
    <View style={s.bottomBar}>
      {TABS.map((t) => {
        const on = tab === t.k;
        return (
          <TouchableOpacity key={t.k} style={s.barItem} activeOpacity={0.7} onPress={() => onTab(t.k)}>
            <Ionicons name={(on ? t.i : t.i + '-outline') as any} size={23} color={on ? C.txt : C.dim} />
            <Text style={[s.barLabel, on && { color: C.txt, fontWeight: '700' }]}>{t.l}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ---------- Detail ---------- */
function PoiCard({ C, s, poi, width }: any) {
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    if (!poi.wikipedia) return;
    let c = false; fetchWikiImage(poi.wikipedia, 500).then((u) => { if (!c) setImg(u); }); return () => { c = true; };
  }, [poi.name]);
  const todo = thingsToDo(poi.kind);
  return (
    <View style={[s.poiCard, { width }]}>
      <View style={s.poiCardTop}>
        {img ? <ImageBackground source={{ uri: img }} style={s.poiCardImg} imageStyle={{ borderRadius: 12 }} />
          : <View style={[s.poiCardImg, { backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }]}><PoiGlyph kind={poi.kind} size={34} /></View>}
        <View style={{ flex: 1 }}>
          <Text style={s.poiCardKind}>{poi.kind}</Text>
          <Text style={s.poiCardName} numberOfLines={2}>{poi.name}</Text>
        </View>
      </View>
      {!!poi.desc && <Text style={s.poiCardDesc} numberOfLines={3}>{poi.desc}</Text>}
      <Text style={s.poiCardTodoLabel}>Co można zrobić</Text>
      <View style={s.poiCardTodos}>{todo.map((t: string, i: number) => <View key={i} style={s.todoChip}><Text style={s.todoChipTxt}>{t}</Text></View>)}</View>
      {!!poi.wikipedia && <TouchableOpacity activeOpacity={0.7} onPress={() => openWiki(poi.wikipedia)}><Text style={s.poiCardLink}>Czytaj więcej →</Text></TouchableOpacity>}
    </View>
  );
}

function PoiQuiz({ C, s, quiz, name, done, onAnswer }: any) {
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => { setPicked(null); }, [name]);
  const wasDone = done === 0 || done === 1;
  const reveal = picked != null || wasDone;
  const pick = (i: number) => {
    if (reveal) return;
    const ok = i === quiz.correct;
    setPicked(i); onAnswer(name, ok);
    try { Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning); } catch {}
  };
  const justCorrect = picked != null && picked === quiz.correct;
  return (
    <View style={s.quizCard}>
      <View style={s.quizHead}><Ionicons name="help-circle" size={16} color={C.accent} /><Text style={s.quizTag}>Quiz</Text></View>
      <Text style={s.quizQ}>{quiz.q}</Text>
      {quiz.opts.map((opt: string, i: number) => {
        const showRight = reveal && i === quiz.correct;
        const showWrong = reveal && picked === i && i !== quiz.correct;
        return (
          <TouchableOpacity key={i} activeOpacity={reveal ? 1 : 0.8} onPress={() => pick(i)} style={[s.quizOpt, showRight && s.quizOptRight, showWrong && s.quizOptWrong]}>
            <Text style={[s.quizOptTxt, (showRight || showWrong) && { color: '#fff', fontWeight: '800' }]}>{opt}</Text>
            {showRight && <Ionicons name="checkmark-circle" size={18} color="#fff" />}
            {showWrong && <Ionicons name="close-circle" size={18} color="#fff" />}
          </TouchableOpacity>
        );
      })}
      {reveal && (
        <View style={{ marginTop: 4 }}>
          {picked != null && <Text style={[s.quizResult, { color: justCorrect ? '#0e9f6e' : C.dim }]}>{justCorrect ? `Dobrze! +${QUIZ_POINTS} pkt` : 'Pudło — masz +2 pkt za próbę'}</Text>}
          {wasDone && picked == null && <Text style={[s.quizResult, { color: C.dim }]}>Rozwiązane{done === 1 ? ' ✓' : ''}</Text>}
          <View style={{ flexDirection: 'row', gap: 8 }}><Ionicons name="bulb-outline" size={16} color={C.accent} style={{ marginTop: 2 }} /><Text style={s.quizFact}>{quiz.fact}</Text></View>
        </View>
      )}
    </View>
  );
}

function PoiSheet({ C, s, poi, onClose, quizDone, onQuizAnswer }: any) {
  const [sum, setSum] = useState<any>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setExpanded(false); setSum(null);
    let c = false;
    if (poi?.wikipedia) fetchWikiSummary(poi.wikipedia).then((r) => { if (!c) setSum(r); });
    else if (poi?.name) fetchWikiByGeo(poi.name, poi.lat, poi.lon).then((r) => { if (!c) setSum(r || { extract: '', image: null }); });
    else setSum({ extract: '', image: null });
    return () => { c = true; };
  }, [poi?.name]);
  if (!poi) return null;
  const todo = thingsToDo(poi.kind);
  const hero = sum?.image;
  const quiz = getQuiz(poi);
  const wikiLink = poi.wikipedia || sum?.wikipedia;
  const intro = sum?.extract ? (sum.extract.length > 340 ? sum.extract.slice(0, 340).trim() + '…' : sum.extract) : '';
  return (
    <View style={s.poiSheet}>
      {hero ? (
        <ImageBackground source={{ uri: hero }} style={s.poiSheetHero} imageStyle={{ borderTopLeftRadius: 26, borderTopRightRadius: 26 }}>
          <View style={s.cardOverlay} />
          <TouchableOpacity style={s.poiSheetClose} activeOpacity={0.85} onPress={onClose}><Ionicons name="close" size={20} color="#fff" /></TouchableOpacity>
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={s.poiSheetHeroGrad}>
            <Text style={s.poiSheetKindImg}>{poi.kind}</Text>
            <Text style={s.poiSheetNameImg} numberOfLines={2}>{poi.name}</Text>
          </LinearGradient>
        </ImageBackground>
      ) : (
        <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
          <View style={s.grip} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[s.glyphBadge, { borderColor: poiColor(poi.kind) }]}><PoiGlyph kind={poi.kind} size={18} /></View>
            <Text style={s.sheetKind}>{poi.kind}</Text>
          </View>
          <Text style={s.sheetName}>{poi.name}</Text>
        </View>
      )}
      <ScrollView style={{ maxHeight: Dimensions.get('window').height * 0.5 }} contentContainerStyle={{ padding: 20, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
        {!!poi.desc && <Text style={s.sheetDesc}>{poi.desc}</Text>}
        {!poi.desc && !!poi.cuisine && <Text style={s.sheetDesc}>{poi.kind}{poi.cuisine ? ` · kuchnia: ${String(poi.cuisine).replace(/[_;]/g, ' ').replace(/\s+/g, ' ').trim()}` : ''}</Text>}
        {!poi.desc && !poi.cuisine && (intro ? <Text style={s.sheetDesc}>{intro}</Text> : sum === null ? <Text style={[s.sub, { marginTop: 2 }]}>Ładowanie opisu…</Text> : null)}
        {(isFood(poi.kind) || poi.kind === 'Parking') && (
          <TouchableOpacity style={[s.btnPrimary, { marginTop: poi.desc || poi.cuisine ? 16 : 0, flexDirection: 'row', gap: 8 }]} activeOpacity={0.85} onPress={() => openGoogle(poi.kind === 'Parking' ? 'parking' : poi.name, poi.lat, poi.lon)}>
            <Ionicons name={poi.kind === 'Parking' ? 'logo-google' : 'star'} size={16} color={C.bg} />
            <Text style={s.btnPrimaryTxt}>{poi.kind === 'Parking' ? 'Opinie i mapa w Google' : 'Oceny i zdjęcia w Google'}</Text>
          </TouchableOpacity>
        )}
        {poi.kind === 'Parking' && (
          <TouchableOpacity style={[s.btnSecondary, { marginTop: 10, flexDirection: 'row', gap: 8 }]} activeOpacity={0.8} onPress={() => driveTo(poi.lat, poi.lon)}>
            <Ionicons name="car-outline" size={16} color={C.txt} />
            <Text style={s.btnSecondaryTxt}>Dojazd autem</Text>
          </TouchableOpacity>
        )}
        <Text style={[s.poiCardTodoLabel, { marginTop: 16 }]}>Co można zrobić</Text>
        <View style={s.poiCardTodos}>{todo.map((t: string, i: number) => <View key={i} style={s.todoChip}><Text style={s.todoChipTxt}>{t}</Text></View>)}</View>
        {quiz && <PoiQuiz C={C} s={s} quiz={quiz} name={poi.name} done={quizDone} onAnswer={onQuizAnswer} />}
        {expanded ? (
          <>
            {sum?.extract ? <Text style={[s.sheetDesc, { marginTop: 16 }]}>{sum.extract}</Text> : null}
            {!!wikiLink && <TouchableOpacity activeOpacity={0.7} onPress={() => openWiki(wikiLink)}><Text style={s.sheetLink}>Czytaj na Wikipedii →</Text></TouchableOpacity>}
          </>
        ) : (
          (sum?.extract && sum.extract.length > 340) || wikiLink ? <TouchableOpacity activeOpacity={0.7} onPress={() => setExpanded(true)}><Text style={s.sheetLink}>Czytaj więcej ⌄</Text></TouchableOpacity> : null
        )}
      </ScrollView>
    </View>
  );
}

function PoiExplorer({ C, s, route, onClose, onFocus }: any) {
  const pois = route.pois || [];
  const W = Dimensions.get('window').width;
  const CARD = W - 36, GAP = 12;
  const [idx, setIdx] = useState(0);
  useEffect(() => { if (pois[0]) onFocus(pois[0]); }, []);
  const onEnd = (e: any) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / (CARD + GAP));
    if (pois[i] && i !== idx) { setIdx(i); onFocus(pois[i]); }
  };
  return (
    <>
      <View style={s.exploreHeader}>
        <TouchableOpacity style={s.exploreClose} activeOpacity={0.8} onPress={onClose}><Ionicons name="close" size={20} color={C.txt} /></TouchableOpacity>
        <View style={s.exploreCount}><Text style={s.exploreCountTxt}>Punkt {idx + 1} z {pois.length}</Text></View>
      </View>
      <View style={s.explorePager}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={CARD + GAP} decelerationRate="fast" onMomentumScrollEnd={onEnd} contentContainerStyle={{ paddingHorizontal: 18, gap: GAP }}>
          {pois.map((p: any, i: number) => <PoiCard key={i} C={C} s={s} poi={p} width={CARD} />)}
        </ScrollView>
      </View>
    </>
  );
}

function NearbyCard({ C, s, poi, width, added, onAdd, onOpen }: any) {
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => { if (!poi.wikipedia) return; let c = false; fetchWikiImage(poi.wikipedia, 400).then((u) => { if (!c) setImg(u); }); return () => { c = true; }; }, [poi.name]);
  const isParking = poi.kind === 'Parking';
  return (
    <View style={[s.poiCard, { width }]}>
      <TouchableOpacity activeOpacity={0.85} onPress={onOpen}>
        <View style={s.poiCardTop}>
          {img ? <ImageBackground source={{ uri: img }} style={s.poiCardImg} imageStyle={{ borderRadius: 12 }} />
            : <View style={[s.poiCardImg, { backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }]}><PoiGlyph kind={poi.kind} size={34} /></View>}
          <View style={{ flex: 1 }}>
            <Text style={s.poiCardKind}>{poi.kind} · {poi.d} m od trasy</Text>
            <Text style={s.poiCardName} numberOfLines={2}>{poi.name}</Text>
          </View>
        </View>
        <View style={[s.poiCardTodos, { marginTop: 12 }]}>{thingsToDo(poi.kind).slice(0, 3).map((t: string, i: number) => <View key={i} style={s.todoChip}><Text style={s.todoChipTxt}>{t}</Text></View>)}</View>
      </TouchableOpacity>
      <View style={[s.btnRow, { marginTop: 14, gap: 8 }]}>
        {isParking
          ? <TouchableOpacity style={[s.btnSecondary, { flex: 1, paddingVertical: 11, flexDirection: 'row', gap: 6 }]} activeOpacity={0.8} onPress={() => driveTo(poi.lat, poi.lon)}><Ionicons name="car-outline" size={16} color={C.txt} /><Text style={s.btnSecondaryTxt}>Dojazd</Text></TouchableOpacity>
          : <TouchableOpacity style={[s.btnSecondary, { flex: 1, paddingVertical: 11 }]} activeOpacity={0.8} onPress={onOpen}><Text style={s.btnSecondaryTxt}>Doczytaj</Text></TouchableOpacity>}
        <TouchableOpacity style={[added ? s.btnPrimary : s.btnSecondary, { flex: 1, paddingVertical: 11 }]} activeOpacity={0.85} onPress={onAdd}><Text style={added ? s.btnPrimaryTxt : s.btnSecondaryTxt}>{added ? 'Dodano ✓' : 'Dodaj +'}</Text></TouchableOpacity>
      </View>
    </View>
  );
}

// Mała animowana lista dropdownu (wejście/zejście)
function FilterMenu({ open, style, children }: any) {
  const a = useRef(new Animated.Value(0)).current;
  const [show, setShow] = useState(open);
  useEffect(() => {
    if (open) { setShow(true); Animated.timing(a, { toValue: 1, duration: 150, useNativeDriver: true }).start(); }
    else { Animated.timing(a, { toValue: 0, duration: 120, useNativeDriver: true }).start(({ finished }) => { if (finished) setShow(false); }); }
  }, [open]);
  if (!show) return null;
  return (
    <Animated.View style={[style, { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }, { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}>
      {children}
    </Animated.View>
  );
}

const KIND_ORDER = ['Atrakcja', 'Zabytek', 'Zamek', 'Ruiny', 'Kościół', 'Punkt widokowy', 'Szczyt', 'Restauracja', 'Kawiarnia', 'Sklep', 'Miejsce piknikowe', 'Jaskinia', 'Parking', 'Miejsce'];

function NearbyExplore({ C, s, nearby, nearbyRadius, setNearbyRadius, typeHidden, setTypeHidden, addedPois, onTogglePoi, onOpenPoi, onSave, onCancel, onHighlight, loading, tapIdx }: any) {
  const W = Dimensions.get('window').width, CARD = W - 36, GAP = 12;
  const visible = nearby.filter((p: any) => p.d <= nearbyRadius && !typeHidden.includes(p.kind));
  const [idx, setIdx] = useState(0);
  const [menu, setMenu] = useState<string | null>(null); // 'dist' | 'type' | null
  const ref = useRef<ScrollView>(null);
  const radii = [150, 300, 500, 1000];
  const radLabel = (r: number) => (r >= 1000 ? '1 km' : r + ' m');
  const kinds = KIND_ORDER.filter((k) => nearby.some((p: any) => p.kind === k));
  const shownTypes = kinds.filter((k) => !typeHidden.includes(k)).length;
  const typeSummary = typeHidden.length === 0 ? 'Wszystkie' : `${shownTypes}/${kinds.length}`;
  const toggleType = (k: string) => setTypeHidden((prev: string[]) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  useEffect(() => { setIdx(0); if (visible[0]) onHighlight(visible[0]); try { ref.current?.scrollTo({ x: 0, animated: false }); } catch {} }, [nearbyRadius, typeHidden, nearby.length]);
  useEffect(() => {
    if (!tapIdx || tapIdx.idx == null) return;
    const i = Math.min(tapIdx.idx, visible.length - 1); if (i < 0) return;
    setIdx(i); if (visible[i]) onHighlight(visible[i]); try { ref.current?.scrollTo({ x: i * (CARD + GAP), animated: true }); } catch {}
  }, [tapIdx]);
  const onEnd = (e: any) => { const i = Math.round(e.nativeEvent.contentOffset.x / (CARD + GAP)); if (visible[i] && i !== idx) { setIdx(i); onHighlight(visible[i]); } };
  const isAdded = (p: any) => addedPois.some((x: any) => x.name === p.name && x.lat === p.lat);
  return (
    <>
      <View style={s.nearbyTop}>
        <TouchableOpacity style={[s.ddChip, menu === 'dist' && s.ddChipOn]} activeOpacity={0.8} onPress={() => setMenu(menu === 'dist' ? null : 'dist')}>
          <Ionicons name="resize-outline" size={15} color={C.txt} />
          <Text style={s.ddChipTxt} numberOfLines={1}>Zasięg · {radLabel(nearbyRadius)}</Text>
          <Ionicons name={menu === 'dist' ? 'chevron-up' : 'chevron-down'} size={15} color={C.dim} />
        </TouchableOpacity>
        <TouchableOpacity style={[s.ddChip, menu === 'type' && s.ddChipOn]} activeOpacity={0.8} onPress={() => setMenu(menu === 'type' ? null : 'type')}>
          <Ionicons name="options-outline" size={15} color={C.txt} />
          <Text style={s.ddChipTxt} numberOfLines={1}>Typ · {typeSummary}</Text>
          <Ionicons name={menu === 'type' ? 'chevron-up' : 'chevron-down'} size={15} color={C.dim} />
        </TouchableOpacity>
      </View>
      {!!menu && <Pressable style={s.ddBackdrop} onPress={() => setMenu(null)} />}
      <FilterMenu open={menu === 'dist'} style={[s.ddPanel, { left: 14, width: 184 }]}>
        {radii.map((r) => { const on = nearbyRadius === r; return (
          <TouchableOpacity key={r} style={s.ddRow} activeOpacity={0.7} onPress={() => { setNearbyRadius(r); setMenu(null); }}>
            <Text style={[s.ddRowTxt, on && { color: C.txt, fontWeight: '800' }]}>{radLabel(r)}</Text>
            {on && <Ionicons name="checkmark" size={18} color={C.accent} />}
          </TouchableOpacity>
        ); })}
      </FilterMenu>
      <FilterMenu open={menu === 'type'} style={[s.ddPanel, { right: 14, width: 224 }]}>
        {kinds.length === 0 ? <Text style={[s.sub, { padding: 14 }]}>Brak punktów</Text> : (
          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {kinds.map((k) => { const on = !typeHidden.includes(k); return (
              <TouchableOpacity key={k} style={s.ddRow} activeOpacity={0.7} onPress={() => toggleType(k)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 }}>
                  <PoiGlyph kind={k} size={17} />
                  <Text style={[s.ddRowTxt, on && { color: C.txt }]} numberOfLines={1}>{k}</Text>
                </View>
                <View style={[s.ddCheck, on && s.ddCheckOn]}>{on && <Ionicons name="checkmark" size={13} color={C.bg} />}</View>
              </TouchableOpacity>
            ); })}
          </ScrollView>
        )}
      </FilterMenu>

      <View style={s.nearbyBottom}>
        {!loading && visible.length > 0 && <View style={s.countPill}><Text style={s.exploreCountTxt}>{idx + 1} z {visible.length}</Text></View>}
        {loading ? <View style={s.nearbyEmptyWrap}><ActivityIndicator color={C.dim} /></View>
          : visible.length === 0 ? <View style={s.nearbyEmptyWrap}><Text style={s.sub}>Brak punktów w promieniu {nearbyRadius >= 1000 ? '1 km' : nearbyRadius + ' m'}</Text></View>
          : (
            <ScrollView ref={ref} horizontal snapToInterval={CARD + GAP} decelerationRate="fast" showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onEnd} contentContainerStyle={{ paddingHorizontal: 18, gap: GAP }}>
              {visible.map((p: any, i: number) => <NearbyCard key={i} C={C} s={s} poi={p} width={CARD} added={isAdded(p)} onAdd={() => onTogglePoi(p)} onOpen={() => onOpenPoi(p)} />)}
            </ScrollView>
          )}
        <View style={s.nearbyFooter}>
          <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} activeOpacity={0.8} onPress={onCancel}><Text style={s.btnSecondaryTxt}>Anuluj</Text></TouchableOpacity>
          <TouchableOpacity style={[s.btnPrimary, { flex: 1.5 }]} activeOpacity={0.85} onPress={onSave}><Text style={s.btnPrimaryTxt}>Zapisz{addedPois.length ? ` · ${addedPois.length}` : ''}</Text></TouchableOpacity>
        </View>
      </View>
    </>
  );
}

function DetailScreen({ C, s, route, onBack, onPoi, onStart, onLayers, callMapFit, onFocusPoi, onRename, onEdit, onThumb }: any) {
  const editable = /^(my|gen)/.test(String(route.id || ''));
  const canThumb = /^my/.test(String(route.id || ''));
  const cum = cumDist(route.path);
  const H = Dimensions.get('window').height;
  const FULL = 84, HALF = Math.round(H * 0.44), PEEK = Math.max(HALF + 80, H - 340);
  const [mini, setMini] = useState(false);
  const [exploring, setExploring] = useState(false);
  const anim = useRef(new Animated.Value(HALF)).current;
  const sheetY = useRef(HALF);
  const snapTo = (y: number) => {
    sheetY.current = y;
    Animated.spring(anim, { toValue: y, useNativeDriver: true, bounciness: 3, speed: 16 }).start();
    callMapFit(H - y);
  };
  useEffect(() => { const t = setTimeout(() => callMapFit(H - HALF), 220); return () => clearTimeout(t); }, []);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 7,
    onPanResponderMove: (_, g) => { let y = sheetY.current + g.dy; if (y < FULL) y = FULL; if (y > PEEK) y = PEEK; anim.setValue(y); },
    onPanResponderRelease: (_, g) => {
      const y = Math.min(PEEK, Math.max(FULL, sheetY.current + g.dy));
      if (sheetY.current === PEEK && g.dy > 26) { setMini(true); callMapFit(H - 196); return; } // zwiń do mini-karty
      const pts = [FULL, HALF, PEEK]; let best = pts[0];
      for (const p of pts) if (Math.abs(p - y) < Math.abs(best - y)) best = p;
      snapTo(best);
    },
  }), []);
  const expand = () => { setMini(false); sheetY.current = HALF; anim.setValue(PEEK); requestAnimationFrame(() => snapTo(HALF)); };
  const miniPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => g.dy < -8,
    onPanResponderRelease: (_, g) => { if (g.dy < -22) expand(); },
  }), []);
  const [elev, setElev] = useState<any>(route.eles ? { eles: route.eles, ascent: route.ascent, descent: route.descent } : null);
  useEffect(() => {
    if (route.eles) { setElev({ eles: route.eles, ascent: route.ascent, descent: route.descent }); return; }
    let c = false; fetchElevation(route.path).then((e) => { if (!c) setElev(e); }); return () => { c = true; };
  }, [route.id]);
  const chartW = Dimensions.get('window').width - 40;
  return (
    <>
      {!exploring && <TouchableOpacity style={s.back} onPress={onBack}><Ionicons name="chevron-back" size={24} color={C.txt} /></TouchableOpacity>}
      {!exploring && <TouchableOpacity style={s.layersBtn} onPress={onLayers}><Ionicons name="layers-outline" size={20} color={C.txt} /></TouchableOpacity>}

      {exploring && <PoiExplorer C={C} s={s} route={route} onClose={() => { setExploring(false); callMapFit(H - HALF); }} onFocus={(p: any) => onFocusPoi(p.lat, p.lon)} />}

      {!exploring && mini && (
        <View style={s.miniCard} {...miniPan.panHandlers}>
          <TouchableOpacity activeOpacity={0.9} onPress={expand}>
            <View style={s.miniGrip} />
            <View style={s.cardTop}><View style={[s.dot, { backgroundColor: route.color }]} /><Text style={[s.cardNet, { color: route.color }]}>{route.net}</Text></View>
            <Text style={s.miniTitle} numberOfLines={1}>{route.name}</Text>
            <View style={s.miniRow}>
              <Text style={s.sub} numberOfLines={1}>{fmtKm(route.distance * 1000)} km · {route.timeMin} min{route.pois?.length ? ` · ${route.pois.length} miejsc` : ''}</Text>
              <TouchableOpacity style={s.miniBtn} activeOpacity={0.85} onPress={() => onStart('gps')}><Text style={s.btnPrimaryTxt}>Prowadź</Text></TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {!exploring && !mini && (
      <Animated.View style={[s.sheetCard, { height: H, transform: [{ translateY: anim }] }]}>
        <View {...pan.panHandlers} style={s.sheetHead}>
          <View style={s.grip} />
          <View style={s.cardTop}><View style={[s.dot, { backgroundColor: route.color }]} /><Text style={[s.cardNet, { color: route.color }]}>{route.net}</Text></View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <Text style={[s.detailTitle, { flex: 1 }]} numberOfLines={2}>{route.name}</Text>
            {editable && onRename && <TouchableOpacity style={s.renameBtn} activeOpacity={0.7} onPress={() => onRename(route)}><Ionicons name="pencil" size={16} color={C.txt} /></TouchableOpacity>}
          </View>
          <Text style={s.sub}>{route.region}</Text>
          <View style={s.statsInline}>
            <Text style={s.statInline}><Text style={s.statInlineV}>{fmtKm(route.distance * 1000)} km</Text>  dystans</Text>
            <Text style={s.statInline}><Text style={s.statInlineV}>{route.timeMin} min</Text>  czas</Text>
            <Text style={s.statInline}><Text style={s.statInlineV}>{route.pois.length}</Text>  miejsc</Text>
          </View>
          <View style={s.sheetCta}>
            <TouchableOpacity style={[s.btnPrimary, { flex: 1.5 }]} activeOpacity={0.85} onPress={() => onStart('gps')}><Text style={s.btnPrimaryTxt}>Prowadź mnie</Text></TouchableOpacity>
            <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} activeOpacity={0.7} onPress={() => onStart('sim')}><Text style={s.btnSecondaryTxt}>Podgląd</Text></TouchableOpacity>
          </View>
          {editable && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity style={[s.btnSecondary, { flex: 1, paddingVertical: 11, flexDirection: 'row', gap: 6 }]} activeOpacity={0.8} onPress={() => onEdit && onEdit(route)}><Ionicons name="create-outline" size={16} color={C.txt} /><Text style={s.btnSecondaryTxt}>Edytuj trasę</Text></TouchableOpacity>
              {canThumb && <TouchableOpacity style={[s.btnSecondary, { flex: 1, paddingVertical: 11, flexDirection: 'row', gap: 6 }]} activeOpacity={0.8} onPress={() => onThumb && onThumb(route)}><Ionicons name="image-outline" size={16} color={C.txt} /><Text style={s.btnSecondaryTxt}>Zdjęcie</Text></TouchableOpacity>}
            </View>
          )}
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          <Text style={s.sectionT}>O trasie</Text>
          <Text style={s.desc}>{route.desc}</Text>

          <Text style={s.sectionT}>{(route.activity || 'bike') === 'walk' ? 'Trasa' : 'Profil trasy'}</Text>
          <View style={{ paddingHorizontal: 20 }}>
            <RouteStats s={s} distM={route.distance * 1000} timeMin={route.timeMin} ascent={elev?.ascent} descent={elev?.descent} showElevation={(route.activity || 'bike') !== 'walk'} />
            {(route.activity || 'bike') !== 'walk' && (elev?.eles ? <ElevationChart C={C} eles={elev.eles} width={chartW} /> : <Text style={[s.sub, { paddingVertical: 8 }]}>Ładowanie profilu wysokości…</Text>)}
            <SurfaceBars s={s} surfaces={route.surfaces} />
          </View>
          <View style={s.detailSectionRow}>
            <Text style={[s.sectionT, { paddingTop: 18, paddingBottom: 0 }]}>Warto się zatrzymać</Text>
            {route.pois.length > 0 && <TouchableOpacity activeOpacity={0.7} onPress={() => setExploring(true)}><Text style={s.seeAll}>Przeglądaj ›</Text></TouchableOpacity>}
          </View>
          {route.pois.map((p: any, i: number) => {
            const d = alongDist(route.path, cum, p);
            return (
              <TouchableOpacity key={i} style={s.poiRow} activeOpacity={0.7} onPress={() => onPoi(p)}>
                <View style={{ marginRight: 13 }}><PoiGlyph kind={p.kind} size={24} /></View>
                <View style={{ flex: 1 }}><Text style={s.poiName}>{p.name}</Text><Text style={s.poiKind} numberOfLines={1}>{route.game ? ((p.quiz || QUIZZES[p.name]) ? 'Zadanie: ' + (p.quiz || QUIZZES[p.name]).q : 'Zadanie przy punkcie') : p.kind}</Text></View>
                <Text style={s.poiKm}>{fmtKm(d)} km</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Animated.View>
      )}
    </>
  );
}

/* ---------- Ride overlay ---------- */
function RideOverlay({ C, s, phase, hud, mode, paused, activity, variants, variantKey, onSelectVariant, navStarted, onStartNav, onChangeVariant, statsOpen, onToggleStats, onToggleMode, onPause, onStop, onRecenter, onLayers, onMinimize, onSkipPoi }: any) {
  const pct = hud.total ? Math.min(100, (100 * hud.done) / hud.total) : 0;
  const walk = activity === 'walk';
  const doneL = phase === 'approach' ? 'do trasy' : walk ? 'pokonane' : 'przejechane';
  const StatsExtra = () => (
    <View style={s.statsExtra}>
      <View style={s.hudStat}><Text style={s.hudV2}>{fmtTime(hud.elapsed)}</Text><Text style={s.hudL}>czas</Text></View>
      <View style={s.hudStat}>{walk ? <Text style={s.hudV2}>{fmtPace(hud.done, hud.elapsed)}<Text style={s.hudUnit}> /km</Text></Text> : <Text style={s.hudV2}>{Math.round(hud.avg)}<Text style={s.hudUnit}> km/h</Text></Text>}<Text style={s.hudL}>{walk ? 'tempo' : 'śr. prędkość'}</Text></View>
      <View style={s.hudStat}><Text style={s.hudV2}>{fmtKm(hud.done)}<Text style={s.hudUnit}> km</Text></Text><Text style={s.hudL}>{doneL}</Text></View>
    </View>
  );
  return (
    <>
      <TouchableOpacity style={s.minBtn} activeOpacity={0.8} onPress={onMinimize}>
        <View style={s.fitBtnInner}><Ionicons name="chevron-down" size={22} color={C.txt} /></View>
      </TouchableOpacity>
      <TouchableOpacity style={s.fitBtn} activeOpacity={0.8} onPress={onRecenter}>
        <View style={s.fitBtnInner}><Ionicons name="scan-outline" size={20} color={C.txt} /></View>
      </TouchableOpacity>
      <TouchableOpacity style={[s.fitBtn, { top: 204 }]} activeOpacity={0.8} onPress={onLayers}>
        <View style={s.fitBtnInner}><Ionicons name="layers-outline" size={19} color={C.txt} /></View>
      </TouchableOpacity>

      <View style={s.hudTop}>
        <Text style={s.hudLabel}>{phase === 'approach' ? 'DOJAZD DO TRASY' : hud.off ? 'POZA TRASĄ' : 'NASTĘPNY PUNKT'}</Text>
        <View style={s.hudNext}>
          {phase === 'approach' ? <Ionicons name="navigate" size={20} color={C.accent} />
            : hud.nextKind ? <PoiGlyph kind={hud.nextKind} size={22} />
            : <Ionicons name="flag" size={20} color={C.txt} />}
          <Text style={s.hudNextName} numberOfLines={1}>{hud.nextName}</Text>
          <Text style={s.hudNextDist}>{hud.nextDist}</Text>
          {phase === 'trail' && hud.nextKind && onSkipPoi && (
            <TouchableOpacity style={s.skipBtn} activeOpacity={0.8} onPress={onSkipPoi} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="play-skip-forward" size={13} color={C.dim} /><Text style={s.skipTxt}>Pomiń</Text>
            </TouchableOpacity>
          )}
        </View>
        {phase === 'trail' && <View style={s.progress}><View style={[s.progressBar, { width: (pct + '%') as any }]} /></View>}
      </View>

      <View style={s.hudBottom}>
        {phase === 'approach' && !navStarted ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={s.hudLabel}>WARIANT DOJAZDU</Text>
              {variants.some((v: any) => v.dist == null) && <ActivityIndicator size="small" color={C.dim} />}
            </View>
            <View style={s.variantRow}>
              {variants.map((v: any) => {
                const on = v.key === variantKey;
                return (
                  <TouchableOpacity key={v.key} activeOpacity={0.8} style={[s.variant, on && s.variantOn]} onPress={() => onSelectVariant(v.key)}>
                    <Ionicons name={v.ion as any} size={18} color={on ? C.bg : C.txt} />
                    <Text style={[s.variantLabel, on && s.variantLabelOn]}>{v.label}</Text>
                    <Text style={[s.variantDist, on && s.variantLabelOn]}>{v.dist != null ? fmtKm(v.dist) + ' km' : '…'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={s.rideCtrls}>
              <TouchableOpacity style={[s.rc, s.rcGo]} activeOpacity={0.85} onPress={onStartNav}><Text style={[s.rcTxt, { color: C.bg }]}>Start</Text></TouchableOpacity>
              <TouchableOpacity style={[s.rc, s.rcStop]} activeOpacity={0.8} onPress={onStop}><Text style={[s.rcTxt, { color: C.danger }]}>Zakończ</Text></TouchableOpacity>
            </View>
          </>
        ) : phase === 'approach' ? (
          <>
            <TouchableOpacity activeOpacity={0.85} onPress={onToggleStats}>
              <View style={s.navRow}>
                <View><Text style={s.hudV}>{Math.round(hud.speed)}<Text style={s.hudUnit}> km/h</Text></Text><Text style={s.hudL}>prędkość</Text></View>
                <View style={{ alignItems: 'flex-end' }}><Text style={[s.hudV, { color: C.accent }]}>{hud.nextDist}</Text><Text style={s.hudL}>do trasy  ⌃</Text></View>
              </View>
            </TouchableOpacity>
            {statsOpen && <StatsExtra />}
            <View style={s.rideCtrls}>
              <TouchableOpacity style={s.rc} activeOpacity={0.8} onPress={onChangeVariant}><Text style={s.rcTxt}>Zmień wariant</Text></TouchableOpacity>
              <TouchableOpacity style={[s.rc, s.rcStop]} activeOpacity={0.8} onPress={onStop}><Text style={[s.rcTxt, { color: C.danger }]}>Zakończ</Text></TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <TouchableOpacity activeOpacity={0.85} onPress={onToggleStats}>
              <View style={s.hudStats}>
                <View style={s.hudStat}><Text style={s.hudV}>{fmtKm(hud.done)}<Text style={s.hudUnit}> km</Text></Text><Text style={s.hudL}>{walk ? 'pokonane' : 'przejechane'}</Text></View>
                <View style={s.hudStat}>{walk ? <Text style={s.hudV}>{fmtPace(hud.done, hud.elapsed)}<Text style={s.hudUnit}> /km</Text></Text> : <Text style={s.hudV}>{Math.round(hud.speed)}<Text style={s.hudUnit}> km/h</Text></Text>}<Text style={s.hudL}>{walk ? 'tempo' : 'prędkość'}</Text></View>
                <View style={s.hudStat}><Text style={s.hudV}>{fmtKm(Math.max(0, hud.total - hud.done))}<Text style={s.hudUnit}> km</Text></Text><Text style={s.hudL}>do końca  ⌃</Text></View>
              </View>
            </TouchableOpacity>
            {statsOpen && <StatsExtra />}
            <View style={s.rideCtrls}>
              <TouchableOpacity style={s.rc} activeOpacity={0.8} onPress={onToggleMode}><Text style={s.rcTxt}>{mode === 'gps' ? 'GPS' : 'Symulacja'}</Text></TouchableOpacity>
              {mode === 'sim' && <TouchableOpacity style={s.rc} activeOpacity={0.8} onPress={onPause}><Text style={s.rcTxt}>{paused ? 'Wznów' : 'Pauza'}</Text></TouchableOpacity>}
              <TouchableOpacity style={[s.rc, s.rcStop]} activeOpacity={0.8} onPress={onStop}><Text style={[s.rcTxt, { color: C.danger }]}>Zakończ</Text></TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </>
  );
}

/* ---------- Trip summary ---------- */
function SummaryScreen({ C, s, data, onClose, onProfile }: any) {
  if (!data) return null;
  const isWalk = data.act === 'walk';
  return (
    <View style={s.summaryRoot}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 80, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={s.summaryBadgeBig}><Ionicons name={data.finished ? (isWalk ? 'walk' : 'bicycle') : 'flag-outline'} size={42} color={C.accent} /></View>
        <Text style={s.summaryHd}>{data.finished ? (isWalk ? 'Spacer ukończony!' : 'Trasa ukończona!') : (isWalk ? 'Podsumowanie spaceru' : 'Podsumowanie przejazdu')}</Text>
        <Text style={[s.sub, { textAlign: 'center', marginTop: 4 }]}>{data.name}{!data.finished ? ' · przerwano' : ''}</Text>

        <View style={s.summaryGrid}>
          <View style={s.summaryStat}><Text style={s.summaryStatV}>{fmtKm(data.distM)}</Text><Text style={s.summaryStatL}>{isWalk ? 'km' : 'km'}{!data.finished ? ' pokonane' : ''}</Text></View>
          <View style={s.summaryStat}><Text style={s.summaryStatV}>{fmtTime(data.elapsedSec)}</Text><Text style={s.summaryStatL}>czas</Text></View>
          <View style={s.summaryStat}><Text style={s.summaryStatV}>{data.kcal}</Text><Text style={s.summaryStatL}>kcal</Text></View>
          <View style={s.summaryStat}><Text style={s.summaryStatV}>{isWalk ? fmtPace(data.distM, data.elapsedSec) : Math.round(data.avg)}</Text><Text style={s.summaryStatL}>{isWalk ? 'tempo /km' : 'km/h śr.'}</Text></View>
          {data.ascent != null && <View style={s.summaryStat}><Text style={s.summaryStatV}>↑{data.ascent}</Text><Text style={s.summaryStatL}>podjazd m</Text></View>}
          <View style={s.summaryStat}><Text style={s.summaryStatV}>{data.poiCount}</Text><Text style={s.summaryStatL}>punktów</Text></View>
        </View>

        {data.earned.length > 0 && (
          <>
            <Text style={[s.groupLabel, { marginTop: 22 }]}>Zdobyte odznaki</Text>
            {data.earned.map((k: string) => (
              <View key={k} style={s.badgeRow}>
                <View style={s.badgeIco}><Ionicons name={BADGES[k].icon as any} size={22} color={C.accent} /></View>
                <View style={{ flex: 1 }}><Text style={s.badgeName}>{BADGES[k].name}</Text><Text style={s.badgeDesc}>{BADGES[k].desc}</Text></View>
                <Ionicons name="checkmark-circle" size={20} color={C.accent} />
              </View>
            ))}
          </>
        )}

        <TouchableOpacity style={[s.btnPrimary, { marginTop: 28 }]} activeOpacity={0.85} onPress={onClose}><Text style={s.btnPrimaryTxt}>Gotowe</Text></TouchableOpacity>
        <TouchableOpacity style={[s.btnGhost, { marginTop: 8 }]} activeOpacity={0.7} onPress={onProfile}><Text style={[s.btnGhostTxt, { color: C.dim }]}>Zobacz odznaki w profilu</Text></TouchableOpacity>
      </ScrollView>
    </View>
  );
}

/* ---------- Generator tras ---------- */
function GenPoiRow({ C, s, poi, game, active, onPress }: any) {
  const [desc, setDesc] = useState(poi.desc || '');
  useEffect(() => {
    if (!active || desc) return; let c = false;
    const got = (r: any) => { if (!c && r && r.extract) { const f = r.extract.split('. ')[0]; setDesc(f.length > 150 ? f.slice(0, 150) + '…' : f); } };
    if (poi.wikipedia) fetchWikiSummary(poi.wikipedia).then(got);
    else fetchWikiByGeo(poi.name, poi.lat, poi.lon).then(got);
    return () => { c = true; };
  }, [active]);
  const quiz = game ? (poi.quiz || QUIZZES[poi.name]) : null;
  return (
    <TouchableOpacity style={s.genPoiRow} activeOpacity={0.7} onPress={onPress}>
      <PoiGlyph kind={poi.kind} size={18} />
      <View style={{ flex: 1 }}>
        <Text style={s.genPoiName} numberOfLines={1}>{poi.name}</Text>
        {quiz ? <Text style={[s.genPoiSub, { color: C.accent }]} numberOfLines={2}>Pytanie: {quiz.q}</Text> : null}
        <Text style={s.genPoiSub} numberOfLines={2}>{desc || poi.kind}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={C.dim} />
    </TouchableOpacity>
  );
}
function GenBrowCard({ C, s, route, width, active, onPreview, onEdit, onSave, onOpenPoi }: any) {
  const game = !!route.game;
  return (
    <View style={[s.genBrowCard, { width }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={s.genCatBadge}><Ionicons name={(route.themeIon || 'map') as any} size={18} color={C.accent} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.genResName} numberOfLines={1}>{route.themeLabel || route.name}</Text>
          <Text style={s.sub}>{fmtKm(route.distance * 1000)} km · {route.timeMin} min · {route.pois.length} miejsc</Text>
        </View>
      </View>
      <Text style={s.genBrowSection}>{game ? 'Zadania na trasie' : 'Punkty na trasie'} · dotknij, by doczytać</Text>
      <ScrollView style={{ maxHeight: 210 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        {route.pois.length ? route.pois.map((p: any, i: number) => (
          <GenPoiRow key={i} C={C} s={s} poi={p} game={game} active={active} onPress={() => onOpenPoi(p)} />
        )) : <Text style={[s.sub, { paddingVertical: 10 }]}>Brak punktów.</Text>}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <TouchableOpacity style={[s.btnSecondary, { flex: 1, paddingVertical: 11 }]} activeOpacity={0.8} onPress={onPreview}><Text style={s.btnSecondaryTxt}>Podgląd</Text></TouchableOpacity>
        <TouchableOpacity style={[s.btnSecondary, { flex: 1, paddingVertical: 11 }]} activeOpacity={0.8} onPress={onEdit}><Text style={s.btnSecondaryTxt}>Edytuj</Text></TouchableOpacity>
        <TouchableOpacity style={[s.btnPrimary, { flex: 1, paddingVertical: 11 }]} activeOpacity={0.85} onPress={onSave}><Text style={s.btnPrimaryTxt}>Zapisz</Text></TouchableOpacity>
      </View>
    </View>
  );
}

function GenBrowser({ C, s, routes, onClose, onBack, onSave, onPreview, onEdit, onRegenerate, onFocus, onOpenPoi }: any) {
  const W = Dimensions.get('window').width, CARD = W - 36, GAP = 12;
  const [idx, setIdx] = useState(0);
  const ref = useRef<ScrollView>(null);
  useEffect(() => { if (routes[0]) onFocus(routes[0]); }, []);
  const go = (i: number) => { if (i < 0 || i >= routes.length) return; setIdx(i); onFocus(routes[i]); try { ref.current?.scrollTo({ x: i * (CARD + GAP), animated: true }); } catch {} };
  const onEnd = (e: any) => { const i = Math.round(e.nativeEvent.contentOffset.x / (CARD + GAP)); if (routes[i] && i !== idx) { setIdx(i); onFocus(routes[i]); } };
  return (
    <>
      <View style={s.genBrowTop}>
        <TouchableOpacity style={s.genBrowIcon} activeOpacity={0.8} onPress={onBack}><Ionicons name="chevron-back" size={22} color={C.txt} /></TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 4, alignItems: 'center' }} style={{ flex: 1 }}>
          {routes.map((r: any, i: number) => (
            <TouchableOpacity key={r.id} style={[s.genCatChip, i === idx && s.genCatChipOn]} activeOpacity={0.8} onPress={() => go(i)}>
              <Ionicons name={(r.themeIon || 'map') as any} size={14} color={i === idx ? C.bg : C.txt} /><Text style={[s.genCatTxt, i === idx && { color: C.bg }]} numberOfLines={1}>{(r.themeLabel || r.name).split(' ')[0]}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={s.genBrowIcon} activeOpacity={0.8} onPress={onClose}><Ionicons name="close" size={20} color={C.txt} /></TouchableOpacity>
      </View>

      <View style={s.genBrowBottom}>
        <View style={s.countPill}><Text style={s.exploreCountTxt}>{idx + 1} z {routes.length}</Text></View>
        <ScrollView ref={ref} horizontal snapToInterval={CARD + GAP} decelerationRate="fast" showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onEnd} contentContainerStyle={{ paddingHorizontal: 18, gap: GAP }}>
          {routes.map((r: any, i: number) => <GenBrowCard key={r.id} C={C} s={s} route={r} width={CARD} active={i === idx} onPreview={() => onPreview(r)} onEdit={() => onEdit(r)} onSave={() => onSave(r)} onOpenPoi={onOpenPoi} />)}
        </ScrollView>
        <View style={s.genBrowFooter}>
          <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} activeOpacity={0.8} onPress={onRegenerate}><Text style={s.btnSecondaryTxt}>Generuj ponownie</Text></TouchableOpacity>
          <TouchableOpacity style={[s.btnGhost, { flex: 1 }]} activeOpacity={0.7} onPress={onClose}><Text style={[s.btnGhostTxt, { color: C.dim }]}>Odrzuć</Text></TouchableOpacity>
        </View>
      </View>
    </>
  );
}

function GeneratorScreen({ C, s, step, area, radius, setRadius, cfg, setCfg, loading, results, onNext, onGenerate, onBack, onClose, onSave, onPreview, onEdit, onFocus, onOpenPoi }: any) {
  const up = (patch: any) => setCfg((c: any) => ({ ...c, ...patch }));
  const toggleTheme = (k: string) => setCfg((c: any) => ({ ...c, themes: c.themes.includes(k) ? c.themes.filter((x: string) => x !== k) : [...c.themes, k] }));
  const Pill = ({ on, label, onPress }: any) => (<TouchableOpacity style={[s.modePill, on && s.modePillOn]} activeOpacity={0.8} onPress={onPress}><Text style={[s.modePillTxt, on && s.modePillTxtOn]}>{label}</Text></TouchableOpacity>);

  if (step === 'area') {
    return (
      <>
        <View style={s.genTop}>
          <Ionicons name="location" size={16} color={C.accent} />
          <Text style={s.genTopTxt} numberOfLines={1}>{area ? 'Świetnie — ustaw promień i dalej' : 'Tapnij na mapie środek obszaru'}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="close" size={20} color={C.txt} /></TouchableOpacity>
        </View>
        <View style={s.genBottom}>
          <Text style={[s.groupLabel, { marginTop: 0 }]}>Promień obszaru</Text>
          <View style={s.genChipRow}>{[800, 1500, 3000, 6000].map((r) => <Pill key={r} on={radius === r} label={r >= 1000 ? r / 1000 + ' km' : r + ' m'} onPress={() => setRadius(r)} />)}</View>
          <TouchableOpacity style={[s.btnPrimary, { marginTop: 14, flexDirection: 'row', gap: 8 }, !area && { opacity: 0.4 }]} disabled={!area} activeOpacity={0.85} onPress={onNext}>
            <Text style={s.btnPrimaryTxt}>Dalej</Text><Ionicons name="arrow-forward" size={17} color={C.bg} />
          </TouchableOpacity>
        </View>
      </>
    );
  }

  if (step === 'config') {
    return (
      <View style={s.genPanel}>
        <View style={s.genHeader}>
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="chevron-back" size={24} color={C.txt} /></TouchableOpacity>
          <Text style={s.genHeaderT}>Jaka trasa?</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="close" size={22} color={C.txt} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
          <Text style={[s.groupLabel, { marginTop: 0 }]}>Aktywność</Text>
          <View style={s.segment}>
            <TouchableOpacity style={[s.segBtn, cfg.activity === 'bike' && s.segBtnOn]} activeOpacity={0.85} onPress={() => up({ activity: 'bike' })}><Ionicons name="bicycle" size={18} color={cfg.activity === 'bike' ? C.bg : C.txt} /><Text style={[s.segTxt, cfg.activity === 'bike' && s.segTxtOn]}>Rower</Text></TouchableOpacity>
            <TouchableOpacity style={[s.segBtn, cfg.activity === 'walk' && s.segBtnOn]} activeOpacity={0.85} onPress={() => up({ activity: 'walk' })}><Ionicons name="walk" size={18} color={cfg.activity === 'walk' ? C.bg : C.txt} /><Text style={[s.segTxt, cfg.activity === 'walk' && s.segTxtOn]}>Spacer</Text></TouchableOpacity>
          </View>

          <Text style={s.groupLabel}>Długość ({cfg.activity === 'walk' ? 'spacer' : 'trasa'})</Text>
          <View style={s.genChipRow}>{[3, 5, 8, 12].map((l) => <Pill key={l} on={cfg.lengthKm === l} label={l + ' km'} onPress={() => up({ lengthKm: l })} />)}</View>

          {cfg.activity === 'bike' && <>
            <Text style={s.groupLabel}>Nawierzchnia / charakter</Text>
            <View style={s.genChipRow}>{[['cyclepath', 'Ścieżki rowerowe'], ['gravel', 'Szutry'], ['fast', 'Najszybsza']].map(([k, l]) => <Pill key={k} on={cfg.bikeStyle === k} label={l} onPress={() => up({ bikeStyle: k })} />)}</View>
          </>}

          <Text style={s.groupLabel}>Kształt</Text>
          <View style={s.genChipRow}>{[['loop', 'Pętla (wróć do startu)'], ['oneway', 'W jedną stronę']].map(([k, l]) => <Pill key={k} on={cfg.shape === k} label={l} onPress={() => up({ shape: k })} />)}</View>

          <Text style={s.groupLabel}>Dodatkowo</Text>
          {cfg.activity === 'walk' && (
            <View style={s.settingRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={s.settingTxt}>Preferuj ścieżki i szlaki</Text>
                <Text style={[s.sub, { fontSize: 12, marginTop: 2 }]}>leśne ścieżki, przejścia, mniej ulic</Text>
              </View>
              <Switch value={cfg.trails} onValueChange={(v) => up({ trails: v })} trackColor={{ true: C.accent, false: C.stroke }} />
            </View>
          )}
          <View style={s.settingRow}><Text style={s.settingTxt}>Tryb gry terenowej (quizy)</Text><Switch value={cfg.game} onValueChange={(v) => up({ game: v })} trackColor={{ true: C.accent, false: C.stroke }} /></View>
          <View style={s.settingRow}><Text style={s.settingTxt}>Meta w kawiarni</Text><Switch value={cfg.endCafe} onValueChange={(v) => up({ endCafe: v })} trackColor={{ true: C.accent, false: C.stroke }} /></View>
        </ScrollView>
        <View style={s.genFooter}>
          <Text style={[s.sub, { textAlign: 'center', marginBottom: 10, fontSize: 12 }]}>Ułożę po jednej trasie dla każdej kategorii (historia, przyroda, jedzenie…) — przejrzysz i wybierzesz.</Text>
          <TouchableOpacity style={[s.btnPrimary, { flexDirection: 'row', gap: 8 }]} activeOpacity={0.85} onPress={onGenerate}>
            <Ionicons name="sparkles" size={17} color={C.bg} /><Text style={s.btnPrimaryTxt}>Generuj trasy</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ----- results: pełnoekranowy przegląd po kategoriach -----
  if (loading) {
    return (
      <View style={s.genLoaderWrap}>
        <View style={s.genLoaderCard}><ActivityIndicator size="large" color={C.accent} /><Text style={[s.sub, { marginTop: 12 }]}>Układam trasy w okolicy…</Text></View>
      </View>
    );
  }
  if (!results.length) {
    return (
      <View style={s.genPanel}>
        <View style={s.genHeader}>
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="chevron-back" size={24} color={C.txt} /></TouchableOpacity>
          <Text style={s.genHeaderT}>Propozycje</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="close" size={22} color={C.txt} /></TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 16 }}>
          <Ionicons name="map-outline" size={40} color={C.dim} />
          <Text style={[s.sub, { textAlign: 'center' }]}>Nie udało się ułożyć trasy. Spróbuj większy promień lub krótszy dystans.</Text>
          <TouchableOpacity style={s.btnSecondary} activeOpacity={0.8} onPress={onGenerate}><Text style={s.btnSecondaryTxt}>Spróbuj ponownie</Text></TouchableOpacity>
        </View>
      </View>
    );
  }
  return <GenBrowser C={C} s={s} routes={results} onClose={onClose} onBack={onBack} onSave={onSave} onPreview={onPreview} onEdit={onEdit} onRegenerate={onGenerate} onFocus={onFocus} onOpenPoi={onOpenPoi} />;
}

/* ---------- styles ---------- */
function makeStyles(C: C) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    flex: { flex: 1, backgroundColor: C.bg },
    mapTop: { height: 320 },
    mapFull: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

    header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: 66, paddingHorizontal: 20, paddingBottom: 18 },
    h1: { color: C.txt, fontSize: 34, fontWeight: '800', letterSpacing: -1 },
    sub: { color: C.dim, fontSize: 14, marginTop: 4 },
    themeBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke, alignItems: 'center', justifyContent: 'center' },

    card: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.stroke, padding: 16, marginBottom: 12 },
    cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
    dot: { width: 8, height: 8, borderRadius: 4, marginRight: 7 },
    cardNet: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
    cardTitle: { color: C.txt, fontSize: 18, fontWeight: '700', letterSpacing: -0.3, marginBottom: 8 },
    cardMeta: { color: C.dim, fontSize: 13 },

    searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: 26, borderWidth: 1, borderColor: C.stroke, paddingHorizontal: 16, paddingVertical: 13 },
    searchInput: { flex: 1, color: C.txt, fontSize: 15, padding: 0 },
    sectionBig: { color: C.txt, fontSize: 22, fontWeight: '800', letterSpacing: -0.5, paddingHorizontal: 18, paddingTop: 22, paddingBottom: 12 },
    bigCard: { width: 290, height: 200, borderRadius: 20, overflow: 'hidden', marginRight: 14 },
    imgCard: { width: '100%', height: 186, borderRadius: 20, overflow: 'hidden', marginBottom: 14 },
    cardImgBg: { flex: 1, borderRadius: 20, overflow: 'hidden', justifyContent: 'flex-end' },
    cardOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.10)' },
    cardTags: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 6, zIndex: 2 },
    tagPill: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
    tagPillTxt: { color: '#11151a', fontSize: 11, fontWeight: '800' },
    heart: { position: 'absolute', top: 10, right: 10, zIndex: 2, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
    cardGrad: { paddingHorizontal: 16, paddingTop: 44, paddingBottom: 14 },
    cardImgTitle: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
    cardImgMeta: { color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: '600', marginTop: 3 },
    groupLabel: { color: C.dim, fontSize: 13, fontWeight: '600', marginTop: 10, marginBottom: 10, marginLeft: 2 },

    back: { position: 'absolute', top: 52, left: 16, zIndex: 40, width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.stroke },
    layersBtn: { position: 'absolute', top: 52, right: 16, zIndex: 40, width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.stroke },
    detailTitle: { color: C.txt, fontSize: 26, fontWeight: '800', letterSpacing: -0.6, marginTop: 8 },
    stats: { flexDirection: 'row', paddingHorizontal: 18, gap: 10, marginTop: 18 },
    stat: { flex: 1, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.stroke, paddingVertical: 14, alignItems: 'center' },
    statV: { color: C.txt, fontSize: 19, fontWeight: '800' },
    statL: { color: C.dim, fontSize: 11, marginTop: 3 },

    sheetCard: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: C.stroke, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: -5 }, elevation: 18 },
    sheetHead: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.stroke },
    miniCard: { position: 'absolute', left: 14, right: 14, bottom: 28, backgroundColor: C.surface, borderRadius: 22, borderWidth: 1, borderColor: C.stroke, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 18 },
    miniGrip: { width: 38, height: 5, borderRadius: 3, backgroundColor: C.stroke, alignSelf: 'center', marginBottom: 12 },
    miniTitle: { color: C.txt, fontSize: 17, fontWeight: '800', letterSpacing: -0.3, marginTop: 4 },
    miniRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 12 },
    miniBtn: { backgroundColor: C.txt, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 18 },
    detailSectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    exploreHeader: { position: 'absolute', top: 52, left: 14, right: 14, zIndex: 50, flexDirection: 'row', alignItems: 'center', gap: 10 },
    exploreClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke, alignItems: 'center', justifyContent: 'center' },
    exploreCount: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
    exploreCountTxt: { color: C.txt, fontSize: 13, fontWeight: '700' },
    explorePager: { position: 'absolute', left: 0, right: 0, bottom: 28 },
    poiCard: { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.stroke, padding: 16, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 12 },
    poiCardTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    poiCardImg: { width: 64, height: 64, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.stroke },
    poiCardKind: { color: C.accent, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
    poiCardName: { color: C.txt, fontSize: 18, fontWeight: '800', letterSpacing: -0.3, marginTop: 2 },
    poiCardDesc: { color: C.dim, fontSize: 14, lineHeight: 20, marginTop: 12 },
    poiCardTodoLabel: { color: C.dim, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 14 },
    poiCardTodos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    todoChip: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.stroke, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
    todoChipTxt: { color: C.txt, fontSize: 12, fontWeight: '600' },
    poiCardLink: { color: C.accent, fontSize: 14, fontWeight: '700', marginTop: 14 },
    statsInline: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, marginBottom: 14 },
    statInline: { color: C.dim, fontSize: 12, marginRight: 16 },
    statInlineV: { color: C.txt, fontSize: 14, fontWeight: '800' },
    sheetCta: { flexDirection: 'row', gap: 10 },
    sectionT: { color: C.txt, fontSize: 17, fontWeight: '700', letterSpacing: -0.3, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 8 },
    desc: { color: C.dim, fontSize: 15, lineHeight: 23, paddingHorizontal: 20 },
    poiRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 4, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.stroke },
    poiIco: { fontSize: 22, marginRight: 13 },
    poiName: { color: C.txt, fontSize: 15, fontWeight: '600' },
    poiKind: { color: C.dim, fontSize: 12, marginTop: 1 },
    poiKm: { color: C.accent, fontSize: 13, fontWeight: '700' },

    ctaWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 32, gap: 9 },
    cta: { borderRadius: 16, paddingVertical: 16, alignItems: 'center', backgroundColor: C.accent },
    ctaTxt: { color: C.theme === 'light' ? '#ffffff' : '#04240f', fontSize: 16, fontWeight: '800' },
    ctaAlt: { borderRadius: 16, paddingVertical: 13, alignItems: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke },
    ctaAltTxt: { color: C.txt, fontSize: 15, fontWeight: '700' },

    // system przycisków: primary=czarny pill, secondary=biały+1.5px border, ghost
    btnPrimary: { borderRadius: 999, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.txt },
    btnPrimaryTxt: { color: C.bg, fontSize: 16, fontWeight: '800' },
    btnSecondary: { borderRadius: 999, paddingVertical: 14.5, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.txt },
    btnSecondaryTxt: { color: C.txt, fontSize: 15, fontWeight: '700' },
    btnGhost: { borderRadius: 999, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
    btnGhostTxt: { color: C.txt, fontSize: 15, fontWeight: '700' },

    hudTop: { position: 'absolute', top: 52, left: 14, right: 14, borderRadius: 20, padding: 15, overflow: 'hidden', borderWidth: 1, borderColor: C.stroke, backgroundColor: C.glass, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
    hudLabel: { color: C.dim, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
    hudNext: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 7 },
    hudNextName: { flex: 1, color: C.txt, fontSize: 16, fontWeight: '700' },
    hudNextDist: { color: C.accent, fontSize: 15, fontWeight: '800' },
    skipBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: C.stroke, backgroundColor: C.bg, marginLeft: 8 },
    skipTxt: { color: C.dim, fontSize: 11, fontWeight: '700' },
    progress: { height: 4, borderRadius: 2, backgroundColor: C.stroke, marginTop: 13, overflow: 'hidden' },
    progressBar: { height: 4, backgroundColor: C.accent, borderRadius: 2 },

    fitBtn: { position: 'absolute', right: 16, top: 150, zIndex: 45, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: C.stroke, backgroundColor: C.glass },
    minBtn: { position: 'absolute', left: 16, top: 52, zIndex: 45, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: C.stroke, backgroundColor: C.glass },
    locateBtn: { position: 'absolute', right: 16, top: 118, zIndex: 55, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: C.stroke, backgroundColor: C.glass },
    genTop: { position: 'absolute', top: 52, left: 14, right: 14, zIndex: 60, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: 999, borderWidth: 1, borderColor: C.stroke, paddingHorizontal: 16, paddingVertical: 13, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
    genTopTxt: { flex: 1, color: C.txt, fontSize: 13, fontWeight: '700' },
    genBottom: { position: 'absolute', left: 14, right: 14, bottom: 30, backgroundColor: C.surface, borderRadius: 22, borderWidth: 1, borderColor: C.stroke, padding: 16, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 12 },
    genChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    genThemeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.stroke },
    genThemeChipOn: { backgroundColor: C.txt, borderColor: C.txt },
    genThemeTxt: { color: C.txt, fontSize: 13, fontWeight: '700' },
    genPanel: { flex: 1, backgroundColor: C.bg },
    genHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.stroke },
    genHeaderT: { color: C.txt, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
    genFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, paddingBottom: 30, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.stroke },
    genResultCard: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.stroke, padding: 14, marginBottom: 14 },
    genThumb: { height: 120, borderRadius: 14, overflow: 'hidden', backgroundColor: C.bg },
    genResName: { color: C.txt, fontSize: 16, fontWeight: '800', marginTop: 12 },
    genDetToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 11, marginTop: 8, borderTopWidth: 1, borderTopColor: C.stroke },
    genDetTxt: { flex: 1, color: C.accent, fontSize: 13, fontWeight: '800' },
    genPoiRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 8 },
    genPoiName: { color: C.txt, fontSize: 14, fontWeight: '700' },
    genPoiSub: { color: C.dim, fontSize: 12, marginTop: 1 },
    genLoaderWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
    genLoaderCard: { alignItems: 'center', padding: 30 },
    genBrowTop: { position: 'absolute', top: 52, left: 14, right: 14, zIndex: 60, flexDirection: 'row', alignItems: 'center', gap: 8 },
    genBrowIcon: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
    genCatChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke },
    genCatChipOn: { backgroundColor: C.txt, borderColor: C.txt },
    genCatTxt: { color: C.txt, fontSize: 12, fontWeight: '700' },
    genBrowBottom: { position: 'absolute', left: 0, right: 0, bottom: 28 },
    genBrowCard: { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.stroke, padding: 16, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 14 },
    genCatBadge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent + '1f', borderWidth: 1, borderColor: C.accent },
    genBrowSection: { color: C.dim, fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 2 },
    genBrowFooter: { flexDirection: 'row', gap: 10, paddingHorizontal: 18, marginTop: 12 },
    resumeBar: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.txt, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, marginHorizontal: 18, marginTop: 14 },
    resumeIco: { width: 38, height: 38, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
    resumeLabel: { color: C.bg, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, opacity: 0.8 },
    resumeName: { color: C.bg, fontSize: 15, fontWeight: '800', marginTop: 1 },
    resumeNext: { color: C.bg, fontSize: 12, fontWeight: '600', opacity: 0.85, marginTop: 2 },
    resumeGo: { backgroundColor: C.bg, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16 },
    resumeGoTxt: { color: C.txt, fontSize: 13, fontWeight: '800' },
    fitBtnInner: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

    hudBottom: { position: 'absolute', left: 14, right: 14, bottom: 30, borderRadius: 22, padding: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.stroke, backgroundColor: C.glass, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 10 },
    hudStats: { flexDirection: 'row', justifyContent: 'space-between' },
    hudStat: { alignItems: 'center', flex: 1 },
    hudV: { color: C.txt, fontSize: 23, fontWeight: '800' },
    hudUnit: { color: C.dim, fontSize: 12, fontWeight: '600' },
    hudL: { color: C.dim, fontSize: 10, marginTop: 3 },
    rideCtrls: { flexDirection: 'row', gap: 9, marginTop: 16 },
    rc: { flex: 1, borderRadius: 999, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.txt },
    rcStop: { backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent' },
    rcGo: { flex: 1.7, backgroundColor: C.txt, borderColor: C.txt },
    rcRow: { flexDirection: 'row', gap: 6 },
    rcTxt: { color: C.txt, fontSize: 14, fontWeight: '700' },
    navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 },
    statsExtra: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.stroke },
    hudV2: { color: C.txt, fontSize: 18, fontWeight: '800' },

    variantRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    variant: { flex: 1, borderRadius: 14, paddingVertical: 11, alignItems: 'center', gap: 3, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.stroke },
    variantOn: { backgroundColor: C.txt, borderColor: C.txt },
    variantLabel: { color: C.txt, fontSize: 12, fontWeight: '700', marginTop: 2 },
    variantDist: { color: C.dim, fontSize: 11, marginTop: 1 },
    variantLabelOn: { color: C.bg },

    alert: { position: 'absolute', top: 52, left: 14, right: 14, zIndex: 80, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.stroke, backgroundColor: C.glassStrong, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 14 },
    alertBlur: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15 },
    alertIco: { width: 46, height: 46, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke, alignItems: 'center', justifyContent: 'center' },
    alertHd: { color: C.accent, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
    alertName: { color: C.txt, fontSize: 16, fontWeight: '800', marginVertical: 2 },
    alertSub: { color: C.dim, fontSize: 13 },

    scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
    navSheet: { backgroundColor: C.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 36, borderWidth: 1, borderColor: C.stroke },
    thumbSheet: { backgroundColor: C.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 36, borderWidth: 1, borderColor: C.stroke },
    thumbCand: { width: '31.5%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: C.bg, borderWidth: 1, borderColor: C.stroke },
    thumbSel: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
    navSheetTitle: { color: C.txt, fontSize: 18, fontWeight: '800', letterSpacing: -0.3, marginTop: 4 },
    renameWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 28 },
    renameCard: { width: '100%', backgroundColor: C.surface, borderRadius: 22, borderWidth: 1, borderColor: C.stroke, padding: 20 },
    renameInput: { marginTop: 14, color: C.txt, fontSize: 16, fontWeight: '600', backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.stroke, paddingHorizontal: 14, paddingVertical: 12 },
    renameBtn: { width: 36, height: 36, borderRadius: 999, borderWidth: 1, borderColor: C.stroke, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, marginTop: 8 },
    poiSheet: { backgroundColor: C.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' },
    poiSheetHero: { height: 200, justifyContent: 'flex-end' },
    poiSheetClose: { position: 'absolute', top: 14, right: 14, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
    poiSheetHeroGrad: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16 },
    poiSheetKindImg: { color: '#fff', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.9 },
    poiSheetNameImg: { color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginTop: 3 },
    sheet: { backgroundColor: C.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 40, borderWidth: 1, borderColor: C.stroke },
    grip: { width: 38, height: 5, borderRadius: 3, backgroundColor: C.stroke, alignSelf: 'center', marginBottom: 16 },
    sheetKind: { color: C.accent, fontSize: 12, fontWeight: '700', alignSelf: 'flex-start' },
    glyphBadge: { width: 30, height: 30, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
    quizCard: { marginTop: 18, backgroundColor: C.bg, borderRadius: 18, borderWidth: 1, borderColor: C.stroke, padding: 16 },
    quizHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    quizTag: { color: C.accent, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
    quizQ: { color: C.txt, fontSize: 16, fontWeight: '700', lineHeight: 22, marginBottom: 12 },
    quizOpt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 13, paddingHorizontal: 15, borderRadius: 13, borderWidth: 1.5, borderColor: C.stroke, backgroundColor: C.surface, marginBottom: 9 },
    quizOptRight: { backgroundColor: '#0e9f6e', borderColor: '#0e9f6e' },
    quizOptWrong: { backgroundColor: '#e0483b', borderColor: '#e0483b' },
    quizOptTxt: { color: C.txt, fontSize: 14.5, fontWeight: '600', flex: 1 },
    quizResult: { fontSize: 14, fontWeight: '800', marginBottom: 8 },
    quizFact: { color: C.dim, fontSize: 14, lineHeight: 21, flex: 1 },
    sheetName: { color: C.txt, fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginTop: 6 },
    sheetPhoto: { height: 140, borderRadius: 18, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', marginVertical: 14, borderWidth: 1, borderColor: C.stroke },
    sheetDesc: { color: C.dim, fontSize: 15, lineHeight: 23 },
    sheetLink: { color: C.accent, fontSize: 14, fontWeight: '700', marginTop: 16 },

    stylePanel: { backgroundColor: C.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, paddingBottom: 34, borderWidth: 1, borderColor: C.stroke },
    styleChip: { width: 104, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center', backgroundColor: C.bg, borderWidth: 1, borderColor: C.stroke },
    styleChipOn: { borderColor: C.accent, borderWidth: 2, backgroundColor: C.surface },
    styleChipLabel: { color: C.txt, fontSize: 13, fontWeight: '700', marginTop: 6 },
    styleChipLabelOn: { color: C.accent },
    styleChipDesc: { color: C.dim, fontSize: 11, marginTop: 2, textAlign: 'center' },

    h2: { color: C.txt, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
    planCta: { marginTop: 14, borderRadius: 16, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, borderColor: C.accent, borderStyle: 'dashed' },
    planCtaTxt: { color: C.accent, fontSize: 15, fontWeight: '800' },

    planTop: { position: 'absolute', top: 52, left: 14, right: 14, borderRadius: 20, padding: 15, overflow: 'hidden', borderWidth: 1, borderColor: C.stroke, backgroundColor: C.glass, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
    planProfs: { flexDirection: 'row', gap: 8, marginTop: 12 },
    planProf: { flex: 1, borderRadius: 12, paddingVertical: 9, alignItems: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke },
    planProfTxt: { color: C.txt, fontSize: 12, fontWeight: '700' },
    modePill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke },
    modePillOn: { backgroundColor: C.txt, borderColor: C.txt },
    modePillTxt: { color: C.txt, fontSize: 13, fontWeight: '700' },
    modePillTxtOn: { color: C.bg },
    planBottom: { position: 'absolute', left: 14, right: 14, bottom: 96, borderRadius: 22, padding: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.stroke, backgroundColor: C.glass, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 10 },
    planStats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
    planCount: { color: C.dim, fontSize: 13, fontWeight: '700' },
    detailsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginTop: 4, borderTopWidth: 1, borderTopColor: C.stroke },
    detailsToggleTxt: { color: C.dim, fontSize: 13, fontWeight: '700' },
    planActions: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 14 },
    iconBtn: { width: 46, height: 46, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke, alignItems: 'center', justifyContent: 'center' },
    btnRow: { flexDirection: 'row', gap: 6 },
    nearbyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke },
    nearbyChip: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 200, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke },
    nearbyChipTxt: { color: C.txt, fontSize: 12, fontWeight: '600', flexShrink: 1 },
    nearbyTop: { position: 'absolute', top: 52, left: 14, right: 14, zIndex: 60, flexDirection: 'row', alignItems: 'center', gap: 8 },
    ddChip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 7, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
    ddChipOn: { borderColor: C.txt },
    ddChipTxt: { flex: 1, color: C.txt, fontSize: 13, fontWeight: '700' },
    ddBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 52 },
    ddPanel: { position: 'absolute', top: 98, zIndex: 58, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.stroke, paddingVertical: 6, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 16 },
    ddRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
    ddRowTxt: { color: C.dim, fontSize: 14, fontWeight: '600' },
    ddCheck: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: C.stroke, alignItems: 'center', justifyContent: 'center' },
    ddCheckOn: { backgroundColor: C.txt, borderColor: C.txt },
    radiusPill: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke },
    radiusPillTxt: { color: C.txt, fontSize: 12, fontWeight: '700' },
    parkingToggle: { width: 44, height: 38, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke },
    nearbyBottom: { position: 'absolute', left: 0, right: 0, bottom: 28 },
    countPill: { alignSelf: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
    nearbyEmptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30, marginHorizontal: 18, backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.stroke },
    nearbyFooter: { flexDirection: 'row', gap: 10, paddingHorizontal: 18, marginTop: 12 },
    nearbySheet: { backgroundColor: C.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34 },
    nearbyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    nearbyToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.stroke },
    nearbyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.stroke },
    nearbyName: { color: C.txt, fontSize: 15, fontWeight: '700' },
    nearbySub: { color: C.dim, fontSize: 12, marginTop: 2 },
    nearbyDrive: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke, alignItems: 'center', justifyContent: 'center' },
    nearbyAdd: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke, alignItems: 'center', justifyContent: 'center' },
    nearbyAddOn: { backgroundColor: C.accent, borderColor: C.accent },
    statRow4: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    stat4: { alignItems: 'center', flex: 1 },
    stat4v: { color: C.txt, fontSize: 18, fontWeight: '800' },
    stat4l: { color: C.dim, fontSize: 11, marginTop: 2 },
    surfaceBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 6, backgroundColor: C.stroke },
    surfaceLegend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, columnGap: 12, rowGap: 4 },
    surfaceLegItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    surfaceDot: { width: 9, height: 9, borderRadius: 5 },
    surfaceLegTxt: { color: C.dim, fontSize: 11, fontWeight: '600' },

    segment: { flexDirection: 'row', gap: 6, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.stroke, padding: 5 },
    segBtn: { flex: 1, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 10 },
    segBtnOn: { backgroundColor: C.txt },
    segTxt: { color: C.txt, fontSize: 14, fontWeight: '700' },
    segTxtOn: { color: C.bg },
    dashStats: { flexDirection: 'row', gap: 10, marginTop: 14 },
    dashStat: { flex: 1, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.stroke, paddingVertical: 14, alignItems: 'center', gap: 4 },
    dashStatV: { color: C.txt, fontSize: 20, fontWeight: '800' },
    dashStatL: { color: C.dim, fontSize: 11 },
    dashSectionRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 18 },
    seeAll: { color: C.accent, fontSize: 14, fontWeight: '700', paddingBottom: 2 },
    profStatsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
    histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.stroke, padding: 10, marginBottom: 8 },
    histThumb: { width: 46, height: 46, borderRadius: 10, overflow: 'hidden', backgroundColor: C.bg },
    histName: { color: C.txt, fontSize: 14, fontWeight: '700' },
    histMeta: { color: C.dim, fontSize: 12, marginTop: 2 },
    quizBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.stroke, paddingVertical: 16, paddingHorizontal: 18, marginTop: 4 },
    quizBannerLabel: { color: C.dim, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
    quizBannerLevel: { color: C.txt, fontSize: 20, fontWeight: '800', letterSpacing: -0.4, marginTop: 2 },
    quizBannerPts: { alignItems: 'flex-end' },
    quizBannerPtsV: { color: C.accent, fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
    quizBannerPtsL: { color: C.dim, fontSize: 12, fontWeight: '700' },
    summaryRoot: { flex: 1, backgroundColor: C.bg },
    summaryBadgeBig: { alignSelf: 'center', width: 88, height: 88, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent + '1f', borderWidth: 2, borderColor: C.accent },
    summaryHd: { color: C.txt, fontSize: 26, fontWeight: '800', letterSpacing: -0.6, textAlign: 'center', marginTop: 18 },
    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 24 },
    summaryStat: { width: '47.7%', flexGrow: 1, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.stroke, paddingVertical: 18, alignItems: 'center' },
    summaryStatV: { color: C.txt, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
    summaryStatL: { color: C.dim, fontSize: 12, marginTop: 3 },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.stroke, padding: 14, marginTop: 10 },
    badgeIco: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent + '1f', borderWidth: 1, borderColor: C.accent },
    badgeName: { color: C.txt, fontSize: 15, fontWeight: '800' },
    badgeDesc: { color: C.dim, fontSize: 12, marginTop: 2 },
    badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
    badgeChip: { width: '30.7%', flexGrow: 1, alignItems: 'center', backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.stroke, paddingVertical: 14, paddingHorizontal: 6 },
    badgeChipLocked: { opacity: 0.5 },
    badgeChipIco: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, borderWidth: 1, borderColor: C.stroke, marginBottom: 7 },
    badgeChipTxt: { color: C.txt, fontSize: 11, fontWeight: '700', textAlign: 'center' },
    profStat: { flex: 1, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.stroke, paddingVertical: 16, alignItems: 'center' },
    profStatV: { color: C.txt, fontSize: 24, fontWeight: '800' },
    settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.stroke, paddingVertical: 15, paddingHorizontal: 16, marginBottom: 10 },
    settingTxt: { color: C.txt, fontSize: 15, fontWeight: '600' },
    settingVal: { color: C.dim, fontSize: 14 },

    bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.stroke, paddingTop: 10, paddingBottom: 30 },
    barItem: { flex: 1, alignItems: 'center', gap: 3 },
    barLabel: { color: C.dim, fontSize: 10, fontWeight: '600' },

    splash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
    splashLogo: { width: 96, height: 96, borderRadius: 28, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
    splashTitle: { color: C.txt, fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
    splashSub: { color: C.dim, fontSize: 14, marginTop: 4 },
  });
}
