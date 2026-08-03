---
baslik: KOSGEB Destekleri Departmanı Çalışma Yönergesi
departman: kosgeb
etiketler: [yonerge, surec]
sorumlu: "[departman sorumlusu]"
guncelleme: 2026-08-03
gizlilik: kurum-ici
ozet: KOSGEB departmanının müşteri kabulünden ödeme talebine kadar izlediği iş akışı ve kontrol listeleri.
---

# KOSGEB Destekleri Departmanı Çalışma Yönergesi

> Bu dosya şablondur. Departman sorumlusu köşeli parantezli alanları gerçek
> süreçle doldurmalıdır. Yapay zekâ araçları süreç sorularında bu belgeyi kaynak alır;
> doldurulmamış alanlar "bilinmiyor" olarak cevaplanır.

## 1. Kapsam

Bu departman şu programlardan sorumludur:

- Girişimci Destek Programı (Geleneksel / İleri Girişimci)
- KOBİGEL KOBİ Gelişim Destek Programı
- İşletme Geliştirme Destek Programı
- Kapasite Geliştirme Destek Programı
- [diğer programlar]

## 2. Roller

| Rol | Kişi | Sorumluluk |
| --- | --- | --- |
| Departman sorumlusu | [ad] | Nihai onay, kurum yazışmaları |
| Uzman | [ad] | Dosya hazırlama, müşteri görüşmesi |
| Asistan | [ad] | Evrak toplama, takip |

## 3. Müşteri kabul süreci

1. Ön görüşme: işletmenin KOSGEB veri tabanı kaydı ve KOBİ beyannamesi durumu kontrol edilir.
2. Uygunluk kontrolü: [hangi kriterler]
3. Teklif ve sözleşme: [şablon dosya adı]
4. Dosya açılışı: [hangi sistemde, hangi isimlendirme ile]

## 4. Başvuru hazırlama

1. [Adım — hangi form, hangi sistem]
2. [Adım]
3. Departman sorumlusu kontrol listesini onaylamadan başvuru gönderilmez.

### Başvuru öncesi kontrol listesi

- [ ] KOBİ beyannamesi güncel mi?
- [ ] Vergi/SGK borcu durumu teyit edildi mi?
- [ ] [diğer kontroller]

## 5. Ödeme talebi ve izleme

1. [Adım]
2. [Adım]

## 6. Sık yapılan hatalar

- [Hata → sonucu → nasıl önlenir]

## 7. Bu departmanda yapay zekâ kullanımı

- Mevzuat, oran, limit ve süre içeren her soruda önce `kutuphane_ara` çağrılır.
- Kütüphanede kaydı olmayan konuda cevap üretilmez; `eksik_bilgi_bildir` ile kayda geçirilir.
- Müşteriye gidecek metinlerde kaynak künyesi ([belge_id › bölüm]) departman sorumlusunca doğrulanır.
- Müşteri kişisel/ticari verisi yapay zekâ araçlarına girilmeden önce [kural].
