# Zirve Ahşap – Maliyet ve Fiyatlandırma Sistemi

Şirket içi maliyet ve satış fiyatı hesaplama uygulaması. React/Vite arayüzü, NestJS API üzerinden Prisma/PostgreSQL verisini kullanır; gerçek maliyet ve fiyat hesapları backend'deki calculator'larda yapılır.

## Mevcut ve doğrulanmış kapsam

- Kapı Kasası: `34_MM` ve `30_MM`; güncel MDF fiyatı, doğrulanmış üretim verimi, ek maliyet, KDV, kâr ve yüzde bazlı kart fiyatı kullanılır.
- Pervaz: `AYARLI_PERVAZ`, `DEKORATIF_PERVAZ`, `DEKORATIF_PERVAZ_GENIS_KILCIK`.
- Ayarlı Pervaz golden kapsamı 20 nakit satırıdır: 12 kartlı, 8 kartsız.
- Dekoratif Pervaz golden kapsamı 6 nakit/kartlı satır; Geniş Kılçık kapsamı 2 nakit, kartsız satırdır.
- Excel MASTER NET, mevcut resolver akışında geometrik fallback'ten önce gelir. Fallback otomatik DB kaydı oluşturmaz.
- Para işlemleri `Decimal` kullanır. Pervaz'da KDV yoktur; kart fiyatı sabit TL farkıdır ve adjustment nihai `ROUNDUP` sonrasında uygulanır.
- MDF fiyatları, üretim verimleri, ek maliyetler, pricing ayarları ve fiyat override'ları versiyonlu saklanır; ilgili servis yazımları audit kaydını aynı transaction içinde üretir.
- Maliyet Hesaplama sayfasında Kapı Kasası ve Pervaz tabloları, ayarlar drawer'ı ve Kapı Kasası nakit fiyat override yönetimi bulunur.

Ürün/recipe modüllerinin ve bazı navigasyon sayfalarının hâlâ iskelet olduğu unutulmamalıdır. Authentication yoktur. Golden fixture'lar statik Excel referans değerleridir; depoda özgün Excel workbook'una bağlı otomatik checksum/import doğrulaması bulunmaz.

## Gereksinimler

- Node.js 20+
- npm
- PostgreSQL (Docker Compose ile veya yerel kurulum)

## Kurulum

Backend ve frontend bağımlılıklarını kendi dizinlerinde kurun:

```powershell
cd backend
npm install

cd ../frontend
npm install
```

Yerel PostgreSQL'i Docker ile başlatmak isterseniz proje kökünde:

```powershell
docker compose up -d
```

Ortam dosyalarını örneklerden oluşturun ve kendi bağlantı bilgilerinizi girin. Çalışan geliştirme düzeninde backend portu `3001`, frontend API adresi `http://localhost:3001` olarak korunmalıdır. Ortam dosyalarını veya sırları commit etmeyin.

Yeni veya boş bir veritabanını ilk kez hazırlamak dışında migration ya da seed çalıştırmayın. Aşağıdaki komutlar hedef `DATABASE_URL` üzerinde değişiklik yapar:

```powershell
cd backend
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed
```

Seed'in kullanıcı tarafından değiştirilmiş aktif değerleri geri almaması proje kuralıdır; mevcut seed davranışını incelemeden bunu mutlak güvence kabul etmeyin.

## Geliştirme ortamını çalıştırma

Backend:

```powershell
cd backend
npm run start:dev
```

- API: `http://localhost:3001`
- Sağlık kontrolü: `http://localhost:3001/health`

Frontend:

```powershell
cd frontend
npm run dev
```

- Arayüz: `http://localhost:5173`

## Test ve build

Golden testler DB kullanmaz ve backend dizininden çalıştırılır:

```powershell
cd backend
npm test -- --runInBand src/calculation-engine/calculators/door-frame-excel-golden.spec.ts src/calculation-engine/calculators/pervaz-excel-golden.spec.ts
```

Tüm backend testlerini çalıştırmadan önce DB erişimini kontrol edin. `PrismaClient` kullanan entegrasyon testleri create/delete veya constraint denemeleri yapabilir. Bu testleri yalnız ayrı bir test veritabanıyla çalıştırın.

Production build doğrulamaları:

```powershell
cd backend
npm run build

cd ../frontend
npm run build
```

## Dizinler

- `backend/src/calculation-engine/` — saf calculator'lar, resolver yardımcıları ve golden fixture/testler
- `backend/src/modules/` — REST controller'ları, orchestration servisleri ve veri modülleri
- `backend/prisma/` — Prisma şeması, migration geçmişi ve seed kaynakları
- `frontend/src/` — React arayüzü, Maliyet Hesaplama sayfası ve API istemcileri
- `.cursor/rules/` ve `AGENTS.md` — depo çalışma kuralları
