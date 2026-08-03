/**
 * Kütüphane indeksleyici.
 * Dizini tarar, metinleri çıkarır, bölümlere (chunk) ayırır ve
 * BM25 araması için ters indeks kurar.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { metinCikar, onBilgiAyristir, DESTEKLENEN_UZANTILAR } from './extract.js';
import { tokenize, normalize } from './text.js';

const ATLANACAK_DIZINLER = new Set([
  '.git', 'node_modules', 'logs', 'mcp-server', '.vscode', '.idea', '__pycache__'
]);

const MAKS_PARCA = 1600;   // karakter
const ORTUSME = 180;       // ardışık parçalar arası tekrar payı

export class Kutuphane {
  /**
   * @param {string} kok Kütüphane dizininin mutlak yolu
   */
  constructor(kok) {
    this.kok = kok;
    this.belgeler = new Map();      // id -> belge
    this.parcalar = [];             // {id, belgeId, baslik, metin, tokenSayisi}
    this.sozluk = new Map();        // terim -> Map(parcaIndex -> tf)
    this.ortalamaUzunluk = 1;
    this.departmanlar = {};
    this.olusturmaZamani = null;
    this.uyarilar = [];
    this._metinOnbellek = new Map(); // yol -> {mtime, metin}
    this._imza = '';
    this._sonKontrol = 0;
    this._yenilemeIslemi = null;
  }

  /** Sık çağrılan araçlar için: dosyalar değiştiyse indeksi tazeler. */
  async gerekirseYenile({ aralikMs = 15000 } = {}) {
    const simdi = Date.now();
    if (this.olusturmaZamani && simdi - this._sonKontrol < aralikMs) return false;
    this._sonKontrol = simdi;
    const dosyalar = await this._dosyalariTara();
    const imza = dosyalar.map((d) => `${d.gorece}:${d.mtime}:${d.boyut}`).join('|');
    if (imza === this._imza && this.olusturmaZamani) return false;
    await this.yenile(dosyalar);
    return true;
  }

  /** İndeksi baştan kurar. */
  async yenile(onTaranmis = null) {
    if (this._yenilemeIslemi) return this._yenilemeIslemi;
    this._yenilemeIslemi = this._yenile(onTaranmis).finally(() => {
      this._yenilemeIslemi = null;
    });
    return this._yenilemeIslemi;
  }

  async _yenile(onTaranmis) {
    const dosyalar = onTaranmis ?? (await this._dosyalariTara());
    this._imza = dosyalar.map((d) => `${d.gorece}:${d.mtime}:${d.boyut}`).join('|');

    this.departmanlar = await this._departmanlariOku();
    this.belgeler = new Map();
    this.parcalar = [];
    this.sozluk = new Map();
    this.uyarilar = [];

    for (const dosya of dosyalar) {
      try {
        const belge = await this._belgeYukle(dosya);
        if (!belge) continue;
        this.belgeler.set(belge.id, belge);
      } catch (hata) {
        this.uyarilar.push(`${dosya.gorece}: ${hata.message}`);
      }
    }

    // Ters indeks
    let toplamUzunluk = 0;
    this.parcalar.forEach((parca, i) => {
      const tokenlar = tokenize(`${parca.baslik} ${parca.metin}`);
      parca.tokenSayisi = tokenlar.length;
      toplamUzunluk += tokenlar.length;
      for (const terim of tokenlar) {
        let gonderme = this.sozluk.get(terim);
        if (!gonderme) {
          gonderme = new Map();
          this.sozluk.set(terim, gonderme);
        }
        gonderme.set(i, (gonderme.get(i) ?? 0) + 1);
      }
    });
    this.ortalamaUzunluk = this.parcalar.length ? toplamUzunluk / this.parcalar.length : 1;
    this.olusturmaZamani = new Date().toISOString();
    return this.istatistik();
  }

  istatistik() {
    const departmanDagilimi = {};
    let toplamBoyut = 0;
    for (const belge of this.belgeler.values()) {
      departmanDagilimi[belge.departman] = (departmanDagilimi[belge.departman] ?? 0) + 1;
      toplamBoyut += belge.boyut;
    }
    return {
      kok: this.kok,
      belgeSayisi: this.belgeler.size,
      parcaSayisi: this.parcalar.length,
      terimSayisi: this.sozluk.size,
      toplamBoyutKb: Math.round(toplamBoyut / 1024),
      departmanDagilimi,
      olusturmaZamani: this.olusturmaZamani,
      uyarilar: this.uyarilar
    };
  }

  /** Departman tanımları (kutuphane/_departmanlar.json). */
  async _departmanlariOku() {
    try {
      const ham = await readFile(path.join(this.kok, '_departmanlar.json'), 'utf8');
      return JSON.parse(ham);
    } catch {
      return {};
    }
  }

  async _dosyalariTara() {
    const sonuc = [];
    const gez = async (dizin) => {
      let girdiler;
      try {
        girdiler = await readdir(dizin, { withFileTypes: true });
      } catch {
        return;
      }
      for (const girdi of girdiler) {
        if (girdi.name.startsWith('.') || girdi.name.startsWith('~$')) continue;
        const tamYol = path.join(dizin, girdi.name);
        if (girdi.isDirectory()) {
          if (ATLANACAK_DIZINLER.has(girdi.name)) continue;
          await gez(tamYol);
        } else if (girdi.isFile()) {
          const uzanti = path.extname(girdi.name).toLowerCase();
          if (!DESTEKLENEN_UZANTILAR.has(uzanti)) continue;
          const gorece = path.relative(this.kok, tamYol);
          // Kök seviyedeki "_" ile başlayanlar yapılandırma/şablondur, içerik değil
          // (ör. _departmanlar.json, _sablonlar/). Departman içindeki _yonerge.md indekslenir.
          if (gorece.split(path.sep)[0].startsWith('_')) continue;
          const bilgi = await stat(tamYol);
          sonuc.push({
            yol: tamYol,
            gorece,
            mtime: Math.floor(bilgi.mtimeMs),
            boyut: bilgi.size
          });
        }
      }
    };
    await gez(this.kok);
    sonuc.sort((a, b) => a.gorece.localeCompare(b.gorece, 'tr'));
    return sonuc;
  }

  async _belgeYukle(dosya) {
    const onbellek = this._metinOnbellek.get(dosya.yol);
    let ham;
    if (onbellek && onbellek.mtime === dosya.mtime) {
      ham = onbellek.metin;
    } else {
      const { metin, uyari } = await metinCikar(dosya.yol);
      if (uyari) this.uyarilar.push(`${dosya.gorece}: ${uyari}`);
      ham = metin;
      this._metinOnbellek.set(dosya.yol, { mtime: dosya.mtime, metin: ham });
    }
    if (!ham || !ham.trim()) return null;

    const { meta, govde } = onBilgiAyristir(ham);
    const id = dosya.gorece.split(path.sep).join('/');
    const klasor = id.split('/')[0];
    const departman = meta.departman || (id.includes('/') ? klasor : 'genel');

    const belge = {
      id,
      yol: dosya.yol,
      dosyaAdi: path.basename(dosya.gorece),
      uzanti: path.extname(dosya.gorece).toLowerCase(),
      departman,
      baslik: meta.baslik || ilkBaslik(govde) || path.basename(dosya.gorece, path.extname(dosya.gorece)),
      ozet: meta.ozet || '',
      etiketler: dizile(meta.etiketler),
      program: meta.program || '',
      kaynak: meta.kaynak || '',
      yururluk: meta.yururluk || '',
      guncelleme: meta.guncelleme || '',
      sorumlu: meta.sorumlu || '',
      gizlilik: meta.gizlilik || 'kurum-ici',
      meta,
      metin: govde,
      boyut: dosya.boyut,
      mtime: dosya.mtime,
      parcaIndexleri: []
    };

    for (const bolum of bolumle(govde)) {
      const index = this.parcalar.length;
      this.parcalar.push({
        id: `${id}#${belge.parcaIndexleri.length + 1}`,
        belgeId: id,
        sira: belge.parcaIndexleri.length + 1,
        baslik: bolum.baslik ? `${belge.baslik} › ${bolum.baslik}` : belge.baslik,
        bolumBasligi: bolum.baslik,
        metin: bolum.metin,
        tokenSayisi: 0
      });
      belge.parcaIndexleri.push(index);
    }
    return belge;
  }
}

