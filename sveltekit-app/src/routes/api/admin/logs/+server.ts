import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { execSync } from 'child_process';

/**
 * GET /api/admin/logs?service=immich-server&lines=50
 *
 * Fetch recent Docker container logs.
 * Only works when running on the same host as Docker.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const session = await locals.auth();
	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	const allowedServices: Record<string, string> = {
		'immich-server': 'immich_server',
		'immich-ml': 'immich_machine_learning',
		'immich-db': 'immich_postgres',
		'immich-redis': 'immich_redis'
	};

	const service = url.searchParams.get('service') ?? 'immich-server';
	const lines = Math.min(parseInt(url.searchParams.get('lines') ?? '100'), 500);

	const containerName = allowedServices[service];
	if (!containerName) {
		return error(400, `Invalid service. Allowed: ${Object.keys(allowedServices).join(', ')}`);
	}

	try {
		const output = execSync(`docker logs --tail ${lines} --timestamps ${containerName} 2>&1`, {
			timeout: 10000,
			encoding: 'utf-8',
			maxBuffer: 1024 * 1024
		});

		const logLines = output
			.split('\n')
			.filter((l) => l.trim())
			.map((line) => {
				// Parse timestamp from docker logs format
				const match = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s*(.*)/);
				if (match) {
					return { timestamp: match[1], message: match[2] };
				}
				return { timestamp: '', message: line };
			});

		return json({ service, container: containerName, lines: logLines.length, logs: logLines });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to fetch logs';
		return json({ service, container: containerName, lines: 0, logs: [], error: message });
	}
};
