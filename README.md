# Zirve Ahşap – Maliyet ve Fiyatlandırma Sistemi

Şirket içi maliyet ve satış fiyatı hesaplama uygulaması. Phase 1 doğrulama ürünü kapı kasasıdır. Bu depo şu an **Faz 1A iskeletini** içerir: auth yoktur, gerçek Excel hesaplama motoru henüz yoktur.

## Gereksinimler

- Node.js 20+
- npm
- Docker Desktop (önerilen PostgreSQL yolu)

Docker yoksa yerel PostgreSQL 16/17 de kullanılabilir. `backend/.env` içindeki `DATABASE_URL` aynı kullanıcı/parola/veritabanı ile eşleşmelidir.

## 1. PostgreSQL'i Docker ile başlatın

Proje kökünde:

```powershell
docker compose up -d
```

Servis `localhost:5432` üzerinde ayağa kalkar.

- Kullanıcı: `zirve`
- Parola: `zirve_dev`
- Veritabanı: `zirve_ahsap`

Bu değerler yalnızca yerel geliştirme içindir.

## 2. Backend kurulumu

```powershell
cd backend
copy .env.example .env
npm install
```

## 3. Migration

```powershell
cd backend
npx prisma migrate deploy
npx prisma generate
```

Temiz bir PostgreSQL ortamında tablolar bu komutla oluşur.

## 4. Backend çalıştırma

```powershell
cd backend
npm run start:dev
```

API adresi: http://localhost:3000

Sağlık kontrolü: http://localhost:3000/health

Beklenen yanıt örneği:

```json
{ "status": "ok", "database": "up", "timestamp": "..." }
```

## 5. Frontend kurulumu

```powershell
cd frontend
copy .env.example .env
npm install
```

## 6. Frontend çalıştırma

```powershell
cd frontend
npm run dev
```

Arayüz adresi: http://localhost:5173

Dashboard, backend `/health` sonucunu gösterir.

## Klasörler

- `backend/` — NestJS API, Prisma, Decimal altyapısı
- `frontend/` — React + TypeScript + Vite yönetim kabuğu
- `docker-compose.yml` — yerel PostgreSQL

## Faz 1A kapsamı dışındakiler

- Login / kullanıcı / rol
- DoorFrameCalculator satış/maliyet formülleri
- Excel MDF fiyat ve NET adet importu
- Golden testler
- Detaylı CRUD ekranları
