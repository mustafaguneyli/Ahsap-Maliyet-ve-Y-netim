# Sipariş formu — Excel incelemesi

Bu belge keşif çıktısıdır. Özgün çalışma kitabı kaydedilmedi. Üretim kodu, Prisma şeması ve veritabanı bu incelemede değiştirilmedi.

## Dosya kimliği

| Alan | Değer |
| --- | --- |
| İncelenen konum | `C:\Users\musta\Downloads\` altında, adında `06,01,2026.xlsx` geçen ve boyutu 20.769 bayt olan kopya |
| `/mnt/data/` | Bu makinede yok. Eşleşme boyut ve SHA-256 ile yapıldı |
| Boyut | 20.769 bayt |
| SHA-256 | `9825DF90C07AD5406494DA85E0AA52247D827F4A00407AF6D7CB51A207C8571E` |
| Son yazılma | 2026-09-27 01:02:25 +03 |
| `docProps/core.xml` | Oluşturan / son değiştiren: Monster. Oluşturulma: 2015-06-05. Değiştirilme ve son yazdırılma: 2026-01-06 |
| VBA | Yok |
| Geçici kopya | Çalışma alanı dışında, `form.xlsx`. Yeniden hesap ve PDF yalnız ayrı `probe.xlsx` ve dışa aktarımda. Özgün dosya kaydedilmedi |

Müşteri ticari unvanı bu raporda **Müşteri A** olarak yazıldı. Sayılar özgün dosyadaki değerlerdir.

## 1. Sayfa envanteri

İki sayfa var. İkisi de görünür (`Visible = -1`). Hesaplama kipi otomatik (`-4105`). Koşullu biçim, veri doğrulama ve gizli satır/sütun yok. Adlandırılmış aralık olarak yalnız yazdırma alanı var: `Sayfa2!Print_Area` = `$A$2:$H$57`.

### Sayfa1

| Özellik | Bulgu |
| --- | --- |
| Kullanılan aralık | A1 |
| İçerik | 0 dolu hücre |
| Birleştirme, resim, formül | Yok |
| Kâğıt | `paperSize` 1 (Letter), yakınlaştırma 100, sığdırma 1×1 varsayılanı |
| Sayfa sayısı | 0 (boş sayfa) |

Sayfa1 şablonda duruyor; sipariş verisi taşımıyor.

### Sayfa2

| Özellik | Bulgu |
| --- | --- |
| Kullanılan aralık | A1:L57 |
| İçerikli hücre | 498 (biçim ve formül dahil envanter) |
| Birleştirme | 52 |
| Satır/sütun gizleme | Yok |
| Veri doğrulama | Yok (`Validation.Type = 0`) |
| Koşullu biçim | Yok |
| Elle sayfa sonu | Yok |
| Üstbilgi / altbilgi | Metin yok |
| Yinelenen yazdırma satırı | Yok |
| Izgara / başlık yazdırma | Kapalı |
| Yazdırma alanı | `$A$2:$H$57` |
| Yön | Dikey |
| Kâğıt (çalışma kitabında) | `pageSetup paperSize="9"` (A4) |
| Ölçek | `sheetPr/pageSetUpPr fitToPage="1"`. COM: `Zoom=false`, `FitToPagesWide=1`, `FitToPagesTall=1`. XML’de ayrıca `scale="78"` duruyor; sığdırma bayrağı açıkken etkin davranış 1×1 sayfaya sığdırmadır |
| Kenar boşluğu | Sol/sağ 0,70 inç, üst/alt 0,75 inç, üstbilgi/altbilgi 0,30 inç |
| Sayfa sayısı | COM `pageCount = 1`. PDF metin dökümü de tek sayfa |

Bu makinede Excel’in `ExportAsFixedFormat` çıktısı 612×792 punto (Letter) geldi. Çalışma kitabının kayıtlı kâğıdı A4’tür. Letter sonucu yerel yazıcı sürücüsünden gelmiş olabilir; yerleşim sonucunu (tek sayfa, iki form) değiştirmez. Özgün dosyaya yazılmadı.

### Sütun genişlikleri (Sayfa2)

Özel genişlikler sayfa XML’inden:

| Sütun | Genişlik |
| --- | --- |
| A | 6,42578125 |
| B | özel değil (Excel varsayılanı, yaklaşık 8,43) |
| C | 35,28515625 |
| D | 9,28515625 |
| E, F | 10,5703125 |
| G | 15,85546875 |
| H | 15 |
| I–L | özel değil |

L, yazdırma alanının dışında kalan hesap sütunudur. Gizli sütun değildir.

### Satır yükseklikleri

Varsayılan satır yüksekliği 15. Özel olanlar:

| Satır | Yükseklik |
| --- | --- |
| 2 | 35,1 |
| 3 | 24,95 |
| 31 | 19,5 |
| 32 | 18,75 |

Birçok satırda `ht=15,75` ve kalın alt kenarlık (`thickBot`) var. Satır 1 boş ve 15,75. Satır 29 sayfada yok. Satır 30 boş ayırıcı. Üst form (satır 2–28) ile alt form (satır 31–57) aynı yüksekliklere sahip değil.

## 2. Gömülü nesneler

Aynı `image1.jpeg` dört kez yerleştirilmiş. Şekil türü 13. COM `Pictures` koleksiyonu boş bir sayaç döndürdü; güvenilen kaynak şekiller ve `drawing1.xml`.

| Konum | Aralık |
| --- | --- |
| Üst form, sol | A2:C6 |
| Üst form, sağ | G2:H6 |
| Alt form, sol | A31:C36 |
| Alt form, sağ | G31:H36 |

Görsel, Zirve Ahşap “Z” logosudur. PDF’de logo bir kez gömülü, dört konumda çiziliyor. Logo dosyası repoya kopyalanmadı.

## 3. Baskı görünümü

Sayfa2 yazdırma alanı PDF’e aktarıldı ve metin koordinatlarıyla okundu. Yerleşim hücre değerlerinden tahmin edilmedi.

Tek sayfada, üst üste **iki aynı form** basılıyor. İkisi de `Print_Area` içinde. Aralarında boş satır 30 var. Her form:

- Üstte başlık şeridi, solda ve sağda logo, ortada unvan / adres / telefon
- Müşteri satırları: FİRMA, ADRES, V.D. + TEL., VERGİ NO
- 11 satırlık ürün tablosu
- Sağ altta, tablonun tüm genişliğini kaplamayan toplam bloğu: GENEL TOPLAM, İSKONTO, ARA TOPLAM, KDV %20, YENİ TOPLAM

İmza, kaşe, ödeme koşulu, teslim koşulu, proje veya not kutusu yok.

PDF metninde KDV %20 satırının yanında tutar yok. COM’da H27 ve H56 metni boş. Komşu formül hücreleri `₺0,00` basıyor. Boş para hücresi `₺0,00` olarak basılmıyor.

Satır 1 birim fiyatı kayıtlı `0` olduğu için `₺0,00` basılıyor. Satır 2 birim fiyatı boş olduğu için PDF’de birim fiyat metni yok; tutar formülü `₺0,00` basıyor.

## 4. Hücre haritası

Başlıklar Excel’deki metindir. Veri türü ve biçim Sayfa2 XML / COM kaydındandır. Müşteri unvanı anonimleştirildi.

Yazı tipi Calibri. Başlık 14 punto kalın, gövde 11 punto. Metin rengi siyah. Metin hücrelerinde dolgu yok. Kenarlıklar stil XML’inde; tablo ve toplamlar çerçeveli. Hizalama sabitleri: `-4108` orta, `-4107` alt, `-4131` sol, `1` genel.

### Üst firma ve form başlığı (iki kopyada tekrar)

| Adres | Başlık / içerik | Örnek | Tür / biçim |
| --- | --- | --- | --- |
| A2:H2 ve A31:H31 | `SİPARİŞ / TALEP FORMU  D.T:06.01.2026` | aynı metin | Metin, 14 kalın, yatay ve dikey orta. Tarih ayrı tarih hücresi değil |
| A3:H3 ve A32:H32 | `ZİRVE AHŞAP` | aynı | Metin, 14 kalın, orta |
| A4:H4 ve A33:H33 | `FEVZİ ÇAKMAK MAH. EHLİBEYT SK.NO 26 KARATAY / KONYA` | aynı | Metin, orta |
| A5:H5 ve A34:H34 | `TEL. : 0551 119 72 80` | aynı | Metin, kalın, orta |
| A6:H6 ve A35:H35 | boş şerit | — | Logo/başlık altı boş birleşik hücre |

E-posta, web ve Zirve vergi dairesi / vergi numarası bu formda yok.

### Müşteri bloğu

Üst kopya satır 7–10, alt kopya satır 36–39.

| Adres (üst) | Alt kopya | Başlık | Değer hücresi | Örnek | Tür |
| --- | --- | --- | --- | --- | --- |
| A7:B7 | A36:B36 | `FİRMA` | C7:H7 / C36:H36 | Müşteri A | Metin, sol, kalın |
| A8:B8 | A37:B37 | `ADRES` | C8:H8 / C37:H37 | boş | Metin |
| A9:B9 | A38:B38 | `V.D.` | C9 / C38 | boş | C9 birleşik değil |
| D9 | D38 | `TEL. :` | E9:H9 / E38:H38 | boş | Metin |
| A10:B10 | A39:B39 | `VERGİ NO` | C10:H10 / C39:H39 | boş | Metin |

Sipariş/form numarası, teslim tarihi, proje, şantiye, açıklama, ödeme koşulu, teslim koşulu, onay, imza ve kaşe hücresi yok. Tarih yalnız başlık metninin içindeki `D.T:06.01.2026` parçasıdır.

### Ürün tablosu

Üst başlık satırı 12, alt başlık satırı 41. Satırlar sabit: üst 13–23, alt 42–52. S.NO 1–11 sayıları formül değil, yazılmış sayıdır.

| Sütun | Üst | Alt | Başlık | Anlam (dosyadaki ad) |
| --- | --- | --- | --- | --- |
| A | A12 | A41 | `S.NO` | Satır numarası |
| B:C | B12:C12 | B41:C41 | `ÜRÜN ADI` | Serbest ürün metni. Model, renk, ayrı ölçü, yön, kalınlık ve açıklama sütunu yok. Kalınlık ve ölçü ürün adının içinde |
| D | D12 | D41 | `MİKTAR` | Sayı, biçim Genel |
| E | E12 | E41 | `BİRİM` | Metin. Dolu ve boş satırlarda `ADET` |
| F | F12 | F41 | `İSK.%` | Yüzde, biçim `0%`. Kayıtlı değer 0 |
| G | G12 | G41 | `BİRİM FİYATI` | Para, biçim `"₺"#,##0.00` |
| H | H12 | H41 | `TUTAR` | Aynı para biçimi |

