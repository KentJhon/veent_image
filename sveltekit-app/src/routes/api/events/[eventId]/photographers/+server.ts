import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import {
	assignPhotographer,
	getEventPhotographers,
	removePhotographer,
	isEventCreator
} from '$lib/server/services/event.service.js';
import { db } from '$lib/server/db/index.js';
import { users } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.auth();
	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	const photographers = await getEventPhotographers(params.eventId);
	return json(photographers);
};

export const POST: RequestHandler = async ({ request, params, locals }) => {
	const session = await locals.auth();
	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	const isCreator = await isEventCreator(params.eventId, session.user.id);
	if (!isCreator) {
		return error(403, 'Only the event creator can assign photographers');
	}

	const body = await request.json();

	// Support both userId and email lookup
	let userId = body.userId;
	if (!userId && body.email) {
		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.email, body.email));
		if (!user) {
			return error(404, 'No user found with that email. They must sign in first.');
		}
		userId = user.id;
	}

	if (!userId) {
		return error(400, 'userId or email is required');
	}

	const result = await assignPhotographer(params.eventId, userId, body.role);
	return json(result, { status: 201 });
};

export const DELETE: RequestHandler = async ({ request, params, locals }) => {
	const session = await locals.auth();
	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	const isCreator = await isEventCreator(params.eventId, session.user.id);
	if (!isCreator) {
		return error(403, 'Only the event creator can remove photographers');
	}

	const body = await request.json();
	if (!body.assignmentId) {
		return error(400, 'assignmentId is required');
	}

	await removePhotographer(body.assignmentId);
	return json({ success: true });
};
