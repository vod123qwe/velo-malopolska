# VeloMałopolska — test na iPhonie (Expo Go)

Aplikacja React Native + Expo. Testujesz na telefonie **bez Maca i bez konta Apple** — przez darmową apkę **Expo Go**.

## Jednorazowo
1. Na iPhonie zainstaluj **Expo Go** z App Store.
2. (raz) W tym folderze: `npm install`

## Uruchomienie (za każdym razem)
W terminalu, w folderze `velo-expo`:

```
npx expo start --tunnel
```

Pojawi się **kod QR**. Zeskanuj go **aparatem iPhone'a** (nie trzeba robić zdjęcia — wyskoczy baner „Otwórz w Expo Go"). Apka załaduje się na telefonie.

- Jeśli telefon i komputer są w **tej samej sieci Wi-Fi**, możesz pominąć `--tunnel` (szybciej): `npx expo start`.
- Po każdej zmianie kodu apka odświeża się sama (hot reload). Potrząśnij telefonem → menu deweloperskie (reload).

## Jak testować
- **Lista tras** → wybierz trasę → **szczegóły** (mapa + opis + miejsca).
- **„Uruchom (GPS)"** — apka poprosi o lokalizację, śledzi Cię na żywo; gdy zbliżysz się do ciekawego miejsca (<130 m) → wibracja + baner „warto się zatrzymać".
- **„Symuluj przejazd"** — przejazd bez ruszania się z miejsca (do testów alertów POI przy biurku).

## Co działa w Expo Go (ta wersja)
- Mapa (Leaflet/OSM w WebView), prawdziwy GPS, alerty POI z wibracją, czytanie opisów + Wikipedia.

## Co wymaga „dev buildu" (następny etap, EAS Build w chmurze + konto Apple)
- Natywna mapa MapKit/MapLibre, powiadomienia w tle (gdy apka zamknięta / ekran zgaszony), instalacja przez TestFlight.