Şu sütunlar yok: model, renk/dekor, ayrı ölçü, yön, kalınlık, malzeme miktarı, satır açıklaması.

### Dolu satırlar (iki kopyada aynı giriş)

| Satır | S.NO | ÜRÜN ADI | MİKTAR | BİRİM | İSK.% | BİRİM FİYATI | TUTAR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 13 ve 42 | 1 | `9MM 8*220 DÜZ PERVAZ` | 400 (Double) | `ADET` | 0, biçim `0%` | 0, para biçimi | **Sabit 0.** Formül değil |
| 14 ve 43 | 2 | `12MM 8*220 DÜZ PERVAZ` | 1500 | `ADET` | 0 | boş (para stili var, değer yok) | Formül `=D*G`, kayıtlı sonuç 0 |
| 15–23 ve 44–52 | 3–11 | boş | boş | `ADET` | 0 | boş | Paylaşılan formül `=D*G`, kayıtlı sonuç 0 |

### Toplam bloğu

Üst kopya satır 24–28, alt kopya satır 53–57. Etiketler G sütununda, tutarlar H sütununda.

| Üst | Alt | Etiket | Formül | Kayıtlı sonuç |
| --- | --- | --- | --- | --- |
| H24 | H53 | `GENEL TOPLAM` | `=SUM(H13:H13:H23)` ve `=SUM(H42:H42:H52)` | 0 |
| H25 | H54 | `İSKONTO` | Üst: `=L24`. Alt: `=L53` | 0 |
| H26 | H55 | `ARA TOPLAM` | `=H24-H25` / `=H53-H54` | 0 |
| H27 | H56 | `KDV %20` | **Yok.** Hücre boş | Kayıtlı değer yok |
| H28 | H57 | `YENİ TOPLAM` | `=H26+H27` / `=H55+H56` | 0 |

