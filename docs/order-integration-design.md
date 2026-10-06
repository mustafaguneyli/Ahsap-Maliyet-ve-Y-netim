# Sipariş formu — entegrasyon tasarımı

Bu belge kod değildir. Prisma modeli, migration, API ve ekran burada aday olarak durur. Bu görevde hiçbiri yazılmadı.

Mevcut maliyet ve fiyatlandırma davranışı korunur:

- Grup kart oranı ile ürün oranı geri dönüşü ayrı kalır.
- Kapı kasası ürün kayıtlarındaki `%20` silinmez ve grup oranına kopyalanmaz.
- Eksik grup kart oranı otomatik doldurulmaz.
- Eksik MDF, sarma veya dekoratif kaynaklara değer uydurulmaz.
- Yeni sipariş kaydı, geçmiş maliyet veya satış hesabını yeniden çalıştırmaz.

## 1. Mevcut proje envanteri

Akış bugün `React → NestJS controller → service → calculator/resolver → Prisma` şeklindedir. Para `decimal.js` ve `Prisma.Decimal` ile gider. `backend/src/common/decimal/decimal.util.ts` içindeki `roundUpToWholeTl`, kapı kasası ve süpürgelik satışındaki tam TL `ROUNDUP` içindir. Sipariş formunda `ROUND` yoktur; bu fonksiyon sipariş tutarına taşınmaz.

Doğrulama `backend/src/main.ts` içindeki genel `ValidationPipe`: `whitelist`, `forbidNonWhitelisted`, `transform`.

### Müşteri

Müşteri, adres veya ilgili kişi modeli yok. Formdaki `FİRMA`, `ADRES`, `V.D.`, `TEL.` ve `VERGİ NO` karşılığı bir tablo bulunmuyor.

### Ürün, grup, varyant, ölçü

`backend/prisma/schema.prisma`:

- `ProductGroup`, `Product`
- `ProductSize`: `widthMm` × `lengthMm`. Kalınlık bu alan değildir
- Kapı kasası kalınlık varyantı kodda `door-frame-variants` ile seçilir
- Çıta yayın bantları `CitaPublishedPriceBand`

Formdaki `ÜRÜN ADI` serbest metindir. Ürün kodu, grup kodu veya ölçü anahtarı yoktur.

### Sipariş, teklif, satış

Kalıcı sipariş, teklif veya satış tablosu yok.

`OrderQuoteService` (`backend/src/modules/cost-calculation/order-quote.service.ts`) ve `POST /cost-calculation/order-quote` (`CostCalculationController`) anlık maliyet/satış teklifidir. Kayıt yazmaz. Dönüşte birim ve toplam üretim, nakit, kart, eksik kaynak mesajı ve kart durum metni vardır. Excel formundaki `BİRİM FİYATI` bu servisten okunmaz.

### Maliyet ve satış fiyatı

Hesap motoru ürün grubuna göredir: kapı kasası, pervaz, süpürgelik, çıta. Kaynaklar `RawMaterial` / `RawMaterialPrice` (CASH ve CARD_INSTALLMENT), `ProductionYield`, `ExtraCost`, `PricingSetting`, `PricingThicknessModifier`, `PricingRowException`, `PriceOverride`.

Kart satış bugün `nakit × (1 + oran/100)` şeklindedir (`applyPercentCardSale`). Kapı kasası ve süpürgelikte ayrıca tam TL yukarı yuvarlama vardır. Pervaz ve çıtada ek yuvarlama yoktur. Oran yoksa nakit durur, kart `null` olur, mesaj “Kart/taksit oranı tanımlı değil” olur.

Grup oranı `resolveGroupCardMarkupRate`, kapı kasasında ürün geri dönüşü `resolveCardMarkupRateWithProductFallback` (`backend/src/modules/pricing/card-markup-rate.resolver.ts`). Grup listesi ürün yüzdesini grup oranı gibi göstermez.

`AGENTS.md` ve `PricingSetting.cardFixedSurchargeAmount` yorumu pervaz kartını sabit TL diye anlatır. Çalışan kod `pervaz-card-sale.ts` içinde yüzde kullanır. Bu görev o çelişkiyi düzeltmez. Sipariş formu kart formülü içermez; pervaz kart kuralı bu forma kopyalanmaz.

### KDV ve iskonto

Maliyet tarafında KDV ve kârlılık `PricingSetting` alanlarıdır ve maliyetten satışa giden hesapta kullanılır. Excel formundaki `İSK.%` ve boş KDV hücresi bu ayarlardan okunmaz.

