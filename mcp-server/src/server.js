/**
 * Apsis Kütüphane MCP sunucusu.
 * Araçlar Türkçe adlandırılmıştır; her yanıt kaynak künyesi taşır.
 */
import path from 'node:path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Kutuphane } from './indexer.js';
import { ara } from './search.js';
import { SoruGunlugu } from './log.js';
import { normalize } from './text.js';

const YONERGE = `Bu sunucu Apsis Danışmanlık'ın devlet destekleri bilgi kütüphanesidir
(e-ticaret destekleri, KOSGEB destekleri, sağlık turizmi destekleri, yatırım teşvik belgesi).

ZORUNLU ÇALIŞMA BİÇİMİ:
1. Devlet destekleri, mevzuat, oran, limit, süre, başvuru adımı, form veya departman
   süreçleriyle ilgili HER soruda önce "kutuphane_ara" aracını çağır. Kendi genel
   bilgine dayanarak cevap verme; mevzuat sık değişir ve ezber bilgi yanlış olur.
2. Cevabı yalnızca dönen alıntılara dayandır. Her iddianın sonuna kaynağı
   [belge_id › bölüm] biçiminde ekle.
3. Alıntı yetersizse "belge_oku" ile belgenin tamamını veya ilgili bölümü oku.
4. Kütüphanede cevap yoksa bunu açıkça söyle ("Kütüphanede bu konuda kayıt yok"),
   tahmin yürütme ve "eksik_bilgi_bildir" aracıyla boşluğu kaydet.
5. Belgede "yururluk" veya "guncelleme" tarihi eskiyse kullanıcıyı uyar.
6. Departmana özel iş akışı sorulduğunda "departman_yonergesi" aracını kullan.`;

/** Bu skorun altındaki en iyi eşleşme "muhtemelen alakasız" sayılır. */
const ZAYIF_ESLESME_ESIGI = 5;

/**
 * @param {{kutuphaneKok?: string, gunlukDosyasi?: string,
 *          kutuphane?: Kutuphane, gunluk?: SoruGunlugu}} secenekler
 * HTTP modunda her istek için yeni sunucu örneği kurulur; indeksin
 * baştan okunmaması için `kutuphane` ve `gunluk` dışarıdan paylaştırılır.
 */