`KDV %20` etiketi statik metindir. Oran hücresi yoktur.

L sütunu yazdırılmaz:

| Hücre | Formül | Kayıtlı sonuç |
| --- | --- | --- |
| L13 | `=F13*H13` | 0 |
| L14 | `=F14*H14` | 0 |
| L16:L23 | paylaşılan `=F16*H16` ve karşılıkları | 0 |
| L24 | `=SUM(L13:L23)` | 0 |
| L42:L53 | **yok** | — |

İncelenen bütün formüllerin kayıtlı `<v>` sonucu vardır. Hepsi 0’dır. Kayıtsız formül sonucu yoktur.

## 5. Hesap zinciri

Formüller ham çarpma, çıkarma ve toplamdadır. `ROUND`, `ROUNDUP` veya `ROUNDDOWN` yoktur.

1. Formül satırında satır tutarı `MİKTAR × BİRİM FİYATI` (`D × G`).
2. Satır 1 (H13 ve H42) bu çarpımı yapmaz. Tutar elle yazılmış 0’dır. Birim fiyat değişince tutar kendiliğinden güncellenmez.
3. Satır iskonto tutarı, yalnız üst kopyanın L sütununda, `İSK.% × TUTAR`. `İSK.%` Excel yüzdesidir (`0%` = 0).
4. `GENEL TOPLAM` satır tutarlarının toplamıdır. Aralık yazımı `SUM(H13:H13:H23)` şeklindedir.
5. Üst kopyada `İSKONTO` = L toplamı. Alt kopyada `İSKONTO` olmayan L53’e bakar; L53 boş olduğu için iskonto 0 kalır.
6. `ARA TOPLAM` = `GENEL TOPLAM − İSKONTO`. İskonto, KDV hücresinden önce düşülür.
7. KDV tutarı hesaplanmaz. Etiket `%20` dese de H27/H56’ya 0,20 uygulanmaz.
8. `YENİ TOPLAM` = `ARA TOPLAM + KDV hücresi`. Boş KDV, toplamada 0 sayılır.

