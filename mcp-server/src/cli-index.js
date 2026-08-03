#!/usr/bin/env node
/** Kütüphaneyi indeksler ve istatistikleri yazar: npm run index */
import { Kutuphane } from './indexer.js';
import { KUTUPHANE_KOK } from './config.js';

const kutuphane = new Kutuphane(KUTUPHANE_KOK);
const ist = await kutuphane.yenile();

console.log(`Kök: ${ist.kok}`);
console.log(`Belge: ${ist.belgeSayisi} | Bölüm: ${ist.parcaSayisi} | Terim: ${ist.terimSayisi} | ${ist.toplamBoyutKb} KB`);
console.log('\nDepartman dağılımı:');
for (const [dep, sayi] of Object.entries(ist.departmanDagilimi).sort()) {
  console.log(`  ${dep.padEnd(20)} ${sayi}`);
}
if (ist.uyarilar.length) {
  console.log('\nUyarılar:');
  for (const uyari of ist.uyarilar) console.log(`  - ${uyari}`);
}
