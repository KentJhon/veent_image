import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getEventById } from '$lib/server/services/event.service.js';

export const GET: RequestHandler = async ({ params }) => {
	const event = await getEventById(params.eventId);
	if (!event) {
		return error(404, 'Event not found');
	}
	return json(event);
};