Fiyat, etiketteki `ADET` üzerindendir. m² veya metre dönüşümü yoktur.

İskonto satır yüzdesidir; tutarı başlığa toplanır. Ayrı bir başlık yüzde hücresi veya sabit tutar giriş hücresi yoktur. H25 formülünü silip sabit tutar yazmak dosyada yapılmamış.

KDV fiyata dahil mi, formülden kanıtlanamaz. Aritmetik şekil, iskonto sonrası ara toplama H27’yi eklemektir. H27 boş olduğu için bu dosyada eklenen tutar yoktur. Birden fazla KDV oranı için sütun veya formül yoktur.

Boş miktar veya boş birim fiyat, çarpımda 0 sonuç verir (satır 14: 1500 × boş = kayıtlı 0). Sıfır iskonto, 0 iskonto tutarı verir. Negatif değer bu dosyada yok; doğrulama da yok. Geçici kopyada negatif miktar ve negatif iskonto yüzdesi formülü bozmadan eksi tutar üretti.

Formüller sabit 11 satıra bağlıdır. Liste nesnesi (Excel Table) yoktur. 23 ve 52’nin altına yazılan satır toplama girmez.

Para biçimi `"₺"#,##0.00` gösterimdir. Hücre tam değeri biçimden bağımsız durur. Özgün dosyada bütün sonuçlar 0 olduğu için gösterilen `₺0,00` ile tam değer arasında kuruş farkı yoktur.

