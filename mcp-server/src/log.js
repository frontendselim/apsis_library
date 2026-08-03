/**
 * Sorulan soruların ve bilgi boşluklarının kaydı.
 * Amaç: kütüphanede eksik olan konuları görünür kılmak.
 */
import { appendFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export class SoruGunlugu {
  constructor(dosyaYolu) {
    this.dosyaYolu = dosyaYolu;
    this.kapali = process.env.APSIS_GUNLUK === 'kapali';
  }

  async kaydet(kayit) {
    if (this.kapali) return;
    const satir = JSON.stringify({ zaman: new Date().toISOString(), ...kayit }) + '\n';
    try {
      await mkdir(path.dirname(this.dosyaYolu), { recursive: true });
      await appendFile(this.dosyaYolu, satir, 'utf8');
    } catch {
      // Günlük yazılamazsa aracın çalışmasını engellemeyiz.
    }
  }

  async kayitlariOku() {
    try {
      const ham = await readFile(this.dosyaYolu, 'utf8');
      return ham
        .split('\n')
        .filter(Boolean)
        .map((satir) => {
          try { return JSON.parse(satir); } catch { return null; }
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  /** Basit özet: en çok sorulan konular ve cevapsız kalan sorular. */
  async ozet({ sonGun = 30 } = {}) {
    const kayitlar = await this.kayitlariOku();
    const esik = Date.now() - sonGun * 24 * 60 * 60 * 1000;
    const guncel = kayitlar.filter((k) => Date.parse(k.zaman) >= esik);

    const departmanlar = {};
    const cevapsiz = [];
    const kullanicilar = {};
    for (const kayit of guncel) {
      departmanlar[kayit.departman || 'belirtilmemiş'] =
        (departmanlar[kayit.departman || 'belirtilmemiş'] ?? 0) + 1;
      kullanicilar[kayit.kullanici || 'bilinmiyor'] =
        (kullanicilar[kayit.kullanici || 'bilinmiyor'] ?? 0) + 1;
      if (kayit.bulundu === false) cevapsiz.push(kayit);
    }

    return {
      dosya: this.dosyaYolu,
      toplamKayit: kayitlar.length,
      sonGunKayit: guncel.length,
      departmanlar,
      kullanicilar,
      cevapsizSayisi: cevapsiz.length,
      cevapsizOrnekler: cevapsiz.slice(-25).map((k) => ({
        zaman: k.zaman,
        soru: k.soru,
        departman: k.departman,
        kullanici: k.kullanici,
        not: k.not
      }))
    };
  }
}
