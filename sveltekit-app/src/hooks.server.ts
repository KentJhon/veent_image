import { handle as authHandle } from './auth.js';
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

const logger: Handle = async ({ event, resolve }) => {
	const method = event.request.method;
	const path = event.url.pathname;
	if (method !== 'GET') {
		console.log(`[hooks] ${method} ${path} Origin: ${event.request.headers.get('origin')} Host: ${event.request.headers.get('host')}`);
	}
	const response = await resolve(event);
	if (method !== 'GET') {
		console.log(`[hooks] ${method} ${path} → ${response.status}`);
	}
	return response;
};

export const handle = sequence(logger, authHandle);
