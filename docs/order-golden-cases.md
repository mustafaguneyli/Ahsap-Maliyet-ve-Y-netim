# Sipariş formu — golden vakalar

Sayılar özgün çalışma kitabından veya, açıkça işaretlenen yerde, çalışma alanı dışındaki geçici kopyadan gelir. Müşteri unvanı **Müşteri A** olarak yazıldı. Özgün dosya ve logo repoya konmadı.

Dosya: 20.769 bayt, SHA-256 `9825DF90C07AD5406494DA85E0AA52247D827F4A00407AF6D7CB51A207C8571E`.

Para gösterimi `"₺"#,##0.00`. Formüllerde `ROUND` yoktur.

## 1. Özgün dosyadaki üç satır

Üst form. Alt formdaki 42–44 aynı girişleri taşır; tutar hücresi satır 1’de yine sabittir.

### Satır 1 — `B13:C13`

| Alan | Değer |
| --- | --- |
| ÜRÜN ADI | `9MM 8*220 DÜZ PERVAZ` |
| MİKTAR | 400 |
| BİRİM | `ADET` |
| İSK.% | 0 |
| BİRİM FİYATI | 0 |
| TUTAR | Sabit 0. Formül yok |

Elle: 400 × 0 = 0. Kayıtlı tutar 0. Gösterim `₺0,00`. Kuruş farkı yok.

Bu satırda birim fiyat değiştirilse tutar formülü olmadığı için 0 kalır. Geçici kopyada G13 = 99 yapıldı; H13 formül almadı.

### Satır 2 — `B14:C14`

| Alan | Değer |
| --- | --- |
| ÜRÜN ADI | `12MM 8*220 DÜZ PERVAZ` |
| MİKTAR | 1500 |
| BİRİM | `ADET` |
| İSK.% | 0 |
| BİRİM FİYATI | boş |
| TUTAR | `=D14*G14`, kayıtlı sonuç 0 |

Elle: 1500 × 0 = 0. Boş fiyat çarpımda 0’dır. Gösterim `₺0,00`. PDF’de birim fiyat metni yoktur; tutar `₺0,00` basılır. Kuruş farkı yok.

İskonto tutarı `=F14*H14` = 0.

### Satır 3 — satır 15

| Alan | Değer |
| --- | --- |
| ÜRÜN ADI | boş |
| MİKTAR | boş |
| BİRİM | `ADET` |
| İSK.% | 0 |
| BİRİM FİYATI | boş |
| TUTAR | `=D15*G15`, kayıtlı sonuç 0 |

Elle: boş × boş = 0. Gösterim `₺0,00`. Kuruş farkı yok.

## 2. Özgün toplamlar

Üst blok, kayıtlı sonuçların hepsi 0.

| Etiket | Hücre | Hesap | Sonuç | Gösterim |
| --- | --- | --- | --- | --- |
| GENEL TOPLAM | H24 | `SUM(H13:H13:H23)` | 0 | `₺0,00` |
| İSKONTO | H25 | `=L24`, L24 = `SUM(L13:L23)` | 0 | `₺0,00` |
| ARA TOPLAM | H26 | `0 − 0` | 0 | `₺0,00` |
| KDV %20 | H27 | formül yok, değer yok | boş | PDF’de tutar basılmaz |
| YENİ TOPLAM | H28 | `=H26+H27` | 0 | `₺0,00` |

Boş H27 toplamada 0’dır. Etiket `%20` bu toplama uygulanmaz. 0 × 0,20 hesabı dosyada yoktur.

Alt blok H53–H57 kayıtlı sonuçları da 0’dır. H54 `=L53` ve L53 yoktur; iskonto yine 0 görünür. Bu, iskontonun hesaplandığını göstermez.

## 3. Atölye malzeme miktarı

Doğrulanabilen miktar yalnız sipariş adedidir:

| Ürün metni | Miktar | Birim |
| --- | --- | --- |
| `9MM 8*220 DÜZ PERVAZ` | 400 | `ADET` |
| `12MM 8*220 DÜZ PERVAZ` | 1500 | `ADET` |

Malzeme tüketimi, plaka adedi veya reçete miktarı bu çalışmada yoktur. Atölye golden’ına fiyat, iskonto, KDV ve toplam konmaz.

## 4. Geçici kopyada tam değer ve kuruş

Bu bölüm özgün dosyanın sonucu değildir. Özgün dosyada sıfırdan başka para değeri olmadığı için kuruş farkı orada görülemez. Yoklama `probe.xlsx` üzerinde yapıldı ve kaydedilmeden kapatıldı.

Girişler: H13 elle 7 (formül hâlâ yok), satır 14 miktar 1500 fiyat 12,345 iskonto %10, satır 15 miktar 3 fiyat 10,005 iskonto %7,5, satır 16 miktar 1 fiyat 1,005 iskonto %0, satır 17 miktar −2 fiyat 10, satır 18 miktar 100 fiyat 10 iskonto %−10.

| Hücre | Elle / formül | Tam değer | Gösterim |
| --- | --- | --- | --- |
| H14 | 1500 × 12,345 | 18517,5 | `₺18.517,50` |
| L14 | 0,10 × 18517,5 | 1851,75 | `₺1.851,75` |
| H15 | 3 × 10,005 | 30,015 | `₺30,02` |
| L15 | 0,075 × 30,015 | 2,251125 | `₺2,25` |
| H16 | 1 × 1,005 | 1,005 | `₺1,01` |
| H17 | −2 × 10 | −20 | `-₺20,00` |
| H18 | 100 × 10 | 1000 | `₺1.000,00` |
| L18 | −0,10 × 1000 | −100 | `-₺100,00` |
| H24 | tam değerlerin toplamı | 19535,52 | `₺19.535,52` |
| L24 / H25 | 1851,75 + 2,251125 − 100 | 1754,001125 | `₺1.754,00` |
| H26 | 19535,52 − 1754,001125 | 17781,518875 | `₺17.781,52` |
| H27 | boş | boş | tutar yok |
| H28 | H26 + boş | 17781,518875 | `₺17.781,52` |

Gösterilen satır tutarları: 7,00 + 18.517,50 + 30,02 + 1,01 − 20,00 + 1.000,00 = 19.535,53. Gösterilen genel toplam 19.535,52. Fark **0,01 TL**. Toplam, ekrandaki kuruşları değil tam değerleri toplar.

H42 bu yoklamada 0 kaldı. Alt kopyanın girişleri değiştirilmedi. H54, boş L53 yüzünden 0 kaldı.

## 5. Golden assert özeti

Özgün dosya için beklenti:

- Brüt = 0
- İskonto = 0
- Ara toplam = 0
- KDV tutarı = boş (sayısal 0 yazılmış sayılmaz)
- Yeni toplam = 0
- Satır 1 tutarı formül değil
- Satır 2 ve 3 tutarı `miktar × birim fiyat`, sonuç 0
- Atölye miktarları 400 ADET ve 1500 ADET
- Atölye çıktısında fiyat alanı yok

Sentetik kuruş vakası ayrı testtir. Özgün toplamları 19.535,52 yapmak bu dosyayı doğrulamaz.
