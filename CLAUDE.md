# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**EventSnap** — event photo management platform where attendees find their photos via facial recognition or OCR text search, with watermarking, purchasing, and download. Built with SvelteKit 5 + Immich (headless photo management).

## Tech Stack

- **Frontend/Backend**: SvelteKit 5, Svelte 5 (runes mode), TypeScript 5.9, adapter-node
- **Auth**: Auth.js (@auth/sveltekit) with Drizzle adapter — Credentials + Google OAuth
- **Database**: PostgreSQL 16 (app, port 5434) + Immich PostgreSQL with pgvector (port 5435)
- **ORM**: Drizzle ORM with postgres.js driver
- **Photo Backend**: Immich server (:2283) + Immich ML (:3003) for face embeddings (ArcFace/buffalo_l)
- **Face Matching**: pgvector cosine similarity against Immich's embedding tables
- **Image Processing**: sharp (watermarking, resize, EXIF stripping)
- **Storage**: Immich primary + optional S3-compatible (MinIO :9000/:9001, or R2/Spaces)
- **Containerization**: Docker Compose (7 containers)

## Development Commands

All commands run from `sveltekit-app/`:

```bash
npm run dev          # Dev server on :5173 with HMR
npm run build        # Production build
npm run check        # svelte-check type checking
npm run preview      # Preview production build
```

Infrastructure:
```bash
docker compose up -d                    # Start all services (from repo root)
docker compose ps                       # Check service health
docker compose logs -f sveltekit-app    # App logs
npx drizzle-kit push                    # Push schema to app database
npx drizzle-kit studio                  # Drizzle Studio GUI
```

The `/start` skill starts Docker + a Cloudflare quick tunnel to :3000.

## Architecture

```
SvelteKit App (:3000)
  ├── App DB (PostgreSQL 16, :5434) — users, events, purchases, face_match_sessions
  ├── Immich Server (:2283) — photo storage, ML processing
  │     ├── Immich DB (:5435) — pgvector embeddings
  │     ├── Immich ML (:3003) — ArcFace face detection/embedding
  │     └── Redis/Valkey — job queues
  └── MinIO S3 (:9000) — optional fast-path storage for originals/thumbnails
```

### Key Data Flows

1. **Upload**: Photo → Immich API (triggers ML) → optional async S3 copy
2. **Face Match**: Selfie → Immich ML (extract embedding) → pgvector cosine search on Immich DB → results cached 24h in app DB
3. **Photo View**: Request → S3 (fast) or Immich fallback → sharp watermark → response
4. **OCR Search**: Query → `word_similarity()` + `ILIKE` on Immich's `smart_search.image_text` → ranked results

### Server Code (`sveltekit-app/src/lib/server/`)

- `db/schema.ts` — 9 Drizzle tables (users, events, eventAlbums, purchases, purchaseBundles, faceMatchSessions, photographers)
- `db/immich-readonly.ts` — Read-only connection to Immich PostgreSQL
- `immich.ts` — Immich SDK wrapper + OCR text search
- `face-match.ts` — ML pipeline: sharp preprocessing → Immich ML embedding → pgvector search
- `watermark.ts` — 3-layer watermark (brand text + copyright + anti-crop grid lines)
- `s3.ts` — S3 storage with Immich fallback
- `services/` — Business logic (event, photo, face-match, purchase services)
- `payment.ts` — Abstract PaymentService interface (stub, ready for Stripe)

### Components (`sveltekit-app/src/lib/components/`)

PhotoGrid, PhotoLightbox, PhotoUploader, SelfieCapture, TextSearch — all use Svelte 5 runes.

### Routes

- `/(app)/events/...` — Event CRUD, photo gallery, face matching, upload, management
- `/api/events/*` — Event and photographer CRUD
- `/api/face-match` — POST selfie → matched photos
- `/api/photos/[id]` — Watermarked thumbnail proxy
- `/api/download/[assetId]` — Purchase-gated original download
- `/api/purchases/*` — Commerce endpoints
- `/api/events/[id]/text-search` — OCR search
- `/api/admin/*` — Stats, logs, watermark cache monitoring
- `/api/health` — Service health checks

## Environment Variables

Required: `AUTH_SECRET`, `IMMICH_ADMIN_API_KEY`, `IMMICH_SERVICE_USER_ID`, `IMMICH_RO_PASS`
Optional S3: `S3_URL`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
Optional OAuth: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
See `.env.example` for full list.

## Configuration Notes

- `svelte.config.js` has CSRF origin check disabled for Cloudflare tunnel compatibility
- `vite.config.ts` has `allowedHosts: true` for tunnel access
- User roles: `user | photographer | admin` (defined in schema but role checks not fully enforced yet)
- No test suite exists yet — testing is a gap
- See `AUDIT.md` for 21 security findings (4 critical) that need addressing
