import { readFileSync, writeFileSync } from 'node:fs';
const data = readFileSync('data.ts', 'utf8');
const routes = JSON.parse(readFileSync('scripts/generated.json', 'utf8'));
if (!routes.length) throw new Error('generated.json puste');
if (data.includes(`"id":"${routes[0].id}"`)) { console.log('Trasy już wstawione — pomijam.'); process.exit(0); }
const marker = '\n];\n\n// dodatkowe szlaki Velo Małopolski';
const idx = data.indexOf(marker);
if (idx < 0) throw new Error('Nie znaleziono markera końca ROUTES');
const json = routes.map((r) => JSON.stringify(r)).join(',\n');
writeFileSync('data.ts', data.slice(0, idx) + ',\n' + json + data.slice(idx));
console.log('Wstawiono', routes.length, 'tras do data.ts');
