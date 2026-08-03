#!/usr/bin/env node
/** Terminalden arama: npm run ara -- "kobigel başvuru şartları" [departman] */
import { Kutuphane } from './indexer.js';
import { ara } from './search.js';
import { KUTUPHANE_KOK } from './config.js';

const [soru, departman] = process.argv.slice(2);
if (!soru) {
  console.error('Kullanım: npm run ara -- "sorunuz" [departman]');
  process.exit(1);
}

const kutuphane = new Kutuphane(KUTUPHANE_KOK);
await kutuphane.yenile();
const { sonuclar, toplamEslesme } = ara(kutuphane, { soru, departman: departman ?? '', limit: 8 });

if (!sonuclar.length) {
  console.log(`"${soru}" için sonuç yok. (${kutuphane.belgeler.size} belge tarandı)`);
  process.exit(0);
}

console.log(`${sonuclar.length}/${toplamEslesme} sonuç:\n`);
for (const [i, s] of sonuclar.entries()) {
  console.log(`${i + 1}. ${s.baslik}  [skor ${s.skor}]`);
  console.log(`   kaynak: ${s.parcaId} · bölüm: ${s.bolum} · departman: ${s.departman}`);
  console.log(`   ${s.alinti.replace(/\n+/g, ' ').slice(0, 300)}\n`);
}
