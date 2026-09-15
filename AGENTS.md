# Zirve Ahşap çalışma kuralları

Bu dosya depo genelinde geçerlidir. Daha üst dizindeki talimatlar ve `.cursor/rules/zirve-ahsap-core.mdc` önceliklidir; çelişki halinde daha üst/özel talimatı uygula.

## Mimari sınırlar

- Frontend React/TypeScript/Vite, backend NestJS/TypeScript, veri katmanı Prisma/PostgreSQL'dir.
- Akış `React UI → REST controller → service/orchestration → calculator veya resolver → Prisma` şeklindedir.
- Para ve gerçek iş kuralları frontend'de hesaplanmaz. Calculator'lar saf hesap mantığını, service'ler güncel kaynak veriyi ve orkestrasyonu, resolver'lar MASTER/fallback seçimini taşır.
- Kapı Kasası (`34_MM`, `30_MM`) ile Pervaz ürünlerinin kurallarını birbirine taşımayın. Çalışan backend'in `3001` port düzenini koruyun.

## Hesaplama ve kaynak veri

- Para ve oranlarda `Decimal` kullanın; `Number` dönüşümü veya ara yuvarlama yapmayın. Yalnız tanımlı nihai `ROUNDUP` uygulanır.
- Excel MASTER NET, izin verilmiş geometrik fallback'ten önceliklidir. Fallback yalnız mevcut ürün kuralı açıkça izin veriyorsa çalışır, kaynağını belirtir ve otomatik DB kaydı oluşturmaz.
- Fiyatları, ek maliyetleri, verimleri ve pricing ayarlarını request anındaki güncel source data ile hesaplayın; sonucu eski bir snapshot'tan üretmeyin.
- Kapı Kasası kart hesabı yüzde, Pervaz kart hesabı sabit TL farkıdır. Pervaz'a KDV uygulanmaz. Pervaz adjustment, `ROUNDUP` sonrasında eklenir.

## Veri, seed, version ve audit

- Seed/migration komutlarını açık ihtiyaç ve doğru hedef DB doğrulanmadan çalıştırmayın. Seed idempotent olmalı ve kullanıcı tarafından değiştirilmiş aktif değerleri geri almamalıdır; mevcut seed yollarında bu güvenceyi varsaymadan kodu inceleyin.
- Fiyat, NET/verim, ek maliyet, pricing ve override geçmişini yerinde ezmeyin veya silmeyin. Geçerli versiyonu kapatıp yeni versiyon oluşturun.
- Kritik veri değişikliği ile audit kaydını aynı Prisma transaction içinde yazın. Birden çok API isteğinin tek transaction olmadığını göz önünde bulundurun.

## Doğrulama komutları

Backend dizininden DB'siz golden testler:

```powershell
npm test -- --runInBand src/calculation-engine/calculators/door-frame-excel-golden.spec.ts src/calculation-engine/calculators/pervaz-excel-golden.spec.ts
npm run build
```

Frontend dizininden:

```powershell
npm run build
```

Jest tüm `*.spec.ts` dosyalarını aynı komutta toplar. `PrismaClient` kullanan testleri uygulamanın mevcut veritabanında çalıştırmayın; yalnız açıkça ayrı bir test `DATABASE_URL` sağlandığında çalıştırın. Golden fixture beklenenlerini calculator çıktısından runtime'da üretmeyin ve testi geçirmek için değiştirmeyin; bağımsız Excel kaynak doğrulaması yoksa bunu raporlayın.
