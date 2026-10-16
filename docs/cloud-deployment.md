# Cloud Run ve Firebase Hosting

Bu dosya production config’idir. Prisma şeması ve PostgreSQL silinmez; rollback `DATA_STORE=postgres` ile yapılır.

## Cloud Run (NestJS)

Image `backend/Dockerfile` ile üretilir. Secret JSON dosyası image içine kopyalanmaz.

Gerekli runtime env:

```
NODE_ENV=production
PORT=8080
DATA_STORE=firestore
FIREBASE_PROJECT_ID=zirve-ahsap
FIREBASE_REQUIRED=true
FIREBASE_USE_ADC=true
FRONTEND_ORIGINS=https://zirve-ahsap.web.app,https://zirve-ahsap.firebaseapp.com,https://maliyet.zirveahsap.com
```

- Cloud Run servis hesabı Firestore’a Admin erişimi vermelidir (ADC).
- `GOOGLE_APPLICATION_CREDENTIALS` JSON dosyasına bağlanmayın.
- `DATABASE_URL` production Firestore mode’da kullanılmaz; rollback için secret olarak saklanabilir, silinmez.
- CORS `*` yasaktır. `FRONTEND_ORIGINS` allowlist kullanın (Hosting + custom domain).

Sağlık: `GET /health` (`dataStore=firestore` ve `firestore=up` beklenir).

## Firebase Hosting (React)

Mevcut env adı: `VITE_API_URL` (yeni `VITE_API_BASE_URL` eklenmedi).

```
VITE_API_URL=https://<CLOUD-RUN-URL>
VITE_BASE=/
```

- Hosting kök veya `maliyet.zirveahsap...` subdomain: `VITE_BASE=/`
- Mevcut path (`.../maliyet/`): `VITE_BASE=/maliyet/`
- Production build `VITE_API_URL` olmadan localhost’a düşmez.

```
cd frontend
npx firebase deploy --only hosting --config ../firebase.json
```
