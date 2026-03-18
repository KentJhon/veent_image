# EventSnap — Project Progress

## Overview
Event photo gallery platform built on **SvelteKit** with **Immich** as a headless backend for photo storage and AI facial recognition. Attendees find their photos via selfie face matching; photos are watermarked and sold.

## Architecture
```
SvelteKit App (:5173/3000)
  ├── App Database (PostgreSQL 16, :5434)     — events, users, purchases
  ├── Immich Server (:2283)                   — photo storage, albums, REST API
  │     ├── Immich PostgreSQL (:5435)         — assets, faces, pgvector embeddings
  │     ├── Immich ML Service (:3003)         — face detection (RetinaFace), recognition (ArcFace)
  │     └── Redis/Valkey                      — job queues
  └── Watermark Engine (sharp, in-process)    — on-serve watermarking
```

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | SvelteKit 5 (Svelte 5 runes), TypeScript |
| Auth | Auth.js (@auth/sveltekit) + Credentials dev provider |
| ORM | Drizzle ORM + postgres.js |
| Photo Backend | Immich (headless, via REST API + @immich/sdk) |
| Face Matching | Immich ML (buffalo_l/ArcFace) + pgvector cosine similarity |
| Watermarking | sharp (Node.js), 3-layer SVG, on-serve with filesystem cache |
| Payments | Abstract PaymentService interface (stub, Stripe/PayPal TBD) |
| Deployment | Docker Compose (Immich + SvelteKit + 2× PostgreSQL) |

## Completed Phases

### Phase 1 — Project Scaffold & Infrastructure ✅
- SvelteKit project with adapter-node, TypeScript
- Auth.js with Drizzle adapter + dev credentials provider
- Drizzle schema: 10 tables (users, events, albums, purchases, face match sessions, etc.)
- @immich/sdk integration (switched to npm `@immich/sdk@^2.5.6` for Immich v2 compat)
- Docker Compose for full stack (with exposed ports for local dev: ML :3003, Immich DB :5435, App DB :5434)
- Dockerfile for SvelteKit app
- Vite config updated to allow external hosts (tunnel access)

### Phase 2 — Events & Photo Upload ✅
- Event CRUD with automatic Immich album provisioning
- Photographer assignment system (by email)
- Drag-and-drop multi-file upload with per-file progress
- SHA-256 content hash deduplication on uploads (Immich returns `duplicate` status)
- Duplicate detection UI: yellow border + "Duplicate" badge on re-uploaded files
- Photo gallery with pagination
- Event management admin page

### Phase 3 — Watermarking ✅
- 3-layer professional watermark (brand text + copyright + anti-crop lines)
- Configurable via env vars (brand name, opacity, max preview width)
- Resolution cap on unpurchased previews (1200px max)
- Filesystem cache with 24h TTL
- ETag-based HTTP caching on photo proxy
- Admin cache management endpoints + watermark preview

### Phase 4 — Face Matching ✅
- Selfie capture (camera + file upload) with client-side validation
- Image preprocessing (resize, EXIF rotation) before ML
- Direct Immich ML service calls (POST /predict → ArcFace 512-dim embeddings)
- pgvector cosine similarity search scoped to event albums (updated SQL for Immich v2: `album_asset` table)
- Confidence indicators (High/Good/Possible match)
- Session caching + recovery (return to previous results)
- ML health check + timeout handling
- Rate limiting (10 matches/min/IP)

### Phase 5 — Purchase & Download ✅
- Abstract PaymentService interface (stub for dev, Stripe-ready)
- Per-asset purchase records with duplicate detection
- Smart pricing (single = per-photo, bundle = min of sum vs bundle price)
- Purchase-gated original download endpoint
- Purchase history page with download links
- Buy flow wired into face match results

### Phase 6 — Production Hardening ✅
- In-memory rate limiting (face-match, upload endpoints)
- Health check endpoint (/api/health — Immich + ML status)
- Graceful degradation when Immich is offline
- Admin dashboard with live monitoring
- Docker container log viewer
- Service health indicators with latency
- Live ML job progress bar on upload page (polls `/api/jobs` every 2s)
- `/api/jobs` endpoint — proxies Immich job queue status (face detection, recognition, thumbnails, etc.)

## API Endpoints (17 total)
| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `/api/events` | GET, POST | List & create events |
| `/api/events/[id]` | GET | Event details |
| `/api/events/[id]/photographers` | GET, POST, DELETE | Manage photographers |
| `/api/events/[id]/photos` | GET | Paginated album photos |
| `/api/events/[id]/upload` | POST | Photo upload to Immich |
| `/api/events/[id]/purchased` | GET | User's purchased asset IDs |
| `/api/events/[id]/text-search` | POST | OCR text search in event photos |
| `/api/face-match` | GET, POST | Face matching + session retrieval |
| `/api/photos/[id]` | GET | Watermarked thumbnail proxy |
| `/api/download/[id]` | GET | Purchase-gated original download |
| `/api/purchases` | GET, POST | Purchase history & create intent |
| `/api/purchases/webhook` | POST | Payment webhook |
| `/api/health` | GET | Service health checks |
| `/api/admin/stats` | GET | Application metrics |
| `/api/admin/logs` | GET | Docker container logs |
| `/api/admin/watermark-cache` | GET, DELETE | Cache stats & clearing |
| `/api/admin/watermark-preview` | GET | Test watermark rendering |
| `/api/jobs` | GET | Immich ML job queue status |

