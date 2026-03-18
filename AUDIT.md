# EventSnap — Codebase Audit

**Date**: 2026-03-18
**Scope**: Security, S3 storage, OCR search, auth, upload, Docker config

---

## Critical

### 1. Dev Credentials Provider Always Enabled
- **File**: `sveltekit-app/src/auth.ts:22-48`
- **Issue**: Any email can log in without a password and auto-creates an account. There is no condition guarding this — it runs in all environments.
- **Impact**: Full authentication bypass. Anyone can impersonate any user by knowing their email.
- **Fix**: Wrap in `if (process.env.NODE_ENV !== 'production')` or remove entirely before deploying.

### 2. Command Injection in Logs Endpoint
- **File**: `sveltekit-app/src/routes/api/admin/logs/+server.ts:33`
- **Issue**: `execSync()` interpolates the `lines` query parameter directly into a shell command string. While `containerName` is validated against an allowlist, `lines` is not sanitized.
- **Impact**: Remote code execution for any authenticated user.
- **Fix**: Validate `lines` as a positive integer before use, or use array-based exec.

### 3. No Admin Role Checks on Admin Endpoints
- **Files**: All `sveltekit-app/src/routes/api/admin/*` endpoints
- **Issue**: Endpoints only check `locals.auth()` (is logged in) but never verify an admin role. Any authenticated user can:
  - View Docker container logs
  - View system stats (revenue, user counts, ML health)
  - Clear watermark cache
  - Generate watermark previews
- **Fix**: Add role-based access control. Check for admin role before proceeding.

### 4. No S3 Cleanup on Photo Delete
- **File**: Missing — no `DeleteObjectCommand` in `sveltekit-app/src/lib/server/s3.ts`
- **Issue**: When photos are deleted from Immich (e.g., via `deleteEvent()` in `event.service.ts:156-160`), the corresponding S3 objects are never removed:
  - `originals/{assetId}`
  - `thumbnails/{assetId}`
  - `previews/{assetId}`
- **Impact**: S3 storage grows indefinitely with orphaned files.
- **Fix**: Add a `deleteFromS3()` function and call it when photos/events are deleted.

---

## High

### 5. CSRF Origin Hardcoded in Docker Compose
- **File**: `docker-compose.yml:82`
- **Issue**: `ORIGIN: http://localhost:3000` is hardcoded. SvelteKit uses this env var for CSRF validation. When accessing via Cloudflare tunnel (`*.trycloudflare.com`), POST requests will fail with 403 even though `svelte.config.js:8` lists `https://*.trycloudflare.com` as trusted.
- **Impact**: Uploads and other POST actions fail when accessed via tunnel in Docker deployment.
- **Fix**: Set `ORIGIN` dynamically based on deployment context, or remove the hardcoded value.

### 6. Insecure Session Cookies
- **File**: `sveltekit-app/src/auth.ts:60`
- **Issue**: `useSecureCookies: false` — session cookies are sent without the `Secure` flag, transmitting over plain HTTP.
- **Impact**: Vulnerable to MITM attacks and session hijacking on non-HTTPS connections.
- **Fix**: Set `useSecureCookies: true` in production (requires HTTPS).

### 7. No File Upload Validation
- **File**: `sveltekit-app/src/routes/api/events/[eventId]/upload/+server.ts:40-45`
- **Issue**: No file type validation (any file accepted, not just images) and no file size limit.
- **Impact**: DoS via large file uploads, or malware hosting.
- **Fix**: Validate MIME type (`image/*` only) and enforce a max file size (e.g., 50-100MB).

### 8. LIKE Pattern Special Characters Not Escaped
- **File**: `sveltekit-app/src/lib/server/immich.ts:142-180`
- **Issue**: User-provided query is inserted directly into LIKE patterns without escaping `%` and `_` wildcards. For example, searching `50%` becomes `ILIKE '%50%%'`, matching `501`, `5099`, etc.
- **Fix**: Escape `%`, `_`, and `\` in the query before building the pattern, and add `ESCAPE '\'` to the SQL.

