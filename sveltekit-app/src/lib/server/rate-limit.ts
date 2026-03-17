/**
 * Simple in-memory rate limiter.
 * For production, replace with Redis-backed rate limiting.
 */

interface RateLimitEntry {
	count: number;
	resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
	const now = Date.now();
	for (const [key, entry] of store) {
		if (entry.resetAt < now) {
			store.delete(key);
		}
	}
}, 5 * 60 * 1000);

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	resetAt: number;
}

/**
 * Check rate limit for a given key.
 * @param key - Unique identifier (e.g., IP + endpoint)
 * @param maxRequests - Max requests allowed in the window
 * @param windowMs - Time window in milliseconds
 */
export function checkRateLimit(
	key: string,
	maxRequests: number,
	windowMs: number
): RateLimitResult {
	const now = Date.now();
	const entry = store.get(key);

	if (!entry || entry.resetAt < now) {
		store.set(key, { count: 1, resetAt: now + windowMs });
		return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
	}

	entry.count++;

	if (entry.count > maxRequests) {
		return { allowed: false, remaining: 0, resetAt: entry.resetAt };
	}

	return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

/**
 * Get a rate limit key from a request (IP-based).
 */
export function getRateLimitKey(request: Request, endpoint: string): string {
	const ip =
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
		request.headers.get('x-real-ip') ??
		'unknown';
	return `${ip}:${endpoint}`;
}
