import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { checkMLHealth } from '$lib/server/face-match.js';
import { IMMICH_API_URL, IMMICH_API_KEY } from '$lib/server/env.js';

export const GET: RequestHandler = async () => {
	const checks: Record<string, { status: string; latencyMs?: number }> = {};

	// Check Immich server
	const immichStart = Date.now();
	try {
		const res = await fetch(`${IMMICH_API_URL}/server/ping`, {
			headers: { 'x-api-key': IMMICH_API_KEY },
			signal: AbortSignal.timeout(5000)
		});
		checks.immich = {
			status: res.ok ? 'healthy' : 'unhealthy',
			latencyMs: Date.now() - immichStart
		};
	} catch {
		checks.immich = { status: 'unreachable', latencyMs: Date.now() - immichStart };
	}

	// Check ML service
	const mlStart = Date.now();
	const mlHealthy = await checkMLHealth();
	checks.ml = {
		status: mlHealthy ? 'healthy' : 'unreachable',
		latencyMs: Date.now() - mlStart
	};

	const allHealthy = Object.values(checks).every((c) => c.status === 'healthy');

	return json(
		{ status: allHealthy ? 'healthy' : 'degraded', services: checks },
		{ status: allHealthy ? 200 : 503 }
	);
};
