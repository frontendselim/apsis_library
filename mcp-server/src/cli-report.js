#!/usr/bin/env node
/** Soru günlüğü raporu: npm run rapor [gün] */
import { SoruGunlugu } from './log.js';
import { GUNLUK_DOSYASI } from './config.js';

const gun = Number(process.argv[2] || 30);
const ozet = await new SoruGunlugu(GUNLUK_DOSYASI).ozet({ sonGun: gun });

console.log(`Günlük dosyası: ${ozet.dosya}`);
console.log(`Toplam kayıt: ${ozet.toplamKayit} | Son ${gun} gün: ${ozet.sonGunKayit} | Cevapsız: ${ozet.cevapsizSayisi}\n`);

console.log('Departmana göre soru sayısı:');
for (const [dep, sayi] of Object.entries(ozet.departmanlar).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${dep.padEnd(22)} ${sayi}`);
}

console.log('\nKullanıcıya göre:');
for (const [kisi, sayi] of Object.entries(ozet.kullanicilar).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${kisi.padEnd(22)} ${sayi}`);
}

if (ozet.cevapsizOrnekler.length) {
  console.log('\nKütüphanede karşılığı bulunamayan sorular (eksik içerik listesi):');
  for (const kayit of ozet.cevapsizOrnekler) {
    console.log(`  [${kayit.zaman.slice(0, 10)}] ${kayit.soru}`);
    if (kayit.not) console.log(`      not: ${kayit.not}`);
  }
}