Formda iskonto satır yüzdesidir. Başlıkta tek bir iskonto tutarı vardır. KDV tek statik etikettir ve tutarı formül değildir. Ayrıntı `docs/order-excel-analysis.md` içindedir.

### Reçete ve malzeme tüketimi

`Recipe` ve `RecipeItem` şemada vardır. `RecipesModule` boş bir modüldür; controller’ı yoktur. `recipe-item.validation.ts` kapı kasasının iki parçalı reçete kuralı içindir. Maliyet hesabı bu sipariş formunu okumaz ve formda malzeme miktarı sütunu yoktur.

### Dosya, Excel, PDF

Uygulama bağımlılıklarında `exceljs`, `xlsx` veya PDF/Puppeteer yoktur. Yükleme controller’ı yoktur. `multer` kilit dosyasında geçişli görünebilir; yükleme özelliği değildir.

### Audit, kullanıcı, yetki

`AuditEvent` eklemelidir. `AuditService` varsayılan aktörü `local-admin`. Kritik kaynak değişikliği ile audit aynı transaction’da yazılır. Faz 1’de login, JWT, kullanıcı ve rol yoktur.

### Ekranlar

`frontend/src/App.tsx` sayfaları: kontrol paneli, malzemeler, verimler, maliyet, ürünler, fiyatlandırma, audit. Sipariş içe aktarma veya baskı sayfası yoktur. Para hesabı frontend’de yapılmaz.

### Test

Hesap motoru `*.spec.ts` golden ve birim testleri kullanır. `PrismaClient` testleri ayrı `DATABASE_URL` olmadan çalışan veritabanında çalıştırılmaz. Golden beklenenleri calculator çıktısından üretilmez.

## 2. Excel alanı → aday domain alanı

Aday adlar mevcut şemadaki PascalCase / camelCase çizgisine uyar. Henüz model değildir.

| Excel | Aday alan | Zorunluluk |
| --- | --- | --- |
| A2 başlığındaki `D.T:…` metni | `documentDateText` | Metin olarak saklanır. Tarih tipine çevrilmesi belirsizdir |
| A3 `ZİRVE AHŞAP` ve A4–A5 | Baskı şablonu sabiti veya şirket kaydı. Sipariş satırına kopyalanmaz | Formdaki metinle birebir |
| C7 `FİRMA` | `customerName` | Serbest metin. Müşteri tablosu bu dosyadan doğrulanmadı |
| C8 `ADRES` | `customerAddress` | Boş olabilir |
| C9 `V.D.` | `taxOffice` | Boş olabilir |
| E9 `TEL.` | `customerPhone` | Boş olabilir |
| C10 `VERGİ NO` | `taxNumber` | Boş olabilir |
| A13 `S.NO` | `lineNo` | 1–11, formdaki sayı |
| B13 `ÜRÜN ADI` | `productNameText` | Serbest metin. Katalog eşlemesi ayrı ve opsiyonel |
| D13 `MİKTAR` | `quantity` | Decimal. Boş, formülde 0 gibi davranıyor |
| E13 `BİRİM` | `unitText` | Dosyada `ADET` |
| F13 `İSK.%` | `discountRate` | Satır yüzdesi. 0 geçerli |
| G13 `BİRİM FİYATI` | `unitPrice` | Decimal. Kaynak bu hücredir, katalog değildir |
| H13 / H14 `TUTAR` | `lineAmount` | Satır 1 sabit; diğer satırlar `quantity × unitPrice` |
| L13 `F×H` | `lineDiscountAmount` | Yazdırılmaz. Üst blokta hesaplanır |
| H24 `GENEL TOPLAM` | `grossTotal` | Satır tutarları toplamı |
| H25 `İSKONTO` | `discountAmount` | Satır iskonto tutarlarının toplamı |
| H26 `ARA TOPLAM` | `netTotal` | Brüt − iskonto |
| G27 `KDV %20` | `vatLabel` | Statik metin |
| H27 | `vatAmount` | Elle tutar. Formül yok. Boş, toplamada 0 |
| H28 `YENİ TOPLAM` | `grandTotal` | `netTotal + vatAmount` |

Alt kopya (satır 31–57) ikinci bir sipariş değildir. Aynı sayfanın ikinci baskısıdır ve iskonto zinciri eksiktir. Kayıt kaynağı olarak üst blok (satır 7–28) esas alınır. Alt blok, içe aktarmada uyarı olarak gösterilir; ikinci sipariş satırı üretilmez.