### Üçlü `SUM` aralığı

Geçici kopyada, özgün dosyaya yazmadan, `SUM(H13:H13:H23)` dolu satırların tam değer toplamına eşit çıktı (19.535,52). Anlamsal olarak `SUM(H13:H23)` ile aynı davrandı. Bu, özgün dosyadaki sıfır sonucun ötesinde bir yoklamadır; özgün dosyaya kaydedilmedi.

### Gösterim ve tam değer

Aynı geçici yoklamada:

| Hücre | Tam değer | Ekran / PDF biçimi |
| --- | --- | --- |
| H15 | 30,015 | `₺30,02` |
| H16 | 1,005 | `₺1,01` |
| L15 | 2,251125 | `₺2,25` |
| L24 / H25 | 1.754,001125 | `₺1.754,00` |
| H26 / H28 | 17.781,518875 | `₺17.781,52` |

Sonraki formül, ekrandaki kuruşa yuvarlanmış metni değil tam değeri kullanır. Gösterilen satır tutarlarının toplamı `₺19.535,53`, gösterilen genel toplam `₺19.535,52` oldu. Fark 0,01 TL’dir. Bu fark özgün dosyada yoktur; formülün yuvarlamadan topladığını göstermek için üretilmiştir.

## 6. İki kopya aynı hesap değil

İkisi de yazdırılıyor ve aynı iki ürün satırını gösteriyor. Hesap zinciri aynı değil:

- H13 ve H42 sabit 0. Birim fiyat değişse de tutar değişmez.
- İskonto formülleri yalnız L13:L24’tedir. Alt kopyada L yoktur; H54 boş L53’ü okur.
- Bu yüzden fiyat ve iskonto girilirse üst form iskonto düşer, alt formun iskonto satırı 0 kalabilir. İki baskı birbirinden sapar.

Hangisinin “asıl” nüsha olduğu dosyada yazılı değil. Üst blokta L hesabı durduğu için hesap açısından üst blok tam, alt blok eksiktir.

## 7. Belirsizlikler

- Başlıktaki `D.T:` sipariş tarihi mi, formun düzenlenme tarihi mi, teslim tarihi mi: ayrı tarih hücresi olmadığı için belirsiz. `core.xml` son yazdırma tarihi 2026-01-06 ile metin aynı günü gösteriyor; bu bir tanım değildir.
- Alt formun müşteri kopyası mı, dosya kopyası mı olduğu yazılı değil.
- `KDV %20` etiketinin dahil veya hariç fiyat anlamına gelmesi, tutar formülü olmadığı için belirsiz.
- Birim fiyatın nakit mi, kart mı, yoksa serbest girilmiş satış fiyatı mı olduğu bu dosyada yok.
- Ürün adındaki `9MM` ve `8*220` ifadesinin ölçü birimi (mm / cm) dosyada ayrıca yazılmıyor. Maliyet sistemindeki mm kuralı bu hücreye otomatik uygulanamaz.
- Yerel PDF’nin Letter çıkması, kayıtlı A4 ayarının yazıcıda ezilip ezilmediğini bu makineyle sınırlar. Çalışma kitabındaki kayıt A4 ve 1×1 sığdırmadır.
