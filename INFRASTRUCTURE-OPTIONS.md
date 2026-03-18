# EventSnap — Infrastructure Options & Performance Estimates

## How Face Matching Works (important context)

When a user searches for their face across event photos, the system does **NOT** run ML on every photo. Face embeddings are pre-computed during upload and stored in pgvector. The search flow is:

1. **Selfie preprocessing** — sharp resizes to max 1024px, JPEG conversion, EXIF rotation
2. **ML inference on the selfie** — ArcFace extracts a 512-dim embedding (this is the bottleneck)
3. **pgvector cosine similarity query** — compares 1 vector against all pre-computed face vectors in the database (near-instant)

The wait time is almost entirely step 2 (selfie embedding extraction).

---

## DigitalOcean Options

### Option A: Basic Droplet — $24/month
**2 vCPU (shared), 4GB RAM, 80GB SSD**

| Step | Time |
|------|------|
| Selfie preprocessing (sharp) | ~0.5s |
| ML embedding extraction | ~12-20s |
| pgvector search (1000 images) | ~0.2s |
| **Total face match time** | **~13-21s** |

- Shared CPU throttles during ML inference
- 4GB is tight — needs swap, ML model loading is slow on cold start (~60s)
- Can store ~14K photos at 5MB avg
- 1 user at a time for face matching, others queue
- Suitable for: small private events, development/staging

---

### Option B: Basic Droplet — $48/month (Best Value)
**4 vCPU (shared), 8GB RAM, 160GB SSD**

| Step | Time |
|------|------|
| Selfie preprocessing (sharp) | ~0.3s |
| ML embedding extraction | ~6-10s |
| pgvector search (1000 images) | ~0.1s |
| **Total face match time** | **~7-11s** |

- Comfortable RAM, no swap needed
- ML models stay loaded in memory between requests
- Can store ~30K photos
- 2-3 concurrent face match users before noticeable slowdown
- Suitable for: small-to-medium events (up to ~200 attendees)

---

### Option C: Premium AMD — $56/month
**4 vCPU (dedicated), 8GB RAM, 160GB SSD**

| Step | Time |
|------|------|
| Selfie preprocessing (sharp) | ~0.2s |
| ML embedding extraction | ~4-7s |
| pgvector search (1000 images) | ~0.1s |
| **Total face match time** | **~5-8s** |

- Dedicated CPU — consistent performance, no noisy neighbor throttling
- Same RAM as Option B but faster per-core throughput
- 3-5 concurrent face match users comfortably
- Suitable for: medium events with simultaneous attendees searching

---

### Option D: Premium AMD — $112/month (Production)
**8 vCPU (dedicated), 16GB RAM, 320GB SSD**

| Step | Time |
|------|------|
| Selfie preprocessing (sharp) | ~0.1s |
| ML embedding extraction | ~3-5s |
| pgvector search (1000 images) | ~0.05s |
| **Total face match time** | **~3-5s** |

- Large PostgreSQL buffer pool — pgvector queries fully cached
- Can store ~60K photos
- 10-15 concurrent face match users
- Suitable for: production deployment, large events (500+ attendees)

---

### Option E: Self-Hosted (Your Own PC) — $0/month
**Uses your PC's full CPU + RAM + disk**

| Step | Time |
|------|------|
| Selfie preprocessing (sharp) | ~0.1s |
| ML embedding extraction | ~2-5s |
| pgvector search (1000 images) | ~0.05s |
| **Total face match time** | **~2-5s** |

- Fastest option (modern PC typically has 16-32GB RAM, 4-8+ cores)
- Unlimited photo storage (limited by disk)
- 10+ concurrent users
- Expose via Cloudflare Tunnel for public HTTPS access (free)
- Downside: PC must stay on, shares resources with other apps, no redundancy
- Suitable for: testing, demos, small deployments

---

## Summary Table

| Option | Monthly | Face Match (1000 imgs) | Concurrent Users | Photo Capacity | Best For |
|--------|---------|----------------------|-------------------|----------------|----------|
| A — Basic 2vCPU/4GB | $24 | ~13-21s | 1 | ~14K | Staging |
| B — Basic 4vCPU/8GB | $48 | ~7-11s | 2-3 | ~30K | Small events |
| C — Premium 4vCPU/8GB | $56 | ~5-8s | 3-5 | ~30K | Medium events |
| D — Premium 8vCPU/16GB | $112 | ~3-5s | 10-15 | ~60K | Production |
| E — Self-hosted PC | $0 | ~2-5s | 10+ | Unlimited | Testing/demos |

---

## What Uses the RAM

| Component | RAM Usage |
|-----------|----------|
| Immich ML (ArcFace + RetinaFace models) | 2-3 GB |
| Immich PostgreSQL (pgvector embeddings) | 500MB-2 GB |
| Immich Server | 300-500 MB |
| SvelteKit App | 100-200 MB |
| App PostgreSQL | 100-200 MB |
| Redis/Valkey | 50 MB |
| **Total baseline** | **~3.5-6 GB** |

The ML service is the primary resource consumer. Everything else is lightweight.

---

## Free Alternative: Oracle Cloud Always Free

If DigitalOcean cost is a concern, Oracle Cloud offers an always-free tier (not a trial) with 4 ARM cores, 24GB RAM, and 200GB disk — enough to run the entire stack. Requires credit card for verification but will not be charged. See `DEPLOYMENT-PLAN.md` for full setup instructions.

---

## Scaling Notes

- **Photo upload processing** (face detection on new photos) is separate from face matching. Immich processes uploads in a background queue. With 1000 photos, initial processing takes ~30-60 minutes on Option B.
- **pgvector performance** scales well. Even with 10K+ face embeddings, cosine similarity search with an index returns results in <100ms.
- **If you strip out Immich ML** and use an external face matching API, the entire stack runs comfortably on a 2GB machine ($12/month).
- **Additional storage** can be attached via DigitalOcean Block Storage at $0.10/GB/month.