## 3. Veri kaydı — kanıt tablosu

Kesin karar yalnız kanıtı olan satırdadır.

| Madde | Sonuç | Kanıt |
| --- | --- | --- |
| Satır fiyatı, kayıt anında snapshot tutulmalıdır | Belirsiz | Form fiyatı hücre değeridir, katalog formülü değildir (`G13` sabit 0, `G14` boş). Uygulamada sipariş tablosu yoktur. Dondurma kuralı bu dosyadan ve şemadan çıkmaz; tasarım önerisidir |
| Ürün ana kaydı değişince eski sipariş değişmemelidir | Belirsiz | Eski sipariş kaydı yoktur. `OrderQuoteService` her istekte yeniden hesaplar. Bu form o servise bağlı değildir |
| Ürün adı, ölçü ve dekor satır snapshot’ında durmalıdır | Belirsiz | Formda ad serbest metindir (`B13`). Ayrı dekor/ölçü sütunu yoktur. Snapshot ihtiyacı iş kuralı olarak doğrulanmadı |
| Katalogla eşleşmeyen serbest satır içe aktarılabilir | Doğrulandı (dosya davranışı) | `ÜRÜN ADI` serbest metin. Ürün kodu veya doğrulama listesi yok. Sistemin buna izin vermesi ayrıca ürün kararıdır; dosya buna zorlamaz, engellemez |
| İçe aktarılan fiyat, güncel katalog fiyatından önceliklidir | Belirsiz | Form fiyatı katalogdan okunmaz. İkisi birden varken hangisinin kazanacağı yazılmamış |
| Fiyat kaynağı `IMPORT` / `MANUAL` / `PRODUCT` / `GROUP` izlenmelidir | Belirsiz | Ne Excel’de ne şemada bu alan var. Öneri aşağıdadır |
| Grup/ürün kart oranı sipariş anında hesaplanır, geçmiş sipariş yeniden hesaplanmaz | Doğrulandı (ayrılık) | Formda kart formülü yok. Mevcut kart oranı maliyet ekranına aittir ve boş grup oranı otomatik doldurulmaz. Sipariş, kart oranını yeniden hesaplamamalıdır çünkü kaynak hücre `BİRİM FİYATI`dır |
| İskonto sipariş başlığında tutulmalıdır | Reddedildi (tek başına) | Asıl giriş satırdaki `İSK.%`. Başlıktaki `İSKONTO` üst blokta `=L24` türevidir. Yalnız başlık yüzdesi yoktur |
| KDV sipariş başlığında tutulmalıdır | Doğrulandı (konum) | Tek etiket `KDV %20` (`G27`). Satır KDV sütunu yok. Tutar hücresi boş ve formülsüz |
| Bir siparişte birden fazla KDV oranı mümkündür | Reddedildi (bu dosya) | Tek statik etiket. Satır oranı yok |
| Atölye malzeme miktarı satırdan mı, reçeteden mi, üretim snapshot’ından mı gelir | Belirsiz | Formda malzeme miktarı yok. Miktar `ADET` sipariş adedidir. `RecipesModule` boştur. Mevcut NET/reçete hesabını atölye miktarına bağlamak yeni iş kuralı olur |
| Dosya özeti, yükleyen, zaman ve eşleme sürümü tutulmalıdır | Belirsiz | Formda böyle alan yok. Audit bugün kaynak değişiklikleri içindir, dosya yüklemesi için değildir. Faz 1’de kullanıcı yoktur (`local-admin`) |
| Aynı dosyanın iki kez içe aktarılması özet ile engellenmelidir | Belirsiz | Dosyada idempotency anahtarı yok. İş kararı yazılmamış |
| Müşteri bilgisi atölye çıktısında tamamen mi gizlensin | Belirsiz | Ayrı atölye sayfası yok. Basılan iki kopyanın ikisinde de `FİRMA` var. Adres, telefon ve vergi no bu dosyada boş |

## 4. Aday veri modeli

Yeni tablolar mevcut adlandırma ile, snake_case eşlemeli:

- `OrderDocument` — bir içe aktarmanın onaylanmış hali. Başlık metinleri, müşteri alanları, `vatLabel`, `vatAmount`, türetilmiş toplamlar, `calculationVersion`
- `OrderDocumentLine` — `lineNo`, `productNameText`, opsiyonel `productId`, `quantity`, `unitText`, `discountRate`, `unitPrice`, `lineAmount`, `lineDiscountAmount`, `priceSource`
- `OrderDocumentFile` — dosya adı, boyut, SHA-256, yükleme zamanı, `mappingVersion`. Aktör bugün `local-admin`

