---
baslik: Kütüphaneye Belge Ekleme ve Güncelleme Kılavuzu
departman: ortak
etiketler: [yonerge, kutuphane, surec]
sorumlu: "[kütüphane sorumlusu]"
guncelleme: 2026-08-03
gizlilik: kurum-ici
ozet: Kütüphaneye hangi belgenin nasıl ekleneceği, künye alanlarının anlamı ve güncelleme döngüsü.
---

# Kütüphaneye Belge Ekleme ve Güncelleme Kılavuzu

## 1. Klasör düzeni

```
kutuphane/
├── _departmanlar.json        departman tanımları
├── _sablonlar/               boş belge şablonları
├── e-ticaret/
│   ├── _yonerge.md           departman çalışma yönergesi
│   ├── mevzuat/              tebliğ, genelge, uygulama esasları özetleri
│   ├── surecler/             adım adım iş akışları
│   ├── sss/                  sık sorulan sorular ve cevapları
│   └── ornekler/             örnek başvuru, form, dilekçe
├── kosgeb/                   (aynı yapı)
├── saglik-turizmi/           (aynı yapı)
├── yatirim-tesvik/           (aynı yapı)
└── ortak/                    tüm departmanları ilgilendiren belgeler
```

Bir belgenin departmanı, bulunduğu üst klasörden okunur. Farklı bir departmana
ait olmasını istiyorsanız künyedeki `departman` alanını yazın.

## 2. Belge künyesi (frontmatter)

Her `.md` belgesi `---` satırları arasındaki künyeyle başlar. Künye alanları
arama sonuçlarında ve yapay zekâ cevaplarında kaynak bilgisi olarak görünür.

| Alan | Zorunlu | Açıklama |
| --- | --- | --- |
| `baslik` | evet | Belgenin tam adı |
| `departman` | hayır | Klasörden okunur, gerekirse elle yazılır |
| `program` | hayır | Destek programının adı |
| `etiketler` | hayır | Arama filtresi (`[basvuru, oran, sss]`) |
| `kaynak` | evet | Resmî dayanak: mevzuat adı, çağrı no, bağlantı |
| `yururluk` | evet | Bilginin yürürlük tarihi (YYYY-AA-GG) |
| `guncelleme` | evet | Belgenin son güncellenme tarihi |
| `sorumlu` | evet | Belgeyi güncelleyen kişi |
| `gizlilik` | evet | `kurum-ici` veya `mustereye-acik` |
| `ozet` | hayır | Tek cümlelik özet |

## 3. Yazım kuralları

1. **Her sayısal bilginin dayanağı olsun.** Oran, üst limit, süre yazarken
   `kaynak` alanına o bilginin geçtiği mevzuat maddesini/çağrı metnini yazın.
2. **Başlık kullanın.** Arama motoru belgeyi `##` başlıklarına göre bölümler;
   başlıksız uzun metinlerde alıntı kalitesi düşer.
3. **Tek konu, tek belge.** "KOBİGEL 2026/01 başvuru koşulları" ayrı,
   "KOBİGEL ödeme talebi" ayrı belge olsun.
4. **Eski bilgiyi silmeyin, işaretleyin.** Yürürlükten kalkan kuralı
   `> YÜRÜRLÜKTEN KALKTI (tarih) — yerine geçen: [belge]` satırıyla bırakın.
5. **Kişisel veri koymayın.** Müşteri adı, TCKN, iletişim bilgisi kütüphaneye girmez.
6. PDF ve Word dosyaları da indekslenir; ancak Markdown'a çevrilen belgelerde
   arama isabeti belirgin biçimde daha yüksektir.

## 4. Güncelleme döngüsü

| Ne zaman | Kim | Ne yapar |
| --- | --- | --- |
| Yeni tebliğ/çağrı yayımlandığında | Departman sorumlusu | 3 iş günü içinde ilgili belgeyi günceller |
| Her ayın ilk haftası | Kütüphane sorumlusu | `npm run rapor` ile cevapsız soruları listeler, eksik belgeleri açar |
| Her çeyrek | Departman sorumluları | `yururluk` tarihi geçmiş belgeleri gözden geçirir |

## 5. Değişikliği yayına almak

```bash
git pull
# belgeyi ekleyin/düzenleyin
git add kutuphane/
git commit -m "kosgeb: KOBİGEL 2026/01 başvuru koşulları eklendi"
git push
```

Değişiklik `git push` sonrası merkezî sunucuda otomatik indekslenir; yerel
kurulumlarda `git pull` yapan herkes güncel bilgiyi görür.
