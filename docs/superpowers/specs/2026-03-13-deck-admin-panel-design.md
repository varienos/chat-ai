# Deck — VarienAI Gateway Yönetim Paneli

**Tarih:** 2026-03-13
**Durum:** Onaylandı

## Özet

VarienAI gateway için React tabanlı yönetim paneli. Gateway'in monorepo'sunda `deck/` klasöründe yaşar, `/deck` path'inden serve edilir. Env ayarlarını runtime'da değiştirme, veritabanındaki oturum konuşmalarını inceleme, analitik dashboard, test chat ve embedded OpenAPI docs sunar.

## Kararlar

| Karar | Seçim | Gerekçe |
|-------|-------|---------|
| Proje yapısı | Monorepo `deck/` | Gateway'e yakın, tek repo yönetimi |
| URL path | `/deck` | Kullanıcı tercihi |
| Env ayarları | Hibrit (runtime + restart) | Bazı ayarlar hot-reload destekler, bazıları doğası gereği restart ister |
| Oturum görüntüleme | Liste + detay + analitik | Provider bazlı istatistikler, filtreleme, konuşma replay |
| Test chat | Basit streaming chat | Deck proxy endpoint `/deck/api/chat/stream` → ChatService.chatStream() |
| Auth | Kullanıcı adı + şifre (env) | JWT tabanlı, `DECK_ADMIN_USER` / `DECK_ADMIN_PASSWORD` |
| OpenAPI | Deck içinde protected OpenAPI viewer | Deck JWT ile korunan, Swagger UI iframe'den bağımsız çalışan sayfa |
| Layout | Top Nav + içerik | Geniş ekran kullanımı, modern görünüm |
| Frontend stack | Vite + React 19 + Tailwind | Modern tooling, hızlı geliştirme |
| Yaklaşım | SPA, gateway static serve | Production build `deck/dist/`, tek port deploy |

## Mimari

### Genel Yapı

```
┌─────────────────────────────────────────────────────┐
│                    Tarayıcı                          │
│  React SPA (/deck/*)                                │
│  - Dashboard, Oturumlar, Ayarlar, Chat, API Docs    │
└───────────────────┬─────────────────────────────────┘
                    │ HTTP (JWT auth)
                    ▼
┌─────────────────────────────────────────────────────┐
│              Fastify Gateway                         │
│                                                      │
│  /deck/*        → static serve (production)          │
│  /deck/api/*    → deck backend routes (JWT auth)     │
│  /api/*         → mevcut gateway routes (bearer)     │
│  /docs/*        → Swagger UI                         │
└───────┬──────────────┬──────────────────────────────┘
        │              │
        ▼              ▼
┌──────────────┐ ┌──────────────┐
│  PostgreSQL  │ │    Redis     │
│  oturumlar   │ │  cache +     │
│  mesajlar    │ │  runtime     │
│              │ │  settings    │
└──────────────┘ └──────────────┘
```

### Backend — Yeni Dosyalar

```
src/deck/
├── deck-routes.ts          # Tüm /deck/api/* route'larını register eder
├── deck-auth.ts            # JWT auth middleware + login/me handler
├── deck-settings.ts        # RuntimeConfigStore + settings endpoint'leri
├── deck-sessions.ts        # Oturum listeleme, detay, istatistik endpoint'leri
└── deck-static.ts          # Production'da deck/dist/ static serve
```

### Frontend — Dosya Yapısı

```
deck/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx                   # Router + layout
│   ├── api/
│   │   └── client.ts            # Fetch wrapper (JWT header, base URL)
│   ├── auth/
│   │   ├── AuthContext.tsx       # JWT state, login/logout
│   │   ├── ProtectedRoute.tsx   # Auth guard
│   │   └── LoginPage.tsx
│   ├── layout/
│   │   └── TopNav.tsx
│   ├── pages/
│   │   ├── DashboardPage.tsx    # KPI kartları + grafikler
│   │   ├── SessionsPage.tsx     # Oturum listesi + filtreler
│   │   ├── SessionDetailPage.tsx
│   │   ├── SettingsPage.tsx     # Tab'lı ayar formları
│   │   ├── ChatPage.tsx         # Test chat (streaming)
│   │   └── ApiDocsPage.tsx      # Protected OpenAPI viewer (swagger-ui-react veya @scalar/api-reference-react)
│   └── components/
│       ├── KpiCard.tsx
│       ├── ChatBubble.tsx
│       ├── SettingField.tsx
│       └── ProviderBadge.tsx
```