Fiyat kaynağı adayı, mevcut koda uydurulmuş:

- `ENTERED` — formdaki `BİRİM FİYATI` (bu dosyada görülen durum)
- `MANUAL` — onay ekranında elle düzeltme
- `PRODUCT` — ancak kullanıcı katalog fiyatını açıkça seçerse

`GROUP` bu form için kullanılmaz. Grup kart oranı sipariş birim fiyatı değildir.

`priceSource` varsayılanı kod yazılırken `ENTERED` olur. `IMPORT` kelimesi şemada başka bir anlamda yok; dosya olayı `OrderDocumentFile` ile ayrılır.

Toplamlar satırlardan sunucuda, `Decimal` ile, bir kez hesaplanıp aynı sürümde saklanır. Baskı bu snapshot’ı okur. Maliyet motoru çağrılmaz.

### Decimal ve yuvarlama

Aday aritmetik `Prisma.Decimal` / `decimal.js`. JavaScript `number` para için kullanılmaz.

Excel’in kanıtlanan davranışı:

- Ara adımda yuvarlama yok
- Gösterim 2 kuruş
- Sonraki işlem tam değeri kullanır
- Tam TL `ROUNDUP` yoktur

Saklama politikası bu yüzden maliyet ekranından ayrılır. Aday: satır tutarı ve iskonto tutarı tam `quantity × price` ve `rate × lineAmount` olarak saklanır; baskı 2 kuruş gösterir. Satır tutarını saklarken 2 kuruşa yuvarlamak, Excel’deki `H26 = H24 − H25` zincirinden sapar. Bunu yapmak için ayrı iş onayı gerekir. Bu belirsizdir.

Boş miktar veya boş fiyat, Excel’de 0 üretir. İçe aktarma önizlemesi bunu uyarı olarak gösterir; sessizce 0 sipariş satırı yazmak onaydan önce yapılmaz. Negatif değer formülü bozmuyor ve doğrulama yok. Kabul edilip edilmeyeceği belirsizdir; aday DTO negatifleri reddeder ve önizlemede uyarı üretir. Bu bir öneridir, dosyadaki kural değildir.

Satır 1’deki sabit tutar (H13) formülle çelişirse önizleme durur ve kullanıcıya “tutar miktar × fiyat değil” denir. Otomatik düzeltme yapılmaz.

### Baskı varyantı

Tek `OrderDocument` sürümünden iki projeksiyon. İkinci hesap yoktur.

`PrintVariant`: `CUSTOMER_PRICED` | `WORKSHOP_MATERIAL`

#### `CUSTOMER_PRICED` alanları

Formda gerçekten bulunanlar:

- Başlık metni ve içindeki `D.T:` metni
- Zirve unvan, adres, telefon, iki logo
- `FİRMA`, `ADRES`, `V.D.`, `TEL.`, `VERGİ NO` (boş kalabilir)
- Satır: `S.NO`, `ÜRÜN ADI`, `MİKTAR`, `BİRİM`, `İSK.%`, `BİRİM FİYATI`, `TUTAR`
- `GENEL TOPLAM`, `İSKONTO`, `ARA TOPLAM`, `KDV %20` etiketi, KDV tutarı, `YENİ TOPLAM`

Eklenmez: sipariş no, teslim tarihi, proje, şantiye, not, ödeme/teslim koşulu, imza, kaşe, e-posta, web, model, renk, yön, malzeme miktarı, nakit/kart ayrımı, maliyet, kâr. Bunlar bu dosyada yok.

#### `WORKSHOP_MATERIAL` alanları

- Belge kimliği (iç kayıt no — formda yoksa sistem no’su; müşteri form numarası uydurulmaz)
- Başlıktaki tarih metni
- `ÜRÜN ADI` metni
- `MİKTAR`, `BİRİM`
- Varsa üretim notu: bu dosyada not sütunu yok, alan boş şablon olarak bile fiyat taşımaz

DTO, HTML ve PDF modelinde bulunmaz:

- birim fiyat, satır tutarı, ara toplam, iskonto oranı, iskonto tutarı, KDV oranı, KDV tutarı, genel toplam, kart/nakit farkı, maliyet, kâr

Malzeme miktarı ve malzeme özeti bu dosyadan ve mevcut reçete API’sinden doğrulanamadığı için ilk dilimde yoktur. CSS ile gizleme yeterli sayılmaz; ayrı DTO ve “fiyat anahtarı yok” testi gerekir.

