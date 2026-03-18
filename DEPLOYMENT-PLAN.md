# EventSnap — Deployment Plan (Free/Minimal Cost)

## Overview

Deploy the full 6-container EventSnap stack online using **Oracle Cloud Free Tier** (always free, not a trial) with **DuckDNS** for free subdomain + **Caddy** for auto-HTTPS. Total cost: **$0/month**.

## Why Oracle Cloud Free Tier

Oracle is the only provider offering enough free resources for the Immich ML service (needs 2-4GB RAM for ArcFace/RetinaFace models).

| Provider | Free Tier | Why Not Enough |
|----------|-----------|---------------|
| **Oracle Cloud** | 4 ARM cores, 24GB RAM, 200GB disk | **This is the one** |
| GCP | 1 vCPU, 1GB RAM | ML needs 2-4GB |
| AWS | 1 vCPU, 1GB RAM (12-month trial) | Too small, expires |
| Azure | 1 vCPU, 1GB RAM (12-month trial) | Too small, expires |
| Fly.io | 3x 256MB shared VMs | Too fragmented |
| Railway | $5 free credits/month | Burns through fast |
| Render | Free tier sleeps | ML model reload takes minutes |

### Fallback: Hetzner CAX21 (~$7/month)
4 ARM vCPU, 8GB RAM, 80GB disk at €5.99/month if OCI is unavailable.

## Cost Breakdown (Monthly)

