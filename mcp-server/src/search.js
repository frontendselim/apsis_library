/**
 * BM25 tabanlı arama.
 * Türkçe ekler nedeniyle sorgu terimleri sözlükte ön-ek eşleşmesiyle genişletilir:
 * "destek" → "destegi", "destekleri", "desteklenen" …
 */
import { tokenize, normalize, alinti } from './text.js';

const K1 = 1.4;
const B = 0.72;
const MIN_ONEK = 4;      // ön-ek eşleşmesi için en az harf sayısı
const MAKS_GENISLEME = 40;

/**
 * @param {import('./indexer.js').Kutuphane} kutuphane
 * @param {{soru: string, departman?: string, etiket?: string, program?: string,
 *          limit?: number, belgeBasinaMaks?: number}} secenekler
 */
export function ara(kutuphane, secenekler) {
  const {
    soru,
    departman = '',
    etiket = '',
    program = '',
    limit = 8,
    belgeBasinaMaks = 2
  } = secenekler;

  const sorguTokenlari = tokenize(soru);
  const zorunluIfadeler = [...soru.matchAll(/"([^"]{2,})"/g)].map((m) => normalize(m[1]));
  if (!sorguTokenlari.length) return { sonuclar: [], sorguTokenlari, toplamEslesme: 0 };

  const N = kutuphane.parcalar.length;
  if (!N) return { sonuclar: [], sorguTokenlari, toplamEslesme: 0 };

  const uygunMu = (parca) => {
    const belge = kutuphane.belgeler.get(parca.belgeId);
    if (!belge) return false;
    if (departman && normalize(belge.departman) !== normalize(departman)) return false;
    if (etiket && !belge.etiketler.some((e) => normalize(e) === normalize(etiket))) return false;
    if (program && !normalize(belge.program).includes(normalize(program))) return false;
    return true;
  };

  const skorlar = new Map(); // parcaIndex -> skor

  for (const qTerim of new Set(sorguTokenlari)) {
    const genislemeler = genislet(kutuphane.sozluk, qTerim);
    const enIyi = new Map(); // parcaIndex -> bu sorgu terimi için en iyi katkı

    for (const { terim, kalite } of genislemeler) {
      const gonderme = kutuphane.sozluk.get(terim);
      if (!gonderme) continue;
      const df = gonderme.size;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));

      for (const [parcaIndex, tf] of gonderme) {
        const parca = kutuphane.parcalar[parcaIndex];
        if (!uygunMu(parca)) continue;
        const uzunluk = parca.tokenSayisi || 1;
        const doygunluk = (tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * uzunluk) / kutuphane.ortalamaUzunluk));
        let katki = kalite * idf * doygunluk;
        // Bölüm başlığında geçen terim, gövdede geçenden daha güçlü sinyaldir
        if (normalize(parca.baslik).includes(qTerim)) katki *= 1.35;
        const mevcut = enIyi.get(parcaIndex) ?? 0;
        if (katki > mevcut) enIyi.set(parcaIndex, katki);
      }
    }

    for (const [parcaIndex, katki] of enIyi) {
      skorlar.set(parcaIndex, (skorlar.get(parcaIndex) ?? 0) + katki);
    }
  }

  if (!skorlar.size) return { sonuclar: [], sorguTokenlari, toplamEslesme: 0 };

  const normSoru = normalize(soru.replace(/"/g, '').trim());
  const benzersizTerimler = [...new Set(sorguTokenlari)];
  // Çok terimli sorgularda tek bir terimin geçmesi alaka için yeterli değildir;
  // aksi halde ilgisiz belgeler "kaynak" gibi sunulur.
  const minKapsanan = benzersizTerimler.length >= 3 ? Math.ceil(benzersizTerimler.length * 0.34) : 1;
  const adaylar = [];
  for (const [parcaIndex, hamSkor] of skorlar) {
    const parca = kutuphane.parcalar[parcaIndex];
    const normMetin = normalize(`${parca.baslik}\n${parca.metin}`);

    // Tırnak içindeki ifadeler zorunludur
    if (zorunluIfadeler.length && !zorunluIfadeler.every((i) => normMetin.includes(i))) continue;

    let skor = hamSkor;
    // Sorgunun tamamı birebir geçiyorsa güçlü bonus
    if (sorguTokenlari.length > 1 && normMetin.includes(normSoru)) skor += 2.5;
    // Sorgu terimlerinin kaçı bu parçada var? Kapsama oranı önemlidir.
    const kapsanan = benzersizTerimler.filter((t) =>
      normMetin.includes(t.slice(0, Math.max(MIN_ONEK, t.length - 2)))
    ).length;
    if (kapsanan < minKapsanan) continue;
    const kapsamaOrani = kapsanan / benzersizTerimler.length;
    skor *= 0.6 + 0.4 * kapsamaOrani;

    adaylar.push({ parcaIndex, skor, kapsamaOrani });
  }

  adaylar.sort((a, b) => b.skor - a.skor);

  // En iyi sonucun çok gerisinde kalan eşleşmeler gürültüdür, elenir.
  const enIyiSkor = adaylar.length ? adaylar[0].skor : 0;
  const skorEsigi = enIyiSkor * 0.22;

  const belgeSayaci = new Map();
  const sonuclar = [];
  for (const aday of adaylar) {
    if (aday.skor < skorEsigi) break;
    const parca = kutuphane.parcalar[aday.parcaIndex];
    const kullanilan = belgeSayaci.get(parca.belgeId) ?? 0;
    if (kullanilan >= belgeBasinaMaks) continue;
    belgeSayaci.set(parca.belgeId, kullanilan + 1);

    const belge = kutuphane.belgeler.get(parca.belgeId);
    sonuclar.push({
      parcaId: parca.id,
      belgeId: belge.id,
      baslik: belge.baslik,
      bolum: parca.bolumBasligi || '(giriş)',
      departman: belge.departman,
      program: belge.program,
      kaynak: belge.kaynak,
      yururluk: belge.yururluk,
      guncelleme: belge.guncelleme,
      etiketler: belge.etiketler,
      skor: Number(aday.skor.toFixed(3)),
      kapsama: Number(aday.kapsamaOrani.toFixed(2)),
      alinti: alinti(parca.metin, sorguTokenlari),
      metin: parca.metin
    });
    if (sonuclar.length >= limit) break;
  }

  return { sonuclar, sorguTokenlari, toplamEslesme: adaylar.length, enIyiSkor };
}

/** Sorgu terimini sözlükteki akraba biçimlerle genişletir. */
function genislet(sozluk, qTerim) {
  const genislemeler = [];
  if (sozluk.has(qTerim)) genislemeler.push({ terim: qTerim, kalite: 1 });

  if (qTerim.length >= MIN_ONEK) {
    for (const terim of sozluk.keys()) {
      if (terim === qTerim) continue;
      if (terim.startsWith(qTerim)) {
        // "destek" → "destekleri": uzadıkça anlam kayma riski artar
        genislemeler.push({ terim, kalite: 0.85 * (qTerim.length / terim.length) ** 0.35 });
      } else if (terim.length >= MIN_ONEK && qTerim.startsWith(terim)) {
        // "desteklerin" sorgusu → "destek" belgesi
        genislemeler.push({ terim, kalite: 0.8 * (terim.length / qTerim.length) ** 0.35 });
      }
    }
  }

  genislemeler.sort((a, b) => b.kalite - a.kalite);
  return genislemeler.slice(0, MAKS_GENISLEME);
}
