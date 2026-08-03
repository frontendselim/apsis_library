/**
 * Türkçe metin normalizasyonu ve tokenizasyon.
 * Amaç: "desteği" / "destegi" / "DESTEĞİ" aynı terime indirgensin.
 */

const HARF_ESLESME = {
  ı: 'i', İ: 'i', i: 'i',
  ş: 's', Ş: 's',
  ğ: 'g', Ğ: 'g',
  ü: 'u', Ü: 'u',
  ö: 'o', Ö: 'o',
  ç: 'c', Ç: 'c',
  â: 'a', Â: 'a',
  î: 'i', Î: 'i',
  û: 'u', Û: 'u'
};

/** Küçük harfe indirger ve Türkçe karakterleri ASCII karşılığına katlar. */
export function normalize(metin) {
  if (!metin) return '';
  return metin
    .toLocaleLowerCase('tr')
    .replace(/[ıİşŞğĞüÜöÖçÇâÂîÎûÛ]/g, (h) => HARF_ESLESME[h] ?? h);
}

/** Arama sırasında bilgi taşımayan, çok sık geçen kelimeler. */
export const DURAK_KELIMELER = new Set([
  've', 'veya', 'ile', 'icin', 'bir', 'bu', 'su', 'da', 'de', 'ya', 'ki',
  'mi', 'mu', 'olan', 'olarak', 'ise', 'ama', 'ancak', 'gibi', 'daha',
  'her', 'hangi', 'kadar', 'sonra', 'once', 'en', 'cok', 'az', 'the',
  'and', 'for', 'nedir', 'nasil', 'midir', 'var', 'yok', 'ne'
]);

/** Metni normalize edilmiş, duraksız token dizisine çevirir. */
export function tokenize(metin) {
  return normalize(metin)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !DURAK_KELIMELER.has(t));
}

/**
 * Bir eşleşmenin çevresinden okunabilir bir alıntı çıkarır ve
 * eşleşen terimleri **kalın** yapar.
 */
export function alinti(metin, sorguTokenlari, uzunluk = 420) {
  const norm = normalize(metin);
  let enIyiIndex = -1;
  for (const t of sorguTokenlari) {
    const i = norm.indexOf(t);
    if (i !== -1 && (enIyiIndex === -1 || i < enIyiIndex)) enIyiIndex = i;
  }
  if (enIyiIndex === -1) enIyiIndex = 0;

  let bas = Math.max(0, enIyiIndex - Math.floor(uzunluk / 3));
  let son = Math.min(metin.length, bas + uzunluk);
  // Kelime ortasından kesmemek için sınırları boşluğa hizala
  if (bas > 0) {
    const bosluk = metin.indexOf(' ', bas);
    if (bosluk !== -1 && bosluk - bas < 30) bas = bosluk + 1;
  }
  if (son < metin.length) {
    const bosluk = metin.lastIndexOf(' ', son);
    if (bosluk > bas) son = bosluk;
  }

  let parca = metin.slice(bas, son).trim();
  if (bas > 0) parca = '… ' + parca;
  if (son < metin.length) parca = parca + ' …';

  return vurgula(parca, sorguTokenlari);
}

/**
 * Sorgu terimleriyle eşleşen kelimeleri **kalın** yapar.
 * Karşılaştırma normalize edilmiş biçim üzerinden yapılır ki
 * "destek" sorgusu "Desteği" kelimesini de vurgulayabilsin.
 */
export function vurgula(metin, sorguTokenlari) {
  const terimler = [...new Set(sorguTokenlari)].filter((t) => t.length >= 3);
  if (!terimler.length) return metin;

  return metin.replace(/[\p{L}\p{N}]+/gu, (kelime) => {
    const n = normalize(kelime);
    const eslesti = terimler.some(
      (t) => n.startsWith(t) || (t.length >= 5 && t.startsWith(n) && n.length >= 4)
    );
    return eslesti ? `**${kelime}**` : kelime;
  });
}
