# Face Matching API — Integration Guide

## What this subsystem provides

A self-hosted face matching service powered by **Immich ML** (ArcFace 512-dim embeddings) + **pgvector** cosine similarity search. Your main system sends a photo, gets back matching asset IDs.

## Architecture (what needs to be running)

```
Main System ──POST /api/face-match──► EventSnap SvelteKit (:3000)
                                          │
                                          ├── Immich ML (:3003)     ← face detection + embedding extraction
                                          ├── Immich Server (:2283) ← photo storage + album management
                                          ├── Immich PostgreSQL     ← pgvector face embeddings
                                          └── App PostgreSQL        ← events, sessions, users
```

## Core API Endpoint

### `POST /api/face-match`

Submits a photo and returns matching faces from an event album.

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `selfie` | File | Yes | Image file (JPEG/PNG/WebP, max 10MB) |
| `eventId` | string | Yes | UUID of the event to search in |
| `threshold` | string | No | Max cosine distance 0.3–0.8 (default: `0.6`) |

**Response:** `application/json`

```json
{
  "matched": true,
  "totalMatches": 3,
  "assetIds": ["uuid-1", "uuid-2", "uuid-3"],
  "distances": [
    { "assetId": "uuid-1", "distance": 0.312 },
    { "assetId": "uuid-2", "distance": 0.445 },
    { "assetId": "uuid-3", "distance": 0.589 }
  ],
  "personIds": ["person-uuid-1"],
  "facesDetected": 1,
  "sessionId": "session-uuid",
  "error": null
}
```

**Distance interpretation:**

| Distance | Confidence |
|----------|-----------|
| < 0.4 | High — almost certainly the same person |
| 0.4–0.6 | Good — likely the same person |
| 0.6–0.8 | Possible — may be the same person |

**Error cases** (still returns 200 with `matched: false`):

```json
{
  "matched": false,
  "totalMatches": 0,
  "facesDetected": 0,
  "error": "No face detected. Please use a clear, well-lit photo showing your face."
}
```

### `GET /api/face-match?eventId={uuid}`

Retrieves cached results from the last match session (24h TTL). Avoids re-running ML.

### `GET /api/jobs`

Check if uploaded photos have finished ML processing.

```json
{
  "done": true,
  "jobs": [
    { "name": "faceDetection", "active": 0, "waiting": 0, "completed": 10, "failed": 0 }
  ]
}
```

## Example integration (cURL)

```bash
curl -X POST https://your-eventsnap-host/api/face-match \
  -F "selfie=@photo.jpg" \
  -F "eventId=97097679-34dc-4b6e-a06f-5827a426195f" \
  -F "threshold=0.6"
```

## ML Pipeline Details

- **Face Detection:** RetinaFace (buffalo_l model, minScore 0.7)
- **Face Recognition:** ArcFace (buffalo_l, 512-dimensional embeddings)
- **Similarity Search:** pgvector cosine distance (`<=>` operator)
- **Preprocessing:** Auto-rotate EXIF, resize to max 1024px, convert to JPEG
- **Timeout:** 15s for ML inference
- **Rate Limit:** 10 face matches per minute per IP

## Integration decisions for the main system

1. **Auth strategy** — Currently uses Auth.js sessions (cookie-based). For API-to-API calls, you'll likely want to add an API key auth bypass or a service token header.
2. **Asset ID mapping** — Returns Immich asset UUIDs. The main system needs a way to map those to its own photo references.
3. **Photo retrieval** — Matched photos can be fetched via:
   - `GET /api/photos/{assetId}` — watermarked preview
   - `GET /api/download/{assetId}` — original (requires purchase)
4. **Upload integration** — Photos are uploaded via `POST /api/events/{eventId}/upload` (multipart, field name `photos`). Duplicate detection is built in (SHA-256 content hash).

## Docker services required

```yaml
# Minimum for face matching only:
- immich-server           # photo storage
- immich-machine-learning # ML inference (ArcFace + RetinaFace)
- immich-postgres         # pgvector embeddings
- redis                   # job queues
- app-database            # event/session storage
- sveltekit-app           # API layer
```

## Key environment variables

```bash
IMMICH_API_KEY=<admin-api-key>
IMMICH_SERVICE_USER_ID=<immich-admin-user-uuid>
IMMICH_ML_URL=http://immich-machine-learning:3003
IMMICH_DB_URL=postgresql://sveltekit_ro:<pass>@database:5432/immich
APP_DATABASE_URL=postgresql://app:<pass>@app-database:5432/app
AUTH_SECRET=<random-hex-32>
```

## Setup from scratch

```bash
# 1. Copy env and create directories
cp .env.example .env
mkdir -p ./immich-data ./immich-db

# 2. Start all services
docker compose up -d

# 3. Create Immich admin (first time only)
curl -X POST http://localhost:2283/api/auth/admin-sign-up \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@eventsnap.local","password":"adminpassword123","name":"Admin"}'

# 4. Create API key (login first, then create key with "all" permissions)
# Put the API key and user ID in .env as IMMICH_ADMIN_API_KEY and IMMICH_SERVICE_USER_ID

# 5. Create read-only Immich DB user
docker exec immich_postgres psql -U postgres -d immich -c "
  CREATE ROLE sveltekit_ro WITH LOGIN PASSWORD 'readonly_password';
  GRANT CONNECT ON DATABASE immich TO sveltekit_ro;
  GRANT USAGE ON SCHEMA public TO sveltekit_ro;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO sveltekit_ro;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO sveltekit_ro;
"

# 6. Push app database schema
cd sveltekit-app && npm install
APP_DATABASE_URL=postgresql://app:apppassword@localhost:5434/app npx drizzle-kit push
```