export function sunucuOlustur(secenekler) {
  const kutuphane = secenekler.kutuphane ?? new Kutuphane(secenekler.kutuphaneKok);
  const gunluk = secenekler.gunluk ?? new SoruGunlugu(secenekler.gunlukDosyasi);

  const sunucu = new McpServer(
    { name: 'apsis-kutuphane', version: '0.1.0', title: 'Apsis Bilgi Kütüphanesi' },
    { instructions: YONERGE, capabilities: { logging: {} } }
  );

  const kullanici = () => process.env.APSIS_KULLANICI || process.env.USER || 'bilinmiyor';
  const istemci = () => {
    try {
      const bilgi = sunucu.server.getClientVersion();
      return bilgi ? `${bilgi.name} ${bilgi.version ?? ''}`.trim() : 'bilinmiyor';
    } catch {
      return 'bilinmiyor';
    }
  };

  const hazirla = async () => {
    if (!kutuphane.olusturmaZamani) await kutuphane.yenile();
    else await kutuphane.gerekirseYenile();
  };

  // ---------------------------------------------------------------- ara
  sunucu.registerTool(
    'kutuphane_ara',
    {
      title: 'Kütüphanede ara',
      description:
        'Apsis bilgi kütüphanesinde arama yapar ve kaynak künyeli alıntılar döner. ' +
        'Devlet destekleri, mevzuat, oran/limit, başvuru süreci veya departman ' +
        'yönergeleriyle ilgili her soruda ilk çağrılacak araç budur. ' +
        'Birebir geçmesi gereken ifadeleri "tırnak içinde" yazabilirsiniz.',
      inputSchema: {
        soru: z.string().min(2).describe('Kullanıcının sorusu veya anahtar kelimeler'),
        departman: z
          .string()
          .optional()
          .describe('Aramayı tek departmana daraltır: e-ticaret | kosgeb | saglik-turizmi | yatirim-tesvik | ortak'),
        etiket: z.string().optional().describe('Belge etiketine göre filtre'),
        limit: z.number().int().min(1).max(20).optional().describe('Dönecek alıntı sayısı (varsayılan 8)'),
        tam_metin: z
          .boolean()
          .optional()
          .describe('true ise alıntı yerine eşleşen bölümün tam metni döner')
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ soru, departman, etiket, limit, tam_metin }) => {
      await hazirla();
      const { sonuclar, toplamEslesme, enIyiSkor } = ara(kutuphane, {
        soru,
        departman: departman ?? '',
        etiket: etiket ?? '',
        limit: limit ?? 8
      });

      await gunluk.kaydet({
        arac: 'kutuphane_ara',
        kullanici: kullanici(),
        istemci: istemci(),
        soru,
        departman: departman ?? '',
        sonuc_sayisi: sonuclar.length,
        bulundu: sonuclar.length > 0,
        en_iyi_skor: sonuclar[0]?.skor ?? 0,
        kaynaklar: sonuclar.slice(0, 3).map((s) => s.parcaId)
      });

      if (!sonuclar.length) {
        return metin(
          `Kütüphanede "${soru}" sorgusuyla eşleşen kayıt bulunamadı` +
            (departman ? ` (departman: ${departman})` : '') +
            '.\n\nYapılacaklar:\n' +
            '1. Kullanıcıya kütüphanede bu konuda kayıt olmadığını açıkça söyle.\n' +
            '2. Kendi genel bilginle mevzuat cevabı UYDURMA.\n' +
            '3. "eksik_bilgi_bildir" aracıyla bu boşluğu kaydet.\n' +
            `4. Gerekirse "belge_listele" ile mevcut başlıklara bakıp daha genel bir terimle tekrar ara.`
        );
      }

      const satirlar = [
        `"${soru}" için ${sonuclar.length} alıntı (toplam ${toplamEslesme} eşleşen bölüm).`,
        'Cevabında her bilgi için kaynak künyesini [belge_id › bölüm] biçiminde ver.',
        ''
      ];

      // Zayıf eşleşme, "cevap var" izlenimi vermemeli.
      if ((enIyiSkor ?? 0) < ZAYIF_ESLESME_ESIGI) {
        satirlar.splice(
          1,
          0,
          '⚠️ UYARI: Eşleşmeler zayıf. Alıntılar soruyu doğrudan cevaplamıyorsa ' +
            'kütüphanede bu konuda kayıt olmadığını söyle, tahmin yürütme ve ' +
            '"eksik_bilgi_bildir" aracını çağır.'
        );
      }

      sonuclar.forEach((s, i) => {
        satirlar.push(`### ${i + 1}. ${s.baslik}`);
        satirlar.push(kunye(s));
        satirlar.push('');
        satirlar.push(tam_metin ? s.metin : s.alinti);
        satirlar.push('');
      });

      return metin(satirlar.join('\n'));
    }
  );

  // ----------------------------------------------------------- belge oku
  sunucu.registerTool(
    'belge_oku',
    {
      title: 'Belgeyi oku',
      description:
        'Kütüphanedeki bir belgenin tamamını veya belirli bölümünü okur. ' +
        'belge_id, kutuphane_ara sonuçlarındaki kimliktir (ör. "kosgeb/mevzuat/kobigel.md"). ' +
        'Alıntı yeterli gelmediğinde kullanın.',
      inputSchema: {
        belge_id: z.string().describe('Belge kimliği veya dosya adının bir parçası'),
        bolum: z
          .string()
          .optional()
          .describe('Yalnızca başlığı bu metni içeren bölümler döner (ör. "başvuru koşulları")'),
        karakter_limiti: z
          .number()
          .int()
          .min(500)
          .max(200000)
          .optional()
          .describe('Uzun belgelerde kesme sınırı (varsayılan 20000)')
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ belge_id, bolum, karakter_limiti }) => {
      await hazirla();
      const belge = belgeBul(kutuphane, belge_id);
      if (!belge) {
        const oneriler = [...kutuphane.belgeler.keys()].slice(0, 15);
        return metin(
          `"${belge_id}" bulunamadı.\n\nMevcut belgelerden bazıları:\n` +
            oneriler.map((i) => `- ${i}`).join('\n') +
            '\n\nTam liste için "belge_listele" aracını kullanın.'
        );
      }

      let govde = belge.metin;
      if (bolum) {
        const hedef = normalize(bolum);
        const secilen = belge.parcaIndexleri
          .map((i) => kutuphane.parcalar[i])
          .filter((p) => normalize(p.baslik).includes(hedef));
        if (!secilen.length) {
          const basliklar = belge.parcaIndexleri
            .map((i) => kutuphane.parcalar[i].bolumBasligi)
            .filter(Boolean);
          return metin(
            `"${bolum}" başlıklı bölüm ${belge.id} içinde yok.\n\nBelgedeki bölümler:\n` +
              (basliklar.length ? basliklar.map((b) => `- ${b}`).join('\n') : '(başlık yok, belgeyi bölümsüz okuyun)')
          );
        }
        govde = secilen.map((p) => p.metin).join('\n\n');
      }

      const limit = karakter_limiti ?? 20000;
      const kesildi = govde.length > limit;
      if (kesildi) govde = govde.slice(0, limit);

      return metin(
        [
          `# ${belge.baslik}`,
          kunye(belge),
          '',
          govde,
          kesildi
            ? `\n\n… [belge ${limit} karakterde kesildi; devamı için "bolum" parametresiyle daraltın]`
            : ''
        ].join('\n')
      );
    }
  );

  // -------------------------------------------------------- belge listele
  sunucu.registerTool(
    'belge_listele',
    {
      title: 'Belgeleri listele',
      description:
        'Kütüphanedeki belgelerin künyeli listesini verir. Departmana, etikete veya ' +
        'başlık içindeki kelimeye göre filtrelenebilir. Kütüphanede ne olduğunu görmek için kullanın.',
      inputSchema: {
        departman: z.string().optional().describe('Departman kodu'),
        etiket: z.string().optional().describe('Etiket'),
        arama: z.string().optional().describe('Başlık/dosya adında geçen kelime')
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ departman, etiket, arama }) => {
      await hazirla();
      let belgeler = [...kutuphane.belgeler.values()];
      if (departman) belgeler = belgeler.filter((b) => normalize(b.departman) === normalize(departman));
      if (etiket) belgeler = belgeler.filter((b) => b.etiketler.some((e) => normalize(e) === normalize(etiket)));
      if (arama) {
        const q = normalize(arama);
        belgeler = belgeler.filter((b) => normalize(`${b.baslik} ${b.id} ${b.ozet}`).includes(q));
      }
      if (!belgeler.length) return metin('Filtreye uyan belge yok.');

      const gruplar = new Map();
      for (const belge of belgeler) {
        if (!gruplar.has(belge.departman)) gruplar.set(belge.departman, []);
        gruplar.get(belge.departman).push(belge);
      }

      const satirlar = [`Kütüphanede ${belgeler.length} belge:`, ''];
      for (const [dep, liste] of [...gruplar].sort((a, b) => a[0].localeCompare(b[0], 'tr'))) {
        const tanim = kutuphane.departmanlar[dep];
        satirlar.push(`## ${tanim?.ad ?? dep} (${liste.length})`);
        for (const belge of liste.sort((a, b) => a.id.localeCompare(b.id, 'tr'))) {
          const ek = [
            belge.program && `program: ${belge.program}`,
            belge.yururluk && `yürürlük: ${belge.yururluk}`,
            belge.guncelleme && `güncelleme: ${belge.guncelleme}`,
            belge.etiketler.length && `etiket: ${belge.etiketler.join(', ')}`
          ].filter(Boolean).join(' | ');
          satirlar.push(`- \`${belge.id}\` — ${belge.baslik}${ek ? `  \n  ${ek}` : ''}`);
        }
        satirlar.push('');
      }
      return metin(satirlar.join('\n'));
    }
  );

  // -------------------------------------------------- departman yönergesi
  sunucu.registerTool(
    'departman_yonergesi',
    {
      title: 'Departman yönergesi',
      description:
        'Bir departmanın çalışma yönergesini (iş akışı, sorumluluklar, kontrol listeleri) döner. ' +
        'Süreç/prosedür soruları için kullanın.',
      inputSchema: {
        departman: z
          .string()
          .describe('e-ticaret | kosgeb | saglik-turizmi | yatirim-tesvik | ortak')
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ departman }) => {
      await hazirla();
      const hedef = normalize(departman);
      const yonergeler = [...kutuphane.belgeler.values()].filter(
        (b) =>
          normalize(b.departman) === hedef &&
          (b.dosyaAdi.startsWith('_yonerge') || b.etiketler.some((e) => normalize(e) === 'yonerge'))
      );

      if (!yonergeler.length) {
        const mevcut = Object.keys(kutuphane.departmanlar).join(', ') ||
          [...new Set([...kutuphane.belgeler.values()].map((b) => b.departman))].join(', ');
        return metin(
          `"${departman}" için yönerge belgesi bulunamadı.\n` +
            `Tanımlı departmanlar: ${mevcut}\n\n` +
            'Yönerge dosyası departman klasöründe "_yonerge.md" adıyla durmalıdır.'
        );
      }

      return metin(
        yonergeler
          .map((b) => [`# ${b.baslik}`, kunye(b), '', b.metin].join('\n'))
          .join('\n\n---\n\n')
      );
    }
  );

  // ------------------------------------------------------ eksik bilgi
  sunucu.registerTool(
    'eksik_bilgi_bildir',
    {
      title: 'Eksik bilgi bildir',
      description:
        'Kütüphanede cevabı bulunamayan soruyu kaydeder. Arama sonuç vermediğinde ' +
        'veya bulunan bilgi güncelliğini yitirmişse çağırın; kayıtlar kütüphane ' +
        'sorumlusunun eksik içerik listesini oluşturur.',
      inputSchema: {
        soru: z.string().describe('Cevaplanamayan soru'),
        departman: z.string().optional().describe('İlgili departman'),
        not: z.string().optional().describe('Eksikliğin niteliği (ör. "2026 oranları güncellenmemiş")')
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
    },
    async ({ soru, departman, not }) => {
      await gunluk.kaydet({
        arac: 'eksik_bilgi_bildir',
        kullanici: kullanici(),
        istemci: istemci(),
        soru,
        departman: departman ?? '',
        not: not ?? '',
        bulundu: false
      });
      return metin(
        'Eksik bilgi kaydedildi. Kullanıcıya bu konunun kütüphanede bulunmadığını ve ' +
          'kütüphane sorumlusuna iletildiğini bildir; mevzuat cevabı uydurma.'
      );
    }
  );

  // -------------------------------------------------------- durum / yenile
  sunucu.registerTool(
    'kutuphane_durumu',
    {
      title: 'Kütüphane durumu',
      description: 'İndeks istatistikleri, departman dağılımı, okunamayan dosyalar ve soru günlüğü özeti.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => {
      await hazirla();
      const ist = kutuphane.istatistik();
      const ozet = await gunluk.ozet();
      return metin(
        [
          '# Kütüphane durumu',
          `Kök dizin: ${ist.kok}`,
          `Belge: ${ist.belgeSayisi} | Bölüm: ${ist.parcaSayisi} | Terim: ${ist.terimSayisi} | Boyut: ${ist.toplamBoyutKb} KB`,
          `Son indeksleme: ${ist.olusturmaZamani}`,
          '',
          '## Departman dağılımı',
          ...Object.entries(ist.departmanDagilimi).map(([d, s]) => `- ${d}: ${s} belge`),
          '',
          '## Soru günlüğü',
          `Toplam kayıt: ${ozet.toplamKayit} | Son 30 gün: ${ozet.sonGunKayit} | Cevapsız: ${ozet.cevapsizSayisi}`,
          ...(ozet.cevapsizOrnekler.length
            ? ['', 'Son cevapsız sorular:', ...ozet.cevapsizOrnekler.slice(-8).map((k) => `- ${k.soru} (${k.departman || '—'})`)]
            : []),
          ...(ist.uyarilar.length ? ['', '## Uyarılar', ...ist.uyarilar.map((u) => `- ${u}`)] : [])
        ].join('\n')
      );
    }
  );

  sunucu.registerTool(
    'kutuphane_yenile',
    {
      title: 'Kütüphaneyi yeniden indeksle',
      description: 'Kütüphaneye yeni belge eklendiyse indeksi zorla yeniler.',
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async () => {
      const ist = await kutuphane.yenile();
      return metin(
        `İndeks yenilendi: ${ist.belgeSayisi} belge, ${ist.parcaSayisi} bölüm.` +
          (ist.uyarilar.length ? `\nUyarılar:\n${ist.uyarilar.map((u) => `- ${u}`).join('\n')}` : '')
      );
    }
  );

  // ------------------------------------------------------------ kaynaklar
  sunucu.registerResource(
    'kutuphane-indeksi',
    'apsis://indeks',
    {
      title: 'Kütüphane indeksi',
      description: 'Tüm belgelerin künyeli listesi',
      mimeType: 'application/json'
    },
    async (uri) => {
      await hazirla();
      const belgeler = [...kutuphane.belgeler.values()].map((b) => ({
        id: b.id,
        baslik: b.baslik,
        departman: b.departman,
        program: b.program,
        etiketler: b.etiketler,
        yururluk: b.yururluk,
        guncelleme: b.guncelleme,
        kaynak: b.kaynak
      }));
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ istatistik: kutuphane.istatistik(), belgeler }, null, 2)
          }
        ]
      };
    }
  );

  // --------------------------------------------------------------- istem
  sunucu.registerPrompt(
    'destek-sorusu',
    {
      title: 'Destek sorusu (kaynaklı cevap)',
      description: 'Kütüphaneye dayalı, kaynak künyeli cevap üretmek için hazır istem',
      argsSchema: {
        soru: z.string().describe('Müşteri/danışman sorusu'),
        departman: z.string().optional().describe('İlgili departman')
      }
    },
    ({ soru, departman }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Soru: ${soru}\n` +
              (departman ? `Departman: ${departman}\n` : '') +
              '\nÇalışma biçimi:\n' +
              '1. "kutuphane_ara" ile kütüphaneyi tara (gerekirse farklı terimlerle birkaç kez).\n' +
              '2. Cevabı yalnızca dönen alıntılara dayandır.\n' +
              '3. Her bilginin sonunda kaynağı [belge_id › bölüm] biçiminde belirt.\n' +
              '4. Kütüphanede bilgi yoksa "kütüphanede kayıt yok" de, tahmin yürütme ve ' +
              '"eksik_bilgi_bildir" aracını çağır.\n' +
              '5. Yürürlük/güncelleme tarihi eskiyse uyarı ekle.'
          }
        }
      ]
    })
  );

  return { sunucu, kutuphane, gunluk };
}

function metin(icerik) {
  return { content: [{ type: 'text', text: icerik }] };
}

function kunye(kayit) {
  const parcalar = [
    `kaynak: \`${kayit.belgeId ?? kayit.id}\``,
    kayit.bolum && `bölüm: ${kayit.bolum}`,
    kayit.departman && `departman: ${kayit.departman}`,
    kayit.program && `program: ${kayit.program}`,
    kayit.yururluk && `yürürlük: ${kayit.yururluk}`,
    kayit.guncelleme && `güncelleme: ${kayit.guncelleme}`,
    kayit.kaynak && `dayanak: ${kayit.kaynak}`,
    typeof kayit.skor === 'number' && `skor: ${kayit.skor}`
  ].filter(Boolean);
  return `> ${parcalar.join(' · ')}`;
}

function belgeBul(kutuphane, kimlik) {
  if (kutuphane.belgeler.has(kimlik)) return kutuphane.belgeler.get(kimlik);
  const temiz = kimlik.split('#')[0];
  if (kutuphane.belgeler.has(temiz)) return kutuphane.belgeler.get(temiz);

  const hedef = normalize(temiz);
  const adaylar = [...kutuphane.belgeler.values()].filter(
    (b) => normalize(b.id).includes(hedef) || normalize(b.baslik).includes(hedef)
  );
  if (adaylar.length === 1) return adaylar[0];
  if (adaylar.length > 1) {
    // En kısa yol = en spesifik eşleşme
    return adaylar.sort((a, b) => a.id.length - b.id.length)[0];
  }
  return null;
}

export { path };
