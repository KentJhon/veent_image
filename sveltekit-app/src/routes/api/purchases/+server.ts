import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { createPurchaseIntent, getUserPurchases } from '$lib/server/services/purchase.service.js';

export const GET: RequestHandler = async ({ locals, url }) => {
	const session = await locals.auth();
	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	const eventId = url.searchParams.get('eventId') ?? undefined;
	const result = await getUserPurchases(session.user.id, eventId);
	return json(result);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.auth();
	if (!session?.user?.id) {
		return error(401, 'Sign in to purchase photos');
	}

	const body = await request.json();
	if (!body.eventId || !body.assetIds?.length) {
		return error(400, 'eventId and assetIds are required');
	}

	try {
		const intent = await createPurchaseIntent(session.user.id, body.eventId, body.assetIds);
		return json(intent, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Purchase failed';
		if (message.includes('already been purchased')) {
			return json({ error: message, alreadyPurchased: true }, { status: 409 });
		}
		return error(500, message);
	}
};
