/**
 * Dosya biçimlerinden düz metin çıkarma.
 * Desteklenen: .md .txt .csv .json .yaml/.yml .docx (mammoth) .pdf (pdfjs-dist, opsiyonel)
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const DUZ_METIN_UZANTILARI = new Set([
  '.md', '.markdown', '.txt', '.csv', '.tsv', '.json', '.yaml', '.yml'
]);

export const DESTEKLENEN_UZANTILAR = new Set([
  ...DUZ_METIN_UZANTILARI, '.docx', '.pdf'
]);

/**
 * @returns {Promise<{metin: string, uyari?: string}>}
 */
export async function metinCikar(dosyaYolu) {
  const uzanti = path.extname(dosyaYolu).toLowerCase();

  if (DUZ_METIN_UZANTILARI.has(uzanti)) {
    return { metin: await readFile(dosyaYolu, 'utf8') };
  }

  if (uzanti === '.docx') {
    try {
      const mammoth = (await import('mammoth')).default;
      // Markdown'a çeviriyoruz ki başlıklar ve tablolar korunsun;
      // başlıklar bölümleme (chunk) kalitesini doğrudan belirliyor.
      const sonuc = await mammoth.convertToMarkdown({ path: dosyaYolu });
      const metin = (sonuc.value ?? '').trim();
      if (metin) return { metin };
      const ham = await mammoth.extractRawText({ path: dosyaYolu });
      return { metin: ham.value ?? '' };
    } catch (hata) {
      return { metin: '', uyari: `.docx okunamadı: ${hata.message}` };
    }
  }

  if (uzanti === '.pdf') {
    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const veri = new Uint8Array(await readFile(dosyaYolu));
      const belge = await pdfjs.getDocument({ data: veri, useSystemFonts: true }).promise;
      const sayfalar = [];
      for (let s = 1; s <= belge.numPages; s++) {
        const sayfa = await belge.getPage(s);
        const icerik = await sayfa.getTextContent();
        sayfalar.push(`\n\n## [Sayfa ${s}]\n` + icerik.items.map((i) => i.str).join(' '));
      }
      await belge.destroy();
      return { metin: sayfalar.join('') };
    } catch (hata) {
      return {
        metin: '',
        uyari:
          'PDF okunamadı. PDF desteği için: npm install pdfjs-dist  ' +
          `(ayrıntı: ${hata.message})`
      };
    }
  }

  return { metin: '', uyari: `Desteklenmeyen dosya türü: ${uzanti}` };
}

/**
 * Markdown başındaki `---` YAML bloğunu ayrıştırır (basit skaler + liste desteği).
 * @returns {{meta: Record<string, any>, govde: string}}
 */
export function onBilgiAyristir(metin) {
  const eslesme = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(metin);
  if (!eslesme) return { meta: {}, govde: metin };

  const meta = {};
  let sonAnahtar = null;
  for (const satir of eslesme[1].split(/\r?\n/)) {
    if (!satir.trim() || satir.trim().startsWith('#')) continue;

    const liste = /^\s*-\s+(.*)$/.exec(satir);
    if (liste && sonAnahtar) {
      if (!Array.isArray(meta[sonAnahtar])) meta[sonAnahtar] = [];
      meta[sonAnahtar].push(temizle(liste[1]));
      continue;
    }

    const kv = /^([A-Za-z0-9_çğıöşüÇĞİÖŞÜ.-]+)\s*:\s*(.*)$/.exec(satir);
    if (kv) {
      const anahtar = kv[1].trim();
      const ham = kv[2].trim();
      sonAnahtar = anahtar;
      if (ham === '') {
        meta[anahtar] = [];
      } else if (ham.startsWith('[') && ham.endsWith(']')) {
        meta[anahtar] = ham
          .slice(1, -1)
          .split(',')
          .map((p) => temizle(p))
          .filter(Boolean);
      } else {
        meta[anahtar] = temizle(ham);
      }
    }
  }
  return { meta, govde: metin.slice(eslesme[0].length) };
}

function temizle(deger) {
  return deger.trim().replace(/^["']|["']$/g, '').trim();
}
