# EventSnap

Event photo platform with AI face matching and OCR text search. Built on SvelteKit + Immich.

Attendees find their photos by uploading a selfie (face recognition) or searching for visible text (bib numbers, signs, banners). Photos are watermarked for preview and sold as originals.

## Architecture

```
SvelteKit App (:3000)
  ├── App Database (PostgreSQL 16, :5434)     — events, users, purchases
  ├── Immich Server (:2283)                   — photo storage, albums, REST API
  │     ├── Immich PostgreSQL (:5435)         — assets, faces, OCR, pgvector
  │     ├── Immich ML Service (:3003)         — face detection, recognition, OCR
  │     └── Redis/Valkey                      — job queues
  └── Watermark Engine (sharp, in-process)    — on-serve watermarking
```

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (with Docker Compose v2)
- [Node.js 22+](https://nodejs.org/) (only needed for local dev without Docker)
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (optional, for external/mobile testing)

## Quick Start

### 1. Clone and configure environment

```bash
git clone https://github.com/KentJhon/veent_image.git
cd veent_image

# Copy example env and create data directories
cp .env.example .env
mkdir -p ./immich-data ./immich-db
```

### 2. Start all services

```bash
docker compose up -d
```

This starts 6 containers:

| Service | Container | Port | Purpose |
|---------|-----------|------|---------|
| Immich Server | `immich_server` | 2283 | Photo storage & REST API |
| Immich ML | `immich_machine_learning` | 3003 | Face detection, recognition, OCR |
| Immich DB | `immich_postgres` | 5435 | Assets, faces, embeddings (pgvector) |
| Redis | `immich_redis` | — | Job queues |
| App DB | `eventsnap_postgres` | 5434 | Events, users, purchases |
| SvelteKit App | `eventsnap_app` | 3000 | Main web application |

### 3. Set up Immich admin account

Open http://localhost:2283 and create an admin account. Alternatively:

```bash
curl -X POST http://localhost:2283/api/auth/admin-sign-up \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@eventsnap.local","password":"adminpassword123","name":"Admin"}'
```

Then log in and:
1. Go to **Administration > API Keys** and create a key with all permissions
2. Note your **User ID** from the account settings
3. Update `.env` with these values:

```
IMMICH_ADMIN_API_KEY=your-api-key-here
IMMICH_SERVICE_USER_ID=your-user-id-here
```

### 4. Create read-only database user

The app needs read-only access to Immich's database for face matching and OCR search:

```bash
docker exec immich_postgres psql -U postgres -d immich -c "
  CREATE ROLE sveltekit_ro WITH LOGIN PASSWORD 'readonly_password';
  GRANT CONNECT ON DATABASE immich TO sveltekit_ro;
  GRANT USAGE ON SCHEMA public TO sveltekit_ro;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO sveltekit_ro;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO sveltekit_ro;
"
```

### 5. Generate auth secret

```bash
# Generate a secure random secret and put it in .env as AUTH_SECRET
openssl rand -hex 32
```

### 6. Rebuild the app with your updated .env

```bash
docker compose up -d --build sveltekit-app
```

### 7. Access the app

- **Local**: http://localhost:3000
- **Immich admin**: http://localhost:2283

## External Access (Cloudflare Tunnel)

For testing on mobile or sharing with others over HTTPS:

```bash
cloudflared tunnel --url http://localhost:3000
```

This gives you a public `https://*.trycloudflare.com` URL. The app is already configured to accept these as trusted origins for CSRF.

## Development (without Docker for the app)

If you want to run the SvelteKit app outside Docker for hot-reload:

```bash
# Start only the infrastructure services
docker compose up -d database redis immich-server immich-machine-learning app-database

# Install dependencies and push schema
cd sveltekit-app
npm install
APP_DATABASE_URL=postgresql://app:apppassword@localhost:5434/app npx drizzle-kit push

# Start dev server with env vars
IMMICH_API_URL=http://localhost:2283/api \
IMMICH_API_KEY=<your-api-key> \
IMMICH_ML_URL=http://localhost:3003 \
IMMICH_DB_URL=postgresql://sveltekit_ro:readonly_password@localhost:5435/immich \
IMMICH_SERVICE_USER_ID=<your-user-id> \
APP_DATABASE_URL=postgresql://app:apppassword@localhost:5434/app \
AUTH_SECRET=<your-secret> \
AUTH_TRUST_HOST=true \
npm run dev -- --host
```

The dev server runs on http://localhost:5173 with hot-reload.

## Common Commands

```bash
# Start everything
docker compose up -d

# Rebuild app after code changes
docker compose up -d --build sveltekit-app

# View logs
docker compose logs -f sveltekit-app
docker compose logs -f immich-server

# Stop everything
docker compose down

# Stop and remove volumes (full reset)
docker compose down -v

# Check service health
docker compose ps
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `UPLOAD_LOCATION` | Yes | `./immich-data` | Immich photo storage path |
| `DB_DATA_LOCATION` | Yes | `./immich-db` | Immich database files path |
| `DB_PASSWORD` | Yes | `postgres` | Immich database password |
| `APP_DB_PASSWORD` | Yes | `apppassword` | App database password |
| `AUTH_SECRET` | Yes | — | Random secret for session signing |
| `IMMICH_ADMIN_API_KEY` | Yes | — | Immich API key (all permissions) |
| `IMMICH_SERVICE_USER_ID` | Yes | — | Immich admin user UUID |
| `IMMICH_RO_USER` | No | `sveltekit_ro` | Read-only Immich DB username |
| `IMMICH_RO_PASS` | Yes | `readonly_password` | Read-only Immich DB password |
| `AUTH_GOOGLE_ID` | No | — | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | No | — | Google OAuth client secret |

## Project Structure

```
veent_image/
├── docker-compose.yml          # Full stack orchestration
├── .env.example                # Environment template
├── sveltekit-app/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── components/     # Svelte components (SelfieCapture, TextSearch, etc.)
│   │   │   └── server/         # Server-side code
│   │   │       ├── db/         # Drizzle ORM schema + connections
│   │   │       ├── services/   # Business logic (events, face-match, photos)
│   │   │       ├── immich.ts   # Immich SDK wrapper + OCR search
│   │   │       └── face-match.ts # ML face embedding + pgvector search
│   │   └── routes/
│   │       ├── (app)/          # Authenticated pages
│   │       └── api/            # REST API endpoints
│   ├── Dockerfile
│   └── package.json
└── PROGRESS.md                 # Detailed development log
```