Müşteri unvanının atölye kopyasında durup durmayacağı belirsizdir. İlk dilim atölye DTO’suna `FİRMA` koymaz. İş onayı gelirse alan eklenir. Adres, telefon ve vergi no atölye DTO’sunda yoktur.

## 5. Aday API

Mevcut controller stili: çoğul kaynak, `POST` gövde DTO’su, genel validation pipe.

| Uç | İş |
| --- | --- |
| `POST /order-documents/preview` | Dosyayı kaydetmeden ayrıştırır. Uyarı listesi döner. Sipariş yazmaz |
| `POST /order-documents` | Onaylanmış önizleme gövdesi ile tek sürüm yazar |
| `GET /order-documents/:id` | Snapshot |
| `GET /order-documents/:id/prints/customer-priced` | Müşteri projeksiyonu |
| `GET /order-documents/:id/prints/workshop-material` | Atölye projeksiyonu |

`/cost-calculation/order-quote` değişmez.

Önizleme uyarıları (bu şablon için):

- H13 sabit, `D×G` değil
- Alt kopyada L53 yok
- KDV tutarı boş; etiket `%20` hesap yapılmış anlamına gelmez
- Birim fiyat veya ürün adı boş satırlar
- Dosyadaki iki ürün satırı katalog anahtarı taşımıyor
- Yazdırma alanı dışında L sütunu

Eşleşmeyen satır: `productId` boş, `productNameText` dolu, `priceSource = ENTERED`. Katalog eşlemesi otomatik yapılmaz. `9MM 8*220` metnini pervaz ölçüsüne çevirmek yeni iş kuralıdır; bu görevde yapılmaz.

## 6. React akışı

Yeni sayfa, mevcut kabuğa bir madde olarak eklenir. Aday: “Sipariş formu”.

1. Dosya seçilir.
2. `preview` sonucu tabloda gösterilir. Uyarılar satır satırdır.
3. Kullanıcı onaylar. Sunucu snapshot yazar.
4. Aynı kayıttan “Müşteri formu” ve “Atölye” açılır.

Frontend tutar çarpmaz. Önizleme sunucunun döndürdüğü `Decimal` string’lerini gösterir.

## 7. Yetki ve audit

Faz 1’de rol yoktur. Aktör `local-admin` kalır. Dosya yazımı ile audit aynı transaction’da olur. Audit yükü: dosya SHA-256, boyut, eşleme sürümü, satır sayısı. Müşteri unvanı audit gövdesine kopyalanmaz; belge kimliği yeter.

Idempotency iş kararı belirsiz olduğu için ilk dilimde otomatik ret yoktur. Aynı özet ikinci kez gelirse önizleme uyarı verir; ikinci kaydı engellemek onay gerektirir.

## 8. Test stratejisi

- Ayrıştırıcı birim testi, repoya konmuş anonim fixture ile. Özgün Excel ve müşteri unvanı fixture’a konmaz. Sayılar `docs/order-golden-cases.md` ile aynıdır.
- Üst blok: satır 2 formülü `1500 × 0 = 0`, satır 1 sabit tutar, KDV hücresi boş, yeni toplam = ara toplam.
- Sentetik yuvarlama vakası golden’da ayrıdır; özgün dosyanın sonucu diye yazılmaz.
- Atölye testi: JSON’da fiyat, iskonto, KDV, toplam, maliyet ve kâr anahtarı olmadığını assert eder.
- Mevcut golden maliyet testleri bu işte yeniden çalıştırılmaz; maliyet kodu değişmez.
- Prisma testi yalnız ayrı `DATABASE_URL` ile, sonraki dilimde.

## 9. Aşamalar

1. **Önizleme ayrıştırıcısı.** Sabit Sayfa2 şablonu, üst blok, uyarılar, golden test. Kayıt yok, migration yok, yeni paket kararı bu dilimin başında ayrıca verilir. Maliyet koduna dokunulmaz.
2. **Snapshot kaydı.** `OrderDocument` + satır + dosya özeti + audit. Baskı yok.
3. **İki projeksiyon.** Önce HTML, PDF kütüphanesi ayrı onay. Atölye sızıntı testi.
4. **Katalog eşleme.** Yalnız kullanıcı seçerse `productId`. Otomatik ölçü ayrıştırma yok.
5. **Reçete / malzeme miktarı.** Ancak reçete kaynağı ve birim iş kuralı doğrulanırsa.

İlk dilim 1. adımdır.