| Item | Cost |
|------|------|
| OCI Compute (4 OCPU, 24GB, 200GB) | $0 |
| OCI Public IP | $0 |
| OCI Network Egress (10TB/month) | $0 |
| DuckDNS subdomain | $0 |
| Caddy auto-HTTPS (Let's Encrypt) | $0 |
| Backblaze B2 backup (first 10GB) | $0 |
| **Total** | **$0/month** |

## Resource Allocation

| Container | Expected RAM | Expected CPU |
|-----------|-------------|-------------|
| immich-machine-learning | 3-4 GB | Burst to 2+ cores |
| immich-server | 500 MB | 0.5 cores |
| database (Immich pgvector) | 1-2 GB | 0.3 cores |
| app-database (PostgreSQL 16) | 200-400 MB | 0.1 cores |
| redis (Valkey 9) | 50-100 MB | 0.05 cores |
| sveltekit-app | 200-400 MB | 0.3 cores |
| **Total** | **~5-7 GB** | **~3-4 cores peak** |

Leaves ~17GB free RAM for OS cache and buffer pool.

---

## Step-by-Step Deployment

### Step 1: Create OCI Free Tier VM

1. Create Oracle Cloud account at [cloud.oracle.com](https://cloud.oracle.com)
   - Requires credit card for verification (will not be charged for Always Free resources)
   - Select your closest home region
2. Create Compute Instance:
   - **Image:** Ubuntu 24.04 (Canonical) — aarch64
   - **Shape:** VM.Standard.A1.Flex
   - **OCPUs:** 4
   - **Memory:** 24 GB
   - **Boot Volume:** 200 GB (click "Specify a custom boot volume size")
   - **Networking:** Create new VCN with public subnet, assign public IPv4
   - **SSH Key:** Upload your public key
3. Note the Public IP address

### Step 2: Server Setup

```bash
# SSH into the server
ssh ubuntu@<PUBLIC_IP>

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
newgrp docker

# Verify
docker compose version

# Create application directory
sudo mkdir -p /opt/eventsnap
sudo chown ubuntu:ubuntu /opt/eventsnap
cd /opt/eventsnap
mkdir -p immich-data immich-db backups scripts

# Add swap (safety net for ML model loading)
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Step 3: OCI Firewall Configuration

**VCN Security List (OCI Console):**
- Navigate: Networking → Virtual Cloud Networks → your VCN → Security Lists
- Add Ingress Rules:
  - `0.0.0.0/0` TCP port **80** (HTTP)
  - `0.0.0.0/0` TCP port **443** (HTTPS)
  - `<YOUR_IP>/32` TCP port **22** (SSH — restrict to your IP)
- **Do NOT** open ports 2283, 3000, 3003, 5434, 5435

**OS-level firewall:**
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### Step 4: Clone and Configure

```bash
cd /opt/eventsnap
git clone <YOUR_REPO_URL> .

# Create production .env
cp .env.example .env

# Generate secure passwords
echo "DB_PASSWORD=$(openssl rand -hex 24)"
echo "APP_DB_PASSWORD=$(openssl rand -hex 24)"
echo "IMMICH_RO_PASS=$(openssl rand -hex 24)"
echo "AUTH_SECRET=$(openssl rand -hex 32)"
```

Edit `.env` with production values:

```ini
# Immich
UPLOAD_LOCATION=/opt/eventsnap/immich-data
DB_DATA_LOCATION=/opt/eventsnap/immich-db
DB_PASSWORD=<generated>
DB_USERNAME=postgres
DB_DATABASE_NAME=immich
IMMICH_VERSION=v1.131.3    # Pin version for stability

# EventSnap App
APP_DB_PASSWORD=<generated>
AUTH_SECRET=<generated>
AUTH_GOOGLE_ID=<your-google-oauth-id>
AUTH_GOOGLE_SECRET=<your-google-oauth-secret>
IMMICH_ADMIN_API_KEY=<fill-after-step-6>
IMMICH_RO_USER=sveltekit_ro
IMMICH_RO_PASS=<generated>
IMMICH_SERVICE_USER_ID=<fill-after-step-6>
```

### Step 5: Create Production Docker Compose Override

Create `docker-compose.prod.yml`:

```yaml
name: eventsnap

services:
  immich-server:
    ports: !override []

  immich-machine-learning:
    ports: !override []
    deploy:
      resources:
        limits:
          memory: 5G
        reservations:
          memory: 2G

  database:
    ports: !override []

  app-database:
    ports: !override []

  sveltekit-app:
    ports: !override []
    environment:
      ORIGIN: https://eventsnap.yourdomain.com
      AUTH_TRUST_HOST: 'true'

  caddy:
    image: caddy:2-alpine
    ports:
      - '80:80'
      - '443:443'
      - '443:443/udp'
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - sveltekit-app
    restart: always

volumes:
  caddy-data:
  caddy-config:
```

Create `Caddyfile`:

```
eventsnap.yourdomain.com {
    reverse_proxy sveltekit-app:3000

    request_body {
        max_size 50MB
    }

    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
    }

    encode gzip zstd
}
```

### Step 6: Deploy

```bash
cd /opt/eventsnap

# Start databases first
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d database redis app-database
sleep 10

# Start Immich (first boot downloads ML models — takes 5-10 min on ARM)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d immich-server immich-machine-learning

# Watch ML logs until "Model loaded" appears
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f immich-machine-learning
# Ctrl+C when ready

# Create Immich admin
curl -X POST http://localhost:2283/api/auth/admin-sign-up \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourdomain.com","password":"<STRONG_PASSWORD>","name":"Admin"}'

# Login and create API key
LOGIN=$(curl -s -X POST http://localhost:2283/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourdomain.com","password":"<STRONG_PASSWORD>"}')
TOKEN=$(echo "$LOGIN" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

API_KEY=$(curl -s -X POST http://localhost:2283/api/api-keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"eventsnap","permissions":["all"]}')
echo "$API_KEY"
# Copy the "secret" value → IMMICH_ADMIN_API_KEY in .env

USER_ID=$(curl -s http://localhost:2283/api/users/me \
  -H "Authorization: Bearer $TOKEN" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "$USER_ID"
# Copy → IMMICH_SERVICE_USER_ID in .env

# Create read-only DB user
docker exec immich_postgres psql -U postgres -d immich -c "
  CREATE ROLE sveltekit_ro WITH LOGIN PASSWORD '<IMMICH_RO_PASS_FROM_ENV>';
  GRANT CONNECT ON DATABASE immich TO sveltekit_ro;
  GRANT USAGE ON SCHEMA public TO sveltekit_ro;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO sveltekit_ro;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO sveltekit_ro;
"

# Build and start SvelteKit app
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build sveltekit-app

# Push app database schema
docker exec eventsnap_app npx drizzle-kit push

# Start reverse proxy
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d caddy
```

### Step 7: Domain + DNS (Cloudflare)

1. Register domain via Cloudflare Registrar (~$10/year for .com)
2. Add A record: `eventsnap.yourdomain.com` → `<OCI_PUBLIC_IP>`
3. Enable Cloudflare Proxy (orange cloud) for DDoS protection
4. SSL/TLS settings:
   - Mode: **Full (Strict)**
   - Always Use HTTPS: **ON**
   - Minimum TLS Version: **1.2**

### Step 8: Verify

```bash
# Health check
curl https://eventsnap.yourdomain.com/api/health

# Expected: {"status":"healthy","services":{"immich":{"status":"healthy"},"ml":{"status":"healthy"}}}
```

---

## Backup Strategy

### Daily Database Backups (cron)

Create `/opt/eventsnap/scripts/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR=/opt/eventsnap/backups
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

# App database
docker exec eventsnap_postgres pg_dump -U app -d app | gzip > "$BACKUP_DIR/app-db-$DATE.sql.gz"

# Immich database (includes face embeddings)
docker exec immich_postgres pg_dump -U postgres -d immich | gzip > "$BACKUP_DIR/immich-db-$DATE.sql.gz"

# Retain last 7 days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete
```

```bash
chmod +x /opt/eventsnap/scripts/backup.sh
crontab -e
# Add: 0 3 * * * /opt/eventsnap/scripts/backup.sh
```

### Photo Backups (offsite, optional)

```bash
# Install rclone
curl https://rclone.org/install.sh | sudo bash
rclone config   # Configure Backblaze B2 (10GB free)
rclone sync /opt/eventsnap/immich-data b2:eventsnap-photos --transfers 4
```

### OCI Boot Volume Snapshots (5 free)

Schedule weekly via OCI Console or CLI.

---

## Production Hardening Checklist

Before going live, these code changes should be made:

- [ ] **Disable dev auth in production** — Gate the Credentials provider in `src/auth.ts` behind `NODE_ENV !== 'production'`
- [ ] **Secure admin endpoints** — Check for admin role (not just logged in) on `/api/admin/*`
- [ ] **Optimize Dockerfile** — Use `npm ci --omit=dev` in production stage
- [ ] **Pin Immich version** — Use specific tag (e.g., `v1.131.3`) instead of `release`
- [ ] **Set ORIGIN env var** — Required by SvelteKit adapter-node for CSRF protection
- [ ] **Remove Docker socket access** — Admin logs endpoint uses `execSync('docker logs')`, which requires socket mount. Replace with file-based log reading or remove endpoint.
- [ ] **Add API key auth** — For service-to-service calls from the main system (bypass session auth)

---

## Limitations

| Limitation | Impact | Mitigation |
|-----------|--------|-----------|
| 200GB storage cap | ~36K photos at 5MB avg | Offload to Backblaze B2 or add OCI block volume |
| Single VM | No redundancy | Daily backups + weekly snapshots |
| ARM architecture | All current images support it | Verify before adding new containers |
| Sequential ML inference | Queues under concurrent load | 15s timeout prevents indefinite waits |
| No photo CDN | Node.js serves photos directly | Add Cloudflare cache headers |

## Scaling Path

1. **Free optimizations:** Cloudflare caching for photos, increase PostgreSQL shared_buffers
2. **$5-15/month:** Hetzner CAX21 (8GB RAM), Backblaze B2 for photos
3. **$30-80/month:** Separate ML worker, managed PostgreSQL, Cloudflare R2 storage
4. **$150+/month:** Kubernetes, horizontal ML scaling, load balancer, DB clusters