function dizile(deger) {
  if (!deger) return [];
  if (Array.isArray(deger)) return deger;
  return String(deger).split(',').map((p) => p.trim()).filter(Boolean);
}

function ilkBaslik(metin) {
  const eslesme = /^#{1,3}\s+(.+)$/m.exec(metin);
  return eslesme ? eslesme[1].trim() : '';
}

/**
 * Metni başlıklara göre bölümlere ayırır; uzun bölümleri paragraf
 * sınırlarından, aralarında bir miktar örtüşme bırakarak parçalar.
 * @returns {{baslik: string, metin: string}[]}
 */
export function bolumle(metin) {
  const satirlar = metin.split(/\r?\n/);
  const bolumler = [];
  let aktifBaslik = '';
  let tampon = [];

  const bosalt = () => {
    const govde = tampon.join('\n').trim();
    tampon = [];
    if (!govde) return;
    for (const parca of uzunMetniBol(govde)) {
      bolumler.push({ baslik: aktifBaslik, metin: parca });
    }
  };

  let kodBlogunda = false;
  for (const satir of satirlar) {
    if (/^\s*(```|~~~)/.test(satir)) {
      kodBlogunda = !kodBlogunda;
      tampon.push(satir);
      continue;
    }
    // Kod bloğu içindeki "# yorum" satırı başlık değildir
    const baslik = kodBlogunda ? null : /^(#{1,6})\s+(.*)$/.exec(satir);
    if (baslik) {
      bosalt();
      aktifBaslik = baslik[2].trim();
      tampon.push(satir);
      continue;
    }
    tampon.push(satir);
  }
  bosalt();

  if (!bolumler.length && metin.trim()) {
    return uzunMetniBol(metin.trim()).map((p) => ({ baslik: '', metin: p }));
  }
  return bolumler;
}

function uzunMetniBol(metin) {
  if (metin.length <= MAKS_PARCA) return [metin];
  const paragraflar = metin.split(/\n\s*\n/);
  const parcalar = [];
  let aktif = '';

  for (const paragraf of paragraflar) {
    if (paragraf.length > MAKS_PARCA) {
      if (aktif.trim()) { parcalar.push(aktif.trim()); aktif = ''; }
      // Tek başına çok uzun paragraf: cümle sınırlarından kes
      let kalan = paragraf;
      while (kalan.length > MAKS_PARCA) {
        let kesim = kalan.lastIndexOf('. ', MAKS_PARCA);
        if (kesim < MAKS_PARCA * 0.5) kesim = kalan.lastIndexOf(' ', MAKS_PARCA);
        if (kesim <= 0) kesim = MAKS_PARCA;
        parcalar.push(kalan.slice(0, kesim + 1).trim());
        kalan = kalan.slice(Math.max(0, kesim + 1 - ORTUSME));
      }
      if (kalan.trim()) aktif = kalan;
      continue;
    }
    if ((aktif + '\n\n' + paragraf).length > MAKS_PARCA) {
      parcalar.push(aktif.trim());
      const kuyruk = aktif.slice(-ORTUSME);
      aktif = (kuyruk ? kuyruk + '\n\n' : '') + paragraf;
    } else {
      aktif = aktif ? aktif + '\n\n' + paragraf : paragraf;
    }
  }
  if (aktif.trim()) parcalar.push(aktif.trim());
  return parcalar.filter(Boolean);
}

export { normalize };