## Pages (10 total)
- `/` — Landing page
- `/events` — Event listing + create button
- `/events/new` — Create event form
- `/events/[id]` — Event detail with action cards
- `/events/[id]/photos` — Photo gallery with lightbox
- `/events/[id]/my-photos` — Selfie face matching + buy flow
- `/events/[id]/upload` — Photographer upload (drag & drop)
- `/events/[id]/manage` — Admin: photographers, settings
- `/purchases` — Purchase history with downloads
- `/admin` — Monitoring dashboard (health, metrics, logs)

## Components (5)
- `PhotoGrid` — Responsive image grid with selection
- `PhotoLightbox` — Full-screen preview with keyboard nav
- `PhotoUploader` — Drag-and-drop multi-file upload with progress
- `SelfieCapture` — Camera/file capture with validation tips
- `TextSearch` — OCR text search with mode toggle (contains/exact/starts with/ends with)

## Running Locally
```bash
# 1. Copy env and create data directories
cp .env.example .env    # then fill in API key + service user ID after step 3
mkdir -p ./immich-data ./immich-db

# 2. Start infrastructure
docker compose up -d database redis immich-server immich-machine-learning app-database

# 3. Create Immich admin + API key
#    - Open http://localhost:2283, create admin account
#    - Or use the API:
curl -X POST http://localhost:2283/api/auth/admin-sign-up \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@eventsnap.local","password":"adminpassword123","name":"Admin"}'
#    - Login, create API key with "all" permissions
#    - Put API key and user ID in .env

# 4. Create read-only Immich DB user
docker exec immich_postgres psql -U postgres -d immich -c "
  CREATE ROLE sveltekit_ro WITH LOGIN PASSWORD 'readonly_password';
  GRANT CONNECT ON DATABASE immich TO sveltekit_ro;
  GRANT USAGE ON SCHEMA public TO sveltekit_ro;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO sveltekit_ro;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO sveltekit_ro;
"

# 5. Install deps and push schema
cd sveltekit-app && npm install
APP_DATABASE_URL=postgresql://app:apppassword@localhost:5434/app npx drizzle-kit push

# 6. Start dev server
IMMICH_API_URL=http://localhost:2283/api \
IMMICH_API_KEY=<your-key> \
IMMICH_ML_URL=http://localhost:3003 \
IMMICH_DB_URL=postgresql://sveltekit_ro:readonly_password@localhost:5435/immich \
IMMICH_SERVICE_USER_ID=<your-user-id> \
APP_DATABASE_URL=postgresql://app:apppassword@localhost:5434/app \
AUTH_SECRET=<your-secret> \
AUTH_TRUST_HOST=true \
npm run dev -- --host   # --host exposes on LAN for mobile testing
```

## Session Log — 2026-03-18

### Issues Found & Fixed
1. **`@immich/sdk` broken** — was referencing local `file:../immich-main/open-api/typescript-sdk` that didn't exist. Switched to npm `@immich/sdk@^2.5.6`.
2. **Face match SQL incompatible with Immich v2** — table `albums_assets_assets` renamed to `album_asset`, columns `assetsId`/`albumsId` renamed to `assetId`/`albumId`. Fixed in `face-match.ts`.
3. **No duplicate upload detection** — same photo could be uploaded multiple times. Added SHA-256 content hashing as `deviceAssetId` so Immich deduplicates. UI now shows yellow "Duplicate" badge.
4. **No ML processing feedback** — users couldn't tell when face detection finished. Added `/api/jobs` endpoint and live progress bar on upload page.
5. **Docker ports not exposed for local dev** — Immich ML (:3003), Immich DB (:5435), App DB (:5434) now mapped in docker-compose.yml.
6. **Mobile testing** — used Cloudflare Tunnel (`cloudflared`) for public HTTPS URL. Added `allowedHosts: true` to Vite config.

### Tested & Verified
- End-to-end upload → face detection → selfie matching flow works
- Duplicate upload detection works (same file re-uploaded shows "Duplicate")
- Mobile selfie capture works over HTTPS tunnel
- Face matching returns correct results with distance scoring

## Integration Guide
See [FACE-MATCH-API.md](./FACE-MATCH-API.md) for API docs to integrate face matching as a subsystem.

## Next Steps
- [ ] API key auth for service-to-service calls (bypass session auth)
- [ ] Integrate real payment provider (Stripe)
- [ ] Add Google OAuth for production auth
- [ ] CDN for watermarked thumbnails (Cloudflare)
- [ ] Bundle ZIP download for multi-photo purchases
- [ ] Role-based access control (admin vs user vs photographer)
- [ ] Privacy policy page (biometric data disclosure)
- [ ] End-to-end tests
- [ ] Production Docker Compose with reverse proxy
