import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { createEvent, getEvents } from '$lib/server/services/event.service.js';

export const GET: RequestHandler = async () => {
	const events = await getEvents();
	return json(events);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.auth();
	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	const body = await request.json();

	if (!body.name || !body.date) {
		return error(400, 'name and date are required');
	}

	const result = await createEvent({
		name: body.name,
		description: body.description,
		date: new Date(body.date),
		venue: body.venue,
		pricingPerPhoto: body.pricingPerPhoto,
		pricingBundle: body.pricingBundle,
		createdBy: session.user.id
	});

	return json(result, { status: 201 });
};
