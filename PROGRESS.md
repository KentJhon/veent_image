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
- @immich/sdk integration (built from Immich source)
- Docker Compose for full stack
- Dockerfile for SvelteKit app

### Phase 2 — Events & Photo Upload ✅
- Event CRUD with automatic Immich album provisioning
- Photographer assignment system (by email)
- Drag-and-drop multi-file upload with per-file progress
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
- pgvector cosine similarity search scoped to event albums
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

## API Endpoints (16 total)
| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `/api/events` | GET, POST | List & create events |
| `/api/events/[id]` | GET | Event details |
| `/api/events/[id]/photographers` | GET, POST, DELETE | Manage photographers |
| `/api/events/[id]/photos` | GET | Paginated album photos |
| `/api/events/[id]/upload` | POST | Photo upload to Immich |
| `/api/events/[id]/purchased` | GET | User's purchased asset IDs |
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

## Components (4)
- `PhotoGrid` — Responsive image grid with selection
- `PhotoLightbox` — Full-screen preview with keyboard nav
- `PhotoUploader` — Drag-and-drop multi-file upload with progress
- `SelfieCapture` — Camera/file capture with validation tips

## Immich Setup (Local Dev)
- Admin email: `admin@eventsnap.local`
- Admin password: `eventsnap-admin-2026`
- API key: stored in `sveltekit-app/.env` (not committed)
- Service user ID: `e84563ba-489b-4e2f-a3e3-dd23aa4a3149`
- Read-only DB role: `sveltekit_ro` on Immich Postgres

## Running Locally
```bash
# 1. Start Immich
cd immich-main/docker && docker compose up -d

# 2. Start app database
docker run -d --name eventsnap-postgres \
  -e POSTGRES_DB=eventsnap -e POSTGRES_USER=app -e POSTGRES_PASSWORD=apppassword \
  -p 5434:5432 postgres:16-alpine

# 3. Push schema
cd sveltekit-app && cp .env.example .env  # then fill in real values
npx drizzle-kit push

# 4. Start dev server
npm run dev
```

## Next Steps
- [ ] Integrate real payment provider (Stripe)
- [ ] Add Google OAuth for production auth
- [ ] CDN for watermarked thumbnails (Cloudflare)
- [ ] Bundle ZIP download for multi-photo purchases
- [ ] Role-based access control (admin vs user vs photographer)
- [ ] Privacy policy page (biometric data disclosure)
- [ ] End-to-end tests
- [ ] Production Docker Compose with reverse proxy
