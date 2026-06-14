# VeloMałopolska — audyt aplikacji (v1)

Stan: RN + Expo (Expo Go, SDK 54). Cała logika w `App.tsx` (~2.5k linii), mapa `mapHtml.ts` (Leaflet w WebView), dane `data.ts` (33 trasy: 7 ręcznych + 26 wygenerowanych). Dobry, spójny system wizualny (Bolt/TripAdvisor, flat ikony, czarny pill/biały border/ghost). Poniżej: co poprawić, dodać, usunąć + pomysły UX/UI.

## 🐞 Dług techniczny / do usunięcia
- **Martwy kod**: komponent `GenResultCard` (nieużywany), styl `poiIco`, osierocone style (`radiusPill`, `parkingToggle`, `genThemeChip(On)`, `nearbySheet`, `nearbyRow`, `nearbyToggleRow`, `nearbyChip`), pole `avoidBusy` w `genCfg`, funkcja `ico()` + import `ICONS` (już prawie nieużywane), `nextIcon` w stanie HUD. → wyczyścić.
- **`App.tsx` to jeden plik ~2.5k linii** — największy dług. Podzielić na: `screens/` (Dashboard, RoutesList, Detail, Ride, Plan, Generator, Profile, Summary), `components/` (PoiSheet, PoiGlyph, RouteCard, RouteThumb…), `lib/` (overpass/brouter/wiki, geo, quiz), `theme.ts`. Ułatwi rozwój i review.
- **Pliki dev** `scripts/test-net.mjs`, `scripts/smoke.mjs` — usunąć (zostawić `gen-routes.mjs`, `insert.mjs`).
- **Emoji**: został `st.emo` na dashboardzie (statsy) — do flat-ikon dla spójności.

## 🧭 UX — propozycje (priorytet malejąco)
1. **Wskazówki głosowe (TTS)** w trakcie jazdy/spaceru — „za 200 m punkt widokowy", „skręć…". Kluczowe dla roweru (oczy na drodze). `expo-speech` działa w Expo Go. Duży win.
2. **Historia przejazdów** — `rideStats` ma tylko sumy; dodać log pojedynczych tras (data, dystans, czas, mapka). Ekran „Moje przejazdy".
3. **Onboarding** (3 ekrany przy 1. uruchomieniu): odkrywaj / planuj / prowadź + zgody (lokalizacja, powiadomienia).
4. **Import/eksport GPX** — standard w aplikacjach rowerowych (wgraj cudzą trasę, wyślij swoją do Garmina/Stravy).
5. **Pogoda na trasie** (open-meteo, darmowe) — temperatura/deszcz/wiatr na dziś przy trasie.
6. **Pominięcie/„zrobione" POI** podczas jazdy ✅ (dodane). Rozszerzyć o „odwiedzone" liczone do statystyk.
7. **Recenzje/oceny tras** (lokalnie) + „polub" już jest.
8. **Filtry odkrywania**: po regionie, długości, „w pobliżu mnie" (sortowanie po odległości od GPS).
9. **Pauza/wznów + auto-pauza** w trybie jazdy (gdy stoisz).

## 🎨 UI — propozycje
- **Skeletony** zamiast spinnerów (dashboard, generator, listy) — płynniejszy odbiór.
- **Mikro-interakcje**: animowane przejścia ekranów, „pop" przy zdobyciu odznaki, licznik kalorii „liczący się".
- **Spójna skala typografii/odstępów** (tokeny) — teraz wartości rozsiane po stylach.
- **Mapa**: klasteryzacja gęstych POI, legenda kolorów nawierzchni, przycisk „warstwy" widoczny też w detalu.
- **Wykres wysokości interaktywny** (dotyk → punkt na trasie).
- **Galeria zdjęć POI** w bottom-sheet (więcej niż 1 zdjęcie z Wiki).
- **Dark mode**: dopieścić kontrasty kafli/cieni.

## ➕ Nowe funkcje (większe)
- **Tło GPS + Live Activity / Dynamic Island** — wymaga **EAS dev build** (poza Expo Go). Śledzenie przy zablokowanym ekranie + widżet na lock screenie. Naturalny następny duży krok.
- **Apple Watch** — wymaga natywnej apki watchOS (Swift) w dev buildzie; w Expo Go niemożliwe. Realne dopiero po przejściu na EAS + custom native.
- **Rozbudowa gier**: serie (streak), ranking, więcej typów zadań (foto-checkpoint, zbierz N punktów), odznaki regionalne.
- **Tryb offline**: cache kafli mapy + tras pobranych „na trasę bez zasięgu".
- **Społeczność**: udostępnij trasę linkiem / współdzielone kolekcje.

## ✅ Quick wins (szybkie)
- Wyczyścić martwy kod (sekcja wyżej).
- Flat-ikona zamiast `st.emo` na dashboardzie.
- „Znajdź mnie" również na ekranie detalu/jazdy (jest fitBtn — dodać czysty „locate").
- Docentrowanie kamery na użytkowniku przy wejściu w aktywną trasę.
- Statystyki spaceru: tempo (min/km) zamiast km/h (bardziej naturalne dla pieszych).

## Priorytet na najbliżej (rekomendacja)
1) Wskazówki głosowe (TTS) → 2) Historia przejazdów → 3) EAS dev build (tło GPS + Live Activity) → 4) GPX import/eksport → 5) sprzątanie kodu + podział `App.tsx`.