### 9. S3 Connection Errors Crash Requests Instead of Falling Back
- **Files**: `sveltekit-app/src/lib/server/s3.ts:61-66`, `sveltekit-app/src/lib/server/services/photo.service.ts:51-65`
- **Issue**: `getThumbnailFromS3()` and `getFromS3()` only catch `NoSuchKey` / HTTP 404. Connection errors (ECONNREFUSED, ENOTFOUND, timeouts) propagate as unhandled exceptions, returning 500 to the user instead of falling back to Immich.
- **Impact**: If MinIO goes down while S3 is enabled, the entire app breaks — no thumbnails, no downloads.
- **Fix**: Catch all errors in S3 get operations and return `null` to trigger the Immich fallback path.

### 10. No S3 Request Timeout
- **File**: `sveltekit-app/src/lib/server/s3.ts:10-18`
- **Issue**: `S3Client` is created without any timeout configuration. If MinIO hangs (accepts connection but doesn't respond), requests hang indefinitely.
- **Impact**: Under MinIO instability, user requests pile up and exhaust server resources.
- **Fix**: Add `requestHandler` timeout config or use `AbortSignal.timeout()` on individual operations.

---

## Medium

### 11. Docker Ports Exposed with Default Credentials
- **File**: `docker-compose.yml`
- **Issue**: All internal services are exposed to the host:
  - App database: `:5434` (password: `apppassword`)
  - Immich database: `:5435` (password: `postgres`)
  - MinIO S3 API: `:9000` (credentials: `minioadmin/minioadmin`)
  - MinIO Console: `:9001`
  - Immich API: `:2283`
- **Impact**: In production, databases and object storage are directly accessible with known default credentials.
- **Fix**: Remove port mappings for databases and MinIO in production. Use Docker internal networking only.

### 12. Missing Environment Variable Validation
- **File**: `sveltekit-app/src/lib/server/env.ts:1-23`
- **Issue**: Critical variables default to empty strings:
  - `AUTH_SECRET` → `''`
  - `IMMICH_API_KEY` → `''`
  - `APP_DATABASE_URL` → `''`
  - `IMMICH_DB_URL` → `''`
- **Impact**: App starts without errors but fails silently on first use — auth broken, DB connections fail, Immich API calls fail.
- **Fix**: Throw on startup if required vars are missing (similar to how `docker-compose.yml` uses `${VAR:?}`).

### 13. Pagination Total Count Is Wrong
- **File**: `sveltekit-app/src/lib/server/immich.ts:205`
- **Issue**: `total: rows.length` returns the number of rows in the current page (capped at `LIMIT 200`), not the actual total match count.
- **Impact**: UI shows "Found 200 photos" when there may be 500+ matches. No way to know if more results exist.
- **Fix**: Run a separate `SELECT COUNT(DISTINCT a.id)` query, or use `COUNT(*) OVER()` window function.

### 14. S3 Thumbnail Cache Never Invalidated
- **File**: `sveltekit-app/src/lib/server/services/photo.service.ts:51-65`
- **Issue**: Once a raw thumbnail is cached to S3, it is never updated. If watermark settings change (brand name, opacity via env vars), the cached raw image is fine — but if Immich regenerates thumbnails (e.g., after reprocessing), the stale S3 version is served instead.
- **Impact**: Users may see outdated thumbnails after Immich reprocessing.
- **Fix**: Add cache-busting (e.g., include a version/hash in the S3 key) or add a cache invalidation mechanism.

### 15. Double Buffer Copy on Upload
- **File**: `sveltekit-app/src/lib/server/services/photo.service.ts:16,32`
- **Issue**: `const buffer = await file.arrayBuffer()` returns an ArrayBuffer. Then `Buffer.from(buffer)` on line 32 creates a full copy for S3 upload.
- **Impact**: Large photo uploads (e.g., 20MB RAW files) consume 40MB+ of memory per upload.
- **Fix**: Reuse the same Buffer instance or pass the ArrayBuffer directly.

### 16. Fire-and-Forget S3 Failures Are Silent
- **File**: `sveltekit-app/src/lib/server/services/photo.service.ts:31-34`
- **Issue**: S3 upload errors are caught with `.catch()` and only logged to console. No retry logic, no way to detect inconsistency.
- **Impact**: Client receives success, but photo only exists in Immich, not S3. Download will fall back to Immich (slower) with no indication of the gap.
- **Fix**: Consider a retry queue, or at minimum surface S3 failures in the admin stats endpoint.

---

## Low

### 17. No Minimum Query Length for OCR Search
- **File**: `sveltekit-app/src/routes/api/events/[eventId]/text-search/+server.ts:33-40`
- **Issue**: No minimum length check. Searching `"a"` matches nearly everything via `ILIKE '%a%'` and returns up to 200 results.
- **Fix**: Require at least 2 characters.

### 18. word_similarity Threshold Unjustified
- **File**: `sveltekit-app/src/lib/server/immich.ts:156`
- **Issue**: The `word_similarity >= 0.3` threshold is hardcoded with no documentation or empirical justification. For short strings (1-2 chars), this produces many false positives.
- **Fix**: Document the rationale, or make it configurable.

### 19. Confidence Thresholds Borrowed from Face Matching
- **File**: `sveltekit-app/src/routes/(app)/events/[eventId]/my-photos/+page.svelte:150-152`
- **Issue**: The distance thresholds (`< 0.35` = High, `< 0.5` = Good) were designed for cosine distance in face embeddings, not text similarity scores converted via `1 - score`.
- **Fix**: Use separate thresholds for text search results, or label differently (e.g., "Exact match" vs "Partial match").

### 20. Database Connection Pool Never Closed
- **File**: `sveltekit-app/src/lib/server/db/immich-readonly.ts:6-10`
- **Issue**: The Immich PostgreSQL connection pool is created globally but has no graceful shutdown hook. On app restart, connections may linger.
- **Fix**: Add a shutdown handler to call `immichPool.end()`.

### 21. Content-Type Defaults to JPEG for All S3 Objects
- **File**: `sveltekit-app/src/lib/server/s3.ts:53,102`
- **Issue**: If an S3 object is missing the `ContentType` metadata, it defaults to `image/jpeg` even if the original was PNG or WebP.
- **Impact**: Browsers may misinterpret the image format.
- **Fix**: Store content type reliably on upload and validate on retrieval.

---

## Summary

| # | Severity | Issue | Location |
|---|----------|-------|----------|
| 1 | **Critical** | Dev credentials provider always enabled | `auth.ts:22-48` |
| 2 | **Critical** | Command injection in logs endpoint | `api/admin/logs/+server.ts:33` |
| 3 | **Critical** | No admin role checks | `api/admin/*` |
| 4 | **Critical** | No S3 cleanup on photo delete | Missing |
| 5 | **High** | CSRF origin hardcoded | `docker-compose.yml:82` |
| 6 | **High** | Insecure session cookies | `auth.ts:60` |
| 7 | **High** | No file upload validation | `api/.../upload/+server.ts:40` |
| 8 | **High** | LIKE wildcards not escaped | `immich.ts:142-180` |
| 9 | **High** | S3 errors crash instead of fallback | `s3.ts:61-66` |
| 10 | **High** | No S3 request timeout | `s3.ts:10-18` |
| 11 | **Medium** | Docker ports exposed with defaults | `docker-compose.yml` |
| 12 | **Medium** | Missing env var validation | `env.ts:1-23` |
| 13 | **Medium** | Pagination total count wrong | `immich.ts:205` |
| 14 | **Medium** | S3 thumbnail cache never invalidated | `photo.service.ts:51-65` |
| 15 | **Medium** | Double buffer copy on upload | `photo.service.ts:16,32` |
| 16 | **Medium** | Fire-and-forget S3 failures silent | `photo.service.ts:31-34` |
| 17 | **Low** | No minimum query length | `text-search/+server.ts:33` |
| 18 | **Low** | word_similarity threshold unjustified | `immich.ts:156` |
| 19 | **Low** | Confidence thresholds wrong for text | `my-photos/+page.svelte:150` |
| 20 | **Low** | DB pool never closed | `immich-readonly.ts:6-10` |
| 21 | **Low** | Content-type defaults to JPEG | `s3.ts:53,102` |
