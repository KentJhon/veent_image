import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { IMMICH_API_URL, IMMICH_API_KEY } from '$lib/server/env.js';

interface JobCounts {
	active: number;
	waiting: number;
	paused: number;
	completed: number;
	failed: number;
	delayed: number;
}

interface JobStatus {
	jobCounts: JobCounts;
	queueStatus: { isActive: boolean; isPaused: boolean };
}

/**
 * GET /api/jobs — Returns Immich ML processing job status
 */
export const GET: RequestHandler = async () => {
	try {
		const res = await fetch(`${IMMICH_API_URL}/jobs`, {
			headers: { 'x-api-key': IMMICH_API_KEY },
			signal: AbortSignal.timeout(5000)
		});

		if (!res.ok) {
			return json({ error: 'Failed to fetch job status' }, { status: 502 });
		}

		const data: Record<string, JobStatus> = await res.json();

		const relevant = [
			'thumbnailGeneration',
			'metadataExtraction',
			'smartSearch',
			'faceDetection',
			'facialRecognition'
		];

		const jobs = relevant.map((name) => {
			const job = data[name];
			if (!job) return { name, active: 0, waiting: 0, completed: 0, failed: 0 };
			const jc = job.jobCounts;
			return {
				name,
				active: jc.active,
				waiting: jc.waiting,
				completed: jc.completed,
				failed: jc.failed
			};
		});

		const totalActive = jobs.reduce((s, j) => s + j.active + j.waiting, 0);
		const allDone = totalActive === 0;

		return json({ done: allDone, jobs });
	} catch {
		return json({ error: 'Immich unreachable' }, { status: 502 });
	}
};