### Frontend Kütüphaneler

| Kütüphane | Amaç |
|-----------|------|
| React 19 + React Router | SPA routing |
| Recharts | Dashboard grafikleri |
| TanStack Query | API state management + cache |
| Tailwind CSS | Utility-first styling |
| @scalar/api-reference-react | OpenAPI spec viewer (read-only, interaktif request kapalı) |

## API Endpoint'leri

### Deck Auth

| Endpoint | Method | Auth | Açıklama |
|----------|--------|------|----------|
| `/deck/api/auth/login` | POST | Yok | `{ username, password }` → `{ token }` |
| `/deck/api/auth/me` | GET | JWT | Token geçerliliği + kullanıcı bilgisi |

**Auth mekanizması:**
- `DECK_ADMIN_USER` ve `DECK_ADMIN_PASSWORD` env var'larından okunur
- Login'de JWT üretilir (secret: `DECK_JWT_SECRET` — zorunlu, fallback yok)
- JWT süresi: 24 saat
- Frontend: localStorage'da saklanır, her istekte `Authorization: Bearer <jwt>` header'ı
- 401 döndüğünde otomatik login'e yönlendirme
- Login endpoint'e rate limiting uygulanır (5 deneme / dakika, IP bazlı)

**Gateway auth hook entegrasyonu:**
- Gateway'in global `onRequest` hook'u tüm non-public path'lerde bearer token auth zorlar
- `/deck` prefix'i `PUBLIC_PATH_PREFIXES`'e eklenir → gateway bearer auth'u deck route'larını atlar
- Deck kendi JWT auth middleware'ini `/deck/api/*` route'larına uygular (login hariç)
- `/deck/api/auth/login` public kalır, diğer tüm `/deck/api/*` route'ları JWT gerektirir
- Static asset'ler (`/deck/*` non-API) auth gerektirmez (SPA dosyaları)

**Güvenlik notları:**
- CSRF koruması gerekmez: bearer header pattern'i tarayıcının otomatik credential gönderimini engeller
- localStorage XSS riski kabul edilmiştir; CSP header'ları ile mitigasyon sağlanır
- `DECK_JWT_SECRET` ile `API_AUTH_TOKEN` kasıtlı olarak ayrı tutulur (farklı güvenlik sınırları)

### Deck Settings

| Endpoint | Method | Auth | Açıklama |
|----------|--------|------|----------|
| `/deck/api/settings` | GET | JWT | Tüm ayarları getir (runtime + static, kategori bilgisiyle) |
| `/deck/api/settings` | PATCH | JWT | Runtime ayarlarını güncelle |

**Runtime Settings mekanizması:**

```
.env (default) → loadConfig() → base config
                                      ↓
Redis deck:settings:* (override) → RuntimeConfigStore
                                      ↓
                              getEffectiveConfig() → merge sonucu
```

**Runtime değişebilir ayarlar (🔄 canlı):**
- `systemPrompt` — chat system prompt'u
- `rateLimitMaxRequests` — rate limit istek sayısı
- `rateLimitWindowMs` — rate limit penceresi
- `recentMessageLimit` — session'da tutulan son mesaj sayısı

**Restart gerektiren ayarlar (🔒 read-only):**
- `port`, `host` — sunucu bağlantısı
- `databaseUrl`, `redisUrl` — depolama bağlantıları
- `requestBodyLimitBytes` — Fastify `bodyLimit` app oluşturulurken set edilir, runtime'da değiştirilemez
- `*BinaryPath` — CLI yolları
- `enabledProviders`, `defaultProvider` — provider konfigürasyonu

**Provider ayarları (🔒 restart):**
- Provider tab'ındaki tüm ayarlar (timeout, model, sandbox, permissionMode) restart gerektirir
- Çünkü provider instance'ları startup'ta oluşturulur ve constructor option'ları sonradan değiştirilemez

Ayar değişiklikleri mevcut aktif istekleri etkilemez, sonraki isteklerden itibaren geçerli olur.

**Hot-reload mekanizması — mevcut servislere etki:**
- `ChatService`: constructor option olarak aldığı `systemPrompt` ve `recentMessageLimit` değerlerini her istekte `RuntimeConfigStore.getEffectiveConfig()` üzerinden okuyacak şekilde refactor edilir
- Rate limiter: `rateLimitMaxRequests` ve `rateLimitWindowMs` her istek kontrolünde `getEffectiveConfig()` üzerinden okunur (mevcut yapıda zaten request-time'da `config` objesi okunuyor, bu `RuntimeConfigStore` ile değiştirilir)
- Provider ayarları runtime'da değişmez — sadece `ChatService` ve rate limiter parametreleri hot-reload destekler

### Deck Sessions

| Endpoint | Method | Auth | Açıklama |
|----------|--------|------|----------|
| `/deck/api/sessions` | GET | JWT | Sayfalı oturum listesi |
| `/deck/api/sessions/:id` | GET | JWT | Oturum detayı + tüm mesajlar |
| `/deck/api/sessions/stats` | GET | JWT | Provider bazlı istatistikler |

**Filtreler (query params):**
- `provider` — codex, claude, gemini
- `from` / `to` — tarih aralığı
- `search` — mesaj içeriğinde arama
- `page` / `limit` — sayfalama

**Stats response (veri kaynağı: PostgreSQL):**
- Provider bazlı: toplam oturum, toplam mesaj, ortalama latency (`AVG(latency_ms)` from `chat_messages`), hata oranı (`COUNT(error_code IS NOT NULL) / COUNT(*)`)
- Genel: aktif oturum sayısı (Redis'ten), bugünkü mesaj sayısı
- Son 7 gün mesaj hacmi (günlük, provider bazlı — `GROUP BY DATE(created_at), provider`)

**Not:** Dashboard KPI'ları PostgreSQL sorguları ile hesaplanır (kalıcı, restart'a dayanıklı). `MetricsRegistry` sadece real-time aktif istek sayısı için kullanılır.

**Filtre: `search` parametresi:**
- `ILIKE '%keyword%'` ile `chat_messages.content` üzerinde arama
- Orta ölçekli veri için yeterli; büyük veri setlerinde `pg_trgm` index eklenebilir (gelecek iterasyon)

### Test Chat

| Endpoint | Method | Auth | Açıklama |
|----------|--------|------|----------|
| `/deck/api/chat/stream` | POST | JWT | Deck proxy — dahili olarak ChatService'i çağırır |

Frontend doğrudan `/api/chat/stream` çağırmaz (gateway bearer token'ını ifşa etmemek için). Bunun yerine `/deck/api/chat/stream` proxy endpoint'i JWT ile auth yapar ve server-side'da `ChatService.chatStream()` metodunu doğrudan çağırır. Request/response formatı mevcut `/api/chat/stream` ile aynıdır (SSE streaming).

### OpenAPI Docs

| Endpoint | Method | Auth | Açıklama |
|----------|--------|------|----------|
| `/deck/api/openapi-spec` | GET | JWT | OpenAPI JSON spec'ini döner |

**Neden iframe embed değil:**
- Swagger UI (`/docs`) sadece non-production'da register ediliyor (`register-openapi.ts:49`)
- Production'da `/docs` public path'lerde değil (`app.ts:47`)
- iframe için `X-Frame-Options` veya CSP `frame-ancestors` yönetimi gereksiz karmaşıklık ekler

**Yaklaşım:** Deck kendi OpenAPI viewer'ını read-only modda render eder:
- `/deck/api/openapi-spec` endpoint'i gateway'in OpenAPI spec'ini JSON olarak döner (Deck JWT ile korunan)
- Frontend'de `@scalar/api-reference-react` ile spec render edilir
- Bu sayede production/non-production farkı ortadan kalkar — spec her zaman mevcuttur
- Swagger UI'ın gateway'e register edilip edilmemesinden bağımsız çalışır

**"Try it out" / interaktif çağrı sorunu:**
- Gateway'in OpenAPI spec'i `bearerAuth` (API_AUTH_TOKEN) şeması tanımlıyor (`register-openapi.ts:19`)
- Deck kullanıcısının bu token'ı bilmemesi gerekiyor → interaktif "Try it out" çalışmaz veya yanlış secret ister
- **Çözüm:** Viewer read-only modda açılır — `@scalar/api-reference-react`'te `hiddenClients: true` ve interaktif request çalıştırma kapatılır
- Spec sadece endpoint dökümantasyonu (path, request/response şemaları, açıklamalar) olarak gösterilir
- Gerçek API test ihtiyacı için Test Chat sayfası (`/deck/chat`) ve ileride eklenecek karşılaştırmalı chat kullanılır

## Backend Gereksinimleri

### Yeni Repository Metodları (SessionArchiveRepository)

Mevcut interface sadece `appendMessage`, `createSession`, `updateSession` destekliyor. Aşağıdaki metodlar eklenmeli:

```typescript
// Oturum listeleme — tek bir filtreli kontrat (listeleme + arama birleşik)
// search parametresi verilirse chat_messages.content üzerinde ILIKE arar
// ve eşleşen mesajı içeren session'ları döner
listSessions(filters: {
  provider?: ProviderName;
  from?: Date;
  to?: Date;
  search?: string;         // mesaj içeriğinde ILIKE arama
  page: number;
  limit: number;
  sortBy?: "last_activity_at" | "started_at" | "message_count";
  sortOrder?: "asc" | "desc";  // default: "desc"
}): Promise<{ sessions: SessionRecord[]; total: number }>

// Oturum detayı + tüm mesajlar
getSessionWithMessages(id: string): Promise<{
  session: SessionRecord;
  messages: StoredChatMessage[];
} | null>

// İstatistikler (dashboard KPI'ları)
getSessionStats(dateRange?: { from: Date; to: Date }): Promise<{
  byProvider: Record<ProviderName, {
    totalSessions: number;
    totalMessages: number;
    avgLatencyMs: number;
    errorRate: number;
  }>;
  dailyVolume: Array<{ date: string; provider: ProviderName; count: number }>;
}>
```

**SQL notu:** `search` parametresi `EXISTS (SELECT 1 FROM chat_messages WHERE session_id = s.id AND content ILIKE '%keyword%')` subquery ile uygulanır. Ayrı `searchMessages` metodu yoktur — tek `listSessions` kontratı hem filtreleme hem arama kapsar.

### RuntimeConfigStore (yeni)

```typescript
// Değiştirilebilir ayarların canonical key'leri ve tipleri
// Bu map hem validation hem de Redis key mapping için tek kaynak
const MUTABLE_SETTINGS = {
  "chat.systemPrompt":             { redisKey: "deck:settings:chat.systemPrompt",             type: "string" as const },
  "chat.recentMessageLimit":       { redisKey: "deck:settings:chat.recentMessageLimit",       type: "number" as const, min: 1, max: 100 },
  "security.rateLimitMaxRequests": { redisKey: "deck:settings:security.rateLimitMaxRequests", type: "number" as const, min: 1, max: 10000 },
  "security.rateLimitWindowMs":    { redisKey: "deck:settings:security.rateLimitWindowMs",    type: "number" as const, min: 1000, max: 3600000 },
} as const;

type MutableSettingKey = keyof typeof MUTABLE_SETTINGS;

class RuntimeConfigStore {
  constructor(private redis: RedisClient, private baseConfig: AppConfig) {}

  // Redis override'ları base config ile merge eder
  // Sadece MUTABLE_SETTINGS'teki key'ler override edilebilir
  async getEffectiveConfig(): Promise<AppConfig>

  // Typed key ile ayar güncelle — MUTABLE_SETTINGS'te yoksa hata fırlatır
  // type: "number" ise parse + min/max validation uygulanır
  async setValue(key: MutableSettingKey, value: string): Promise<void>

  // Tüm override'ları getir (sadece MUTABLE_SETTINGS key'leri)
  async getOverrides(): Promise<Partial<Record<MutableSettingKey, string>>>

  // Override'ı sil (default'a dön)
  async clearValue(key: MutableSettingKey): Promise<void>
}
```

**Validation akışı:**
1. `PATCH /deck/api/settings` gelen key'ler `MUTABLE_SETTINGS`'te var mı → yoksa 400
2. Her key'in type'ına göre coerce: `"number"` → `parseInt/parseFloat` + `min`/`max` kontrolü → geçersizse 400
3. Geçerli değerler Redis'e `deck:settings:{canonical.path}` key'leriyle yazılır
4. `getEffectiveConfig()` Redis'teki override'ları `baseConfig`'in ilgili nested alanlarına merge eder

### Mevcut Servis Refactor'ları

- `ChatService`: `systemPrompt` ve `recentMessageLimit`'i constructor'dan almak yerine her istekte `RuntimeConfigStore.getEffectiveConfig()` üzerinden okur
- `registerSecurityHooks()` (`app.ts`): `/deck` prefix'i `PUBLIC_PATH_PREFIXES`'e eklenir
- Rate limiter: config değerleri her kontrolde `RuntimeConfigStore`'dan okunur

## Sayfalar

### 1. Login (`/deck/login`)

Basit form: kullanıcı adı + şifre. JWT token alınır, localStorage'a kaydedilir, dashboard'a yönlendirilir.

### 2. Dashboard (`/deck/dashboard`)

- **4 KPI kartı:** Aktif oturumlar, toplam mesaj, ortalama latency, hata oranı (trend göstergeli)
- **Mesaj hacmi grafiği:** Son 7 gün, çizgi grafik, provider bazlı renk kodlu (Recharts)
- **Provider dağılımı:** Donut chart — codex / claude / gemini oranları
- **Provider durumları:** Her provider'ın auth status'u (🟢/🔴) ve modu (oauth/api_key)

### 3. Oturumlar (`/deck/sessions`)

**Liste görünümü:**
- Tablo: ID, provider, mesaj sayısı, son aktivite, durum
- Filtreler: provider dropdown, tarih aralığı, mesaj içeriği arama
- Sayfalama

**Detay görünümü (`/deck/sessions/:id`):**
- Oturum metadata (provider, mesaj sayısı, ortalama latency — detay sayfasında hesaplanır, durum)
- Konuşma: chat baloncukları, her mesajda latency + provider + finish_reason metadata'sı

**Not:** Ortalama latency yalnızca detay sayfasında gösterilir (liste sayfasında değil). Detay sayfasında zaten tüm mesajlar yüklendiği için ek sorgu gerektirmez.

### 4. Ayarlar (`/deck/settings`)

**Tab yapısı:**
- **Genel:** system prompt, recent message limit
- **Provider:** provider bazlı ayarlar (timeout, model, sandbox vs.)
- **Güvenlik:** rate limit (🔄 canlı), request body limit (🔒 restart)
- **Depolama:** database URL, redis URL (read-only)

Her ayarın yanında etiket:
- 🔄 **canlı** — runtime'da değişebilir, kaydet butonuyla hemen etkili
- 🔒 **restart** — read-only gösterilir, değişiklik için .env düzenlenmeli

### 5. Test Chat (`/deck/chat`)

- Provider seçimi: pill butonları (codex / claude / gemini — sadece aktif provider'lar)
- Chat alanı: streaming mesajlar, chat baloncukları
- Her cevabın altında: latency, provider, streaming durumu
- Mevcut gateway ayarlarıyla çalışır (system prompt, timeout vs.)
- Auth: Deck JWT ile `/deck/api/chat/stream` proxy endpoint'i (gateway bearer token frontend'e ifşa edilmez)

### 6. API Docs (`/deck/api-docs`)

Deck kendi OpenAPI viewer'ını read-only modda render eder. `/deck/api/openapi-spec` endpoint'inden JSON spec çekilir, `@scalar/api-reference-react` ile interaktif request çalıştırma kapalı şekilde gösterilir. Endpoint dökümantasyonu, request/response şemaları ve açıklamalar görüntülenir. Swagger UI'ın gateway'e register edilip edilmemesinden bağımsız çalışır (production dahil). Panel navigasyonu üstte kalır.

## Veri Akışları

### Auth Akışı

```
LoginPage → POST /deck/api/auth/login { username, password }
         → { token: "jwt..." }
         → localStorage.setItem("deck_token", token)
         → AuthContext güncellenir
         → Dashboard'a navigate
```

Token süresi dolduğunda:
```
API call → 401 → AuthContext token'ı temizler → Login'e redirect
```

### Runtime Settings Akışı

```
SettingsPage → PATCH /deck/api/settings { systemPrompt: "..." }
            → RuntimeConfigStore → Redis deck:settings:systemPrompt yazılır
            → Sonraki ChatService isteği → getEffectiveConfig()
            → Redis'te override varsa onu kullanır, yoksa .env default
```

### Streaming Chat Akışı

```
ChatPage → POST /deck/api/chat/stream { message, provider, sessionId }
        → Deck JWT auth doğrulanır
        → Server-side: ChatService.chatStream() çağrılır
        → SSE stream açılır
        → event: session.started → session ID kaydedilir
        → event: assistant.delta → chunk ChatBubble'a append (streaming efekti)
        → event: assistant.completed → final content + metadata gösterilir
```

**Not:** Frontend gateway'in `API_AUTH_TOKEN`'ını asla görmez. Deck proxy endpoint'i JWT auth'u doğruladıktan sonra ChatService'i doğrudan çağırır.

## Hata Yönetimi

| Senaryo | Davranış |
|---------|----------|
| API hataları (5xx) | TanStack Query: 3 deneme, exponential backoff + toast notification |
| Auth hataları (401) | Otomatik login'e yönlendirme |
| Network kesintisi | "Bağlantı kesildi" banner'ı (üst bar) |
| SSE stream hatası | Chat'te "Yanıt alınamadı" + tekrar dene butonu |
| Settings kayıt hatası | Form'da inline hata mesajı |

## Gateway Entegrasyonu

### Vite Config (dev)

```typescript
// deck/vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/deck/api': 'http://localhost:3000',
      '/api': 'http://localhost:3000',
    }
  },
  base: '/deck/',
})
```

### Static Serve (production)

```typescript
// src/deck/deck-static.ts
// Fastify @fastify/static ile deck/dist/ → /deck/* serve
// SPA fallback: /deck/* catch-all → index.html
```

**Yeni backend dependency:**
- `@fastify/static` root `package.json`'a explicit production dependency olarak eklenir
- Şu an transitive olarak lockfile'da mevcut olabilir ama doğrudan import edilecek → explicit olmalı
- `npm install @fastify/static` (veya package.json'a eklenerek `npm ci`)

### Route Registration

```typescript
// src/app.ts'e eklenir
import { registerDeckRoutes } from "./deck/deck-routes.js";
import { registerDeckStatic } from "./deck/deck-static.js";

// ÖNEMLİ: Registration sırası
// 1. Deck API routes ÖNCE (JWT auth ile korunan)
registerDeckRoutes(app, config, services);

// 2. Deck static serve SONRA (SPA catch-all /deck/* → index.html)
// @fastify/static wildcard: false ile API route'larının üzerine yazılması engellenir
registerDeckStatic(app);
```

## Build & Deploy Zinciri

### Workspace Yapısı

npm workspaces kullanılmaz — `deck/` kendi bağımsız `package.json`'ına sahip ayrı bir Vite projesidir. Root `package.json` sadece backend'i build eder. İki proje arasında TypeScript paylaşımı yoktur (API kontratı JSON schema üzerinden tanımlıdır).

### Root package.json Değişiklikleri

```jsonc
{
  "scripts": {
    "build": "tsc",                          // mevcut — sadece backend
    "build:deck": "cd deck && npm ci && npm run build",  // yeni — deck frontend
    "build:all": "npm run build && npm run build:deck",  // yeni — her ikisi
    "dev": "tsx watch src/server.ts",        // mevcut — sadece backend
    "dev:deck": "cd deck && npm run dev"     // yeni — deck dev server (ayrı terminal)
  }
}
```

### deck/package.json

```jsonc
{
  "name": "varienai-deck",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",   // çıktı: deck/dist/
    "preview": "vite preview"
  }
}
```

### Docker Entegrasyonu

Mevcut Dockerfile'ın runtime strategy'si korunur (`node:22-bookworm-slim` + `npm ci --omit=dev`). Yalnızca deck build stage'i ve `deck/dist` kopyası eklenir:

```dockerfile
# --- Mevcut stage'ler aynen kalır (base, build, dev) ---

# --- Yeni: deck frontend build (bağımsız stage) ---
FROM node:22-bookworm-slim AS deck-build
WORKDIR /app/deck
COPY deck/package*.json ./
RUN npm ci
COPY deck/ .
RUN npm run build
# Çıktı: /app/deck/dist/ (sadece static asset'ler — HTML, JS, CSS)

# --- Mevcut runtime stage — sadece 1 satır eklenir ---
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm i -g @openai/codex@latest @google/gemini-cli@latest @anthropic-ai/claude-code@latest

COPY package.json package-lock.json ./
RUN npm ci --omit=dev                                  # mevcut — sadece production deps

COPY --from=build /app/dist ./dist                     # mevcut — compiled backend
COPY --from=build /app/scripts ./scripts               # mevcut
COPY sql ./sql                                         # mevcut
COPY --from=deck-build /app/deck/dist ./deck/dist      # ← tek yeni satır

ENV NODE_ENV=production
```

**Önemli:**
- Runtime stage mevcut `npm ci --omit=dev` modelini korur — dev dependency taşınmaz
- `deck-build` stage'inden yalnızca `deck/dist/` (static HTML/JS/CSS) kopyalanır — deck'in `node_modules`'ü runtime'a girmez
- `deck-static.ts` `deck/dist/` klasörünün varlığını kontrol eder; yoksa static serve register edilmez (deck'siz deploy mümkün kalır)

### tsconfig.json

Backend `tsconfig.json` deck'i kapsamaz — `deck/` kendi `tsconfig.json`'ına sahiptir. Root `tsconfig.json`'da `exclude` listesine `"deck"` eklenir (zaten `node_modules` gibi dışarıda olan klasörlere benzer şekilde):

```jsonc
{
  "exclude": ["node_modules", "dist", "deck"]
}
```

### Dev Workflow

```bash
# Terminal 1: Backend
npm run dev

# Terminal 2: Deck frontend (Vite dev server, gateway'e proxy)
npm run dev:deck
```

Production build: `npm run build:all` veya Docker multi-stage build.

## Env Değişkenleri (yeni)

| Değişken | Default | Açıklama |
|----------|---------|----------|
| `DECK_ADMIN_USER` | `admin` | Panel giriş kullanıcı adı |
| `DECK_ADMIN_PASSWORD` | — (zorunlu) | Panel giriş şifresi |
| `DECK_JWT_SECRET` | — (zorunlu) | JWT imzalama secret'ı (API_AUTH_TOKEN'dan kasıtlı olarak ayrı) |

## Gelecek İterasyonlar (kapsam dışı)

- **Karşılaştırmalı chat:** Aynı prompt'u birden fazla provider'a gönder, cevapları yan yana karşılaştır (ayrı backlog task)
- **Canlı oturum izleme:** Real-time WebSocket ile aktif oturumları izle
- **Export:** Konuşmaları JSON/CSV olarak export et
- **Çoklu kullanıcı:** Rol tabanlı erişim kontrolü
